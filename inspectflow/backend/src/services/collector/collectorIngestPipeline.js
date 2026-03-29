/**
 * Main IoT telemetry ingest pipeline.
 * BL-120 (INT-IOT-v1)
 *
 * Steps per frame:
 *   1. Resolve protocol adapter
 *   2. parseFrame → canonical readings[]
 *   3. For each reading: resolveTagMapping → OOT check → createSingleValueRecord
 *   4. If OOT: enqueue to collector_oot_queue
 *   5. Write collector_runs row
 *
 * Idempotency: each reading builds an idempotency key from
 *   collectorId + deviceId + tagAddress + readingTimestamp
 * Duplicate keys (same key seen within the same run) are counted as skips.
 */

import { transaction, pool } from "../../db.js";
import { resolveAdapter } from "./adapters/adapterRegistry.js";
import { resolveTagMapping } from "./collectorTagMapper.js";
import { enqueue as ootEnqueue } from "./collectorOotQueue.js";
import { writeCollectorRun } from "./collectorRunWriter.js";
import { createSingleValueRecord, getSystemUserId } from "./collectorRecordService.js";

/**
 * @param {{
 *   collectorId: number,
 *   sourceProtocol: string,
 *   rawInput: unknown,
 *   triggerMode?: 'push'|'scheduled'|'manual'
 * }}
 * @returns {Promise<{
 *   ok: boolean,
 *   runId: number|null,
 *   totalReadings: number,
 *   insertedCount: number,
 *   ootCount: number,
 *   failedCount: number,
 *   errors: string[]
 * }>}
 */
export async function ingestTelemetryFrame({
  collectorId,
  sourceProtocol,
  rawInput,
  triggerMode = "push"
}) {
  // Step 1: resolve adapter
  let adapter;
  try {
    adapter = resolveAdapter(sourceProtocol);
  } catch (_err) {
    const run = await writeCollectorRun(pool, {
      collectorId,
      sourceProtocol,
      triggerMode,
      status: "error",
      totalReadings: 0,
      insertedCount: 0,
      ootCount: 0,
      failedCount: 0,
      errors: [{ code: "unknown_protocol", protocol: sourceProtocol }]
    });
    return {
      ok: false,
      runId: run?.id ?? null,
      totalReadings: 0,
      insertedCount: 0,
      ootCount: 0,
      failedCount: 0,
      errors: ["unknown_protocol"]
    };
  }

  // Step 2: parse frame
  const parsed = adapter.parseFrame(rawInput);
  if (!parsed.ok || parsed.readings.length === 0) {
    const run = await writeCollectorRun(pool, {
      collectorId,
      sourceProtocol,
      triggerMode,
      status: "error",
      totalReadings: 0,
      insertedCount: 0,
      ootCount: 0,
      failedCount: 0,
      errors: parsed.errors.map((e) => ({ code: "adapter_parse_error", detail: e }))
    });
    return {
      ok: false,
      runId: run?.id ?? null,
      totalReadings: 0,
      insertedCount: 0,
      ootCount: 0,
      failedCount: parsed.errors.length,
      errors: parsed.errors
    };
  }

  // Step 3+: process each reading
  let systemUserId;
  try {
    systemUserId = await getSystemUserId(pool);
  } catch (err) {
    return { ok: false, runId: null, totalReadings: 0, insertedCount: 0, ootCount: 0, failedCount: 0, errors: [err.message] };
  }

  const totalReadings = parsed.readings.length;
  let insertedCount = 0;
  let ootCount = 0;
  let failedCount = 0;
  const runErrors = [];

  // Track idempotency within this frame (same key = skip)
  const seenKeys = new Set();

  for (const reading of parsed.readings) {
    const idempKey = `${collectorId}|${reading.deviceId}|${reading.tagName}|${reading.timestamp}`;
    if (seenKeys.has(idempKey)) {
      // Duplicate within this frame — skip silently
      continue;
    }
    seenKeys.add(idempKey);

    try {
      const result = await transaction(async (client) => {
        // Resolve tag mapping
        const mapping = await resolveTagMapping(client, {
          collectorId,
          deviceId: reading.deviceId,
          tagAddress: reading.tagName
        });
        if (!mapping) {
          return { skipped: true, reason: `unresolvable_tag: ${reading.deviceId}/${reading.tagName}` };
        }

        // Validate job is open
        const { rows: jobRows } = await client.query(
          "SELECT status, qty FROM jobs WHERE id=$1 FOR UPDATE",
          [mapping.jobId]
        );
        const job = jobRows[0];
        if (!job || !["open", "draft"].includes(job.status)) {
          return { skipped: true, reason: `job_not_open: ${mapping.jobId}` };
        }

        // OOT check
        const { nominal, tol_plus, tol_minus } = mapping;
        const isOot =
          nominal != null && tol_plus != null && tol_minus != null &&
          (reading.value > nominal + tol_plus || reading.value < nominal - tol_minus);

        // Create record
        const { id: recordId } = await createSingleValueRecord(client, {
          jobId: mapping.jobId,
          partId: mapping.partId,
          operationId: mapping.operationId,
          lot: mapping.lot,
          qty: job.qty,
          operatorUserId: systemUserId,
          dimensionId: mapping.dimensionId,
          pieceNumber: mapping.pieceNumber,
          value: reading.value,
          isOot,
          comment: isOot ? `Auto-submitted OOT reading from collector ${collectorId}` : null
        });

        // If OOT, queue for acknowledgment
        let ootEntry = null;
        if (isOot) {
          ootEntry = await ootEnqueue(client, {
            runId: null, // will be backfilled after run row is written
            collectorId,
            recordId,
            jobId: mapping.jobId,
            dimensionId: mapping.dimensionId,
            pieceNumber: mapping.pieceNumber,
            measuredValue: reading.value,
            nominal,
            tolPlus: tol_plus,
            tolMinus: tol_minus,
            unit: mapping.unitOverride ?? reading.unit ?? mapping.unit,
            deviceId: reading.deviceId,
            tagAddress: reading.tagName,
            readingTimestamp: reading.timestamp
          });
        }

        return { recordId, isOot, ootEntry };
      });

      if (result.skipped) {
        failedCount++;
        runErrors.push({ code: result.reason });
      } else {
        insertedCount++;
        if (result.isOot) ootCount++;
      }
    } catch (err) {
      failedCount++;
      runErrors.push({ code: "insert_error", detail: err.message });
    }
  }

  const overallStatus =
    failedCount === 0 ? "success"
    : insertedCount === 0 ? "error"
    : "partial";

  const run = await writeCollectorRun(pool, {
    collectorId,
    sourceProtocol,
    triggerMode,
    status: overallStatus,
    totalReadings,
    insertedCount,
    ootCount,
    failedCount,
    summary: { adapterErrors: parsed.errors },
    errors: runErrors.length ? runErrors : undefined
  });

  return {
    ok: overallStatus !== "error",
    runId: run?.id ?? null,
    totalReadings,
    insertedCount,
    ootCount,
    failedCount,
    errors: runErrors.map((e) => e.code ?? JSON.stringify(e))
  };
}

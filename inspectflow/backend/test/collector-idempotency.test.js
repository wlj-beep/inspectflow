/**
 * Idempotency tests for the collector ingest pipeline.
 * BL-120 (INT-IOT-v1)
 *
 * Tests cover:
 *   - Within-frame dedup: same reading appearing twice in one frame is inserted only once
 *   - Multi-reading frame: distinct readings are all inserted
 *   - Partial frame: one valid + one duplicate → only 1 inserted, totalReadings=2
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { query } from "../src/db.js";
import { ingestTelemetryFrame } from "../src/services/collector/collectorIngestPipeline.js";

const state = {
  partIds: [],
  operationIds: [],
  dimensionIds: [],
  jobIds: [],
  collectorIds: [],
  tagMappingIds: [],
  recordIds: [],
  runIds: []
};

// ---- Seed helpers (shared with pipeline test pattern) ----

async function seedPart() {
  const id = `P-IDEM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await query(
    "INSERT INTO parts (id, description) VALUES ($1, $2)",
    [id, "Idempotency test part"]
  );
  state.partIds.push(id);
  return id;
}

async function seedOperation(partId) {
  const { rows } = await query(
    "INSERT INTO operations (part_id, op_number, label) VALUES ($1, $2, $3) RETURNING id",
    [partId, `OP-IDEM-${Date.now()}`, "Idempotency test op"]
  );
  const id = rows[0].id;
  state.operationIds.push(id);
  return id;
}

async function seedDimension(operationId) {
  const { rows } = await query(
    `INSERT INTO dimensions
       (operation_id, name, nominal, tol_plus, tol_minus, unit, sampling, input_mode)
     VALUES ($1, $2, 10.0, 0.5, 0.5, 'mm', '100pct', 'single')
     RETURNING id`,
    [operationId, `Dim-Idem-${Date.now()}`]
  );
  const id = rows[0].id;
  state.dimensionIds.push(id);
  return id;
}

async function seedJob(partId, operationId) {
  const id = `J-IDEM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await query(
    "INSERT INTO jobs (id, part_id, operation_id, lot, qty, status) VALUES ($1,$2,$3,$4,$5,$6)",
    [id, partId, operationId, "LOT-IDEM", 5, "open"]
  );
  state.jobIds.push(id);
  return id;
}

async function seedCollectorConfig(protocol = "opc_ua") {
  const { rows } = await query(
    `INSERT INTO collector_configurations (name, source_protocol)
     VALUES ($1, $2) RETURNING id`,
    [`cfg-idem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, protocol]
  );
  const id = rows[0].id;
  state.collectorIds.push(id);
  return id;
}

async function seedTagMapping(collectorId, dimensionId, jobId, tagAddress = "ns=2;s=X") {
  const { rows } = await query(
    `INSERT INTO collector_tag_mappings
       (collector_id, device_id, tag_address, dimension_id, job_id, piece_number)
     VALUES ($1,'CNC-01',$2,$3,$4,1) RETURNING id`,
    [collectorId, tagAddress, dimensionId, jobId]
  );
  const id = rows[0].id;
  state.tagMappingIds.push(id);
  return id;
}

async function cleanup() {
  // OOT queue (no OOT readings in these tests, but just in case)
  for (const jobId of state.jobIds) {
    const { rows } = await query(
      "SELECT id FROM collector_oot_queue WHERE job_id=$1", [jobId]
    );
    for (const row of rows) {
      await query("DELETE FROM collector_oot_audit WHERE oot_queue_id=$1", [row.id]);
      await query("DELETE FROM collector_oot_queue WHERE id=$1", [row.id]);
    }
  }

  // Delete record_values/snapshots/records by job_id first (handles untracked records from failed tests)
  for (const jobId of state.jobIds) {
    const { rows: recRows } = await query("SELECT id FROM records WHERE job_id=$1", [jobId]);
    for (const rec of recRows) {
      await query("DELETE FROM record_values WHERE record_id=$1", [rec.id]);
      await query("DELETE FROM record_dimension_snapshots WHERE record_id=$1", [rec.id]);
    }
    await query("DELETE FROM records WHERE job_id=$1", [jobId]);
  }
  state.recordIds.length = 0;

  for (const id of state.runIds) {
    await query("DELETE FROM collector_runs WHERE id=$1", [id]);
  }
  state.runIds.length = 0;

  for (const id of state.tagMappingIds) {
    await query("DELETE FROM collector_tag_mappings WHERE id=$1", [id]);
  }
  state.tagMappingIds.length = 0;

  for (const id of state.collectorIds) {
    await query("DELETE FROM collector_configurations WHERE id=$1", [id]);
  }
  state.collectorIds.length = 0;

  // Dimensions after record_values are cleared
  for (const id of state.dimensionIds) {
    await query("DELETE FROM dimensions WHERE id=$1", [id]);
  }
  state.dimensionIds.length = 0;

  for (const id of state.jobIds) {
    await query("DELETE FROM jobs WHERE id=$1", [id]);
  }
  state.jobIds.length = 0;

  for (const id of state.operationIds) {
    await query("DELETE FROM operations WHERE id=$1", [id]);
  }
  state.operationIds.length = 0;

  for (const id of state.partIds) {
    await query("DELETE FROM parts WHERE id=$1", [id]);
  }
  state.partIds.length = 0;
}

// ---- Tests ----

describe("Collector ingest pipeline idempotency (BL-120)", () => {
  let collectorId;
  let jobId;
  const TIMESTAMP = "2026-03-27T10:00:00.000Z";

  beforeEach(async () => {
    const partId = await seedPart();
    const operationId = await seedOperation(partId);
    const dimensionId = await seedDimension(operationId);
    jobId = await seedJob(partId, operationId);
    collectorId = await seedCollectorConfig();
    await seedTagMapping(collectorId, dimensionId, jobId);
  });

  afterEach(cleanup);

  it("same reading twice in one frame → only one record inserted (within-frame dedup)", async () => {
    // OPC-UA multi-reading frame with exact duplicate
    const result = await ingestTelemetryFrame({
      collectorId,
      sourceProtocol: "opc_ua",
      rawInput: {
        deviceId: "CNC-01",
        readings: [
          { nodeId: "ns=2;s=X", value: 10.1, unit: "mm", timestamp: TIMESTAMP, quality: "good" },
          { nodeId: "ns=2;s=X", value: 10.1, unit: "mm", timestamp: TIMESTAMP, quality: "good" }
        ]
      },
      triggerMode: "manual"
    });

    state.runIds.push(result.runId);
    // totalReadings counts raw adapter output (2), but deduplicated to 1 insert
    expect(result.totalReadings).toBe(2);
    expect(result.insertedCount).toBe(1);
    expect(result.failedCount).toBe(0);

    // Exactly one record_values row for this job
    const { rows: recRows } = await query(
      "SELECT id FROM records WHERE job_id=$1", [jobId]
    );
    expect(recRows.length).toBe(1);
    state.recordIds.push(...recRows.map((r) => r.id));

    const { rows: valRows } = await query(
      "SELECT record_id FROM record_values WHERE record_id=$1", [recRows[0].id]
    );
    expect(valRows.length).toBe(1);
  });

  it("two distinct readings in one frame → two records inserted", async () => {
    // Add a second tag mapping for a different tag
    const partId2 = await seedPart();
    const opId2 = await seedOperation(partId2);
    const dimId2 = await seedDimension(opId2);
    const jobId2 = await seedJob(partId2, opId2);
    await seedTagMapping(collectorId, dimId2, jobId2, "ns=2;s=Y");

    const result = await ingestTelemetryFrame({
      collectorId,
      sourceProtocol: "opc_ua",
      rawInput: {
        deviceId: "CNC-01",
        readings: [
          { nodeId: "ns=2;s=X", value: 10.1, unit: "mm", timestamp: TIMESTAMP, quality: "good" },
          { nodeId: "ns=2;s=Y", value: 9.8, unit: "mm", timestamp: TIMESTAMP, quality: "good" }
        ]
      },
      triggerMode: "manual"
    });

    state.runIds.push(result.runId);
    expect(result.totalReadings).toBe(2);
    expect(result.insertedCount).toBe(2);

    const { rows: r1 } = await query("SELECT id FROM records WHERE job_id=$1", [jobId]);
    const { rows: r2 } = await query("SELECT id FROM records WHERE job_id=$1", [jobId2]);
    expect(r1.length).toBe(1);
    expect(r2.length).toBe(1);
    state.recordIds.push(r1[0].id, r2[0].id);
  });

  it("partial frame: one valid + one duplicate (same key) → 1 inserted, totalReadings=2", async () => {
    const ts = new Date().toISOString();

    const result = await ingestTelemetryFrame({
      collectorId,
      sourceProtocol: "opc_ua",
      rawInput: {
        deviceId: "CNC-01",
        readings: [
          { nodeId: "ns=2;s=X", value: 10.0, unit: "mm", timestamp: ts, quality: "good" },
          { nodeId: "ns=2;s=X", value: 10.0, unit: "mm", timestamp: ts, quality: "good" }  // dup
        ]
      },
      triggerMode: "push"
    });

    state.runIds.push(result.runId);
    expect(result.ok).toBe(true);
    expect(result.totalReadings).toBe(2);
    expect(result.insertedCount).toBe(1);

    const { rows } = await query(
      "SELECT record_id FROM record_values WHERE record_id IN (SELECT id FROM records WHERE job_id=$1)",
      [jobId]
    );
    expect(rows.length).toBe(1);

    const { rows: recRows } = await query("SELECT id FROM records WHERE job_id=$1", [jobId]);
    state.recordIds.push(...recRows.map((r) => r.id));
  });

  it("TCP frame: same reading sent twice in a single multi-line payload deduped", async () => {
    // Add a TCP collector with a mapping for the same tag as this test's dimension
    const tcpCollectorId = await seedCollectorConfig();
    // We need a new part/op/dim/job for the TCP tag to avoid job_id collision
    const pId = await seedPart();
    const oId = await seedOperation(pId);
    const dId = await seedDimension(oId);
    const jId = await seedJob(pId, oId);
    await seedTagMapping(tcpCollectorId, dId, jId, "BORE");

    // Update protocol to tcp
    await query("UPDATE collector_configurations SET source_protocol='tcp' WHERE id=$1", [tcpCollectorId]);

    const ts = Date.now();
    const result = await ingestTelemetryFrame({
      collectorId: tcpCollectorId,
      sourceProtocol: "tcp",
      rawInput: [
        `device_id=CNC-01|tag=BORE|value=10.0|unit=mm|ts=${ts}`,
        `device_id=CNC-01|tag=BORE|value=10.0|unit=mm|ts=${ts}`   // exact dup
      ].join("\n"),
      triggerMode: "push"
    });

    state.runIds.push(result.runId);
    expect(result.ok).toBe(true);
    expect(result.insertedCount).toBe(1);

    const { rows: recRows } = await query("SELECT id FROM records WHERE job_id=$1", [jId]);
    expect(recRows.length).toBe(1);
    state.recordIds.push(...recRows.map((r) => r.id));
  });
});

import { buildExternalEntityKey } from "../idempotency/idempotencyKey.js";
import { validateAndNormalizeCanonicalEnvelope } from "./canonicalEnvelope.js";

const KNOWN_RESULT_FLAGS = new Set(["PASS", "FAIL"]);

function canonicalKey(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toCanonicalRecord(input) {
  const record = {};
  for (const [rawKey, value] of Object.entries(input || {})) {
    record[canonicalKey(rawKey)] = value;
  }
  return record;
}

function first(record, keys) {
  for (const key of keys) {
    const value = record[canonicalKey(key)];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

function parsePositiveInteger(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function parseOptionalBoolean(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return undefined;
  const text = String(raw).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(text)) return true;
  if (["false", "0", "no", "n"].includes(text)) return false;
  return undefined;
}

function normalizeMeasurementValue(raw) {
  if (raw === undefined || raw === null) return "";
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  const text = String(raw).trim();
  if (!text) return "";
  const upper = text.toUpperCase();
  if (KNOWN_RESULT_FLAGS.has(upper)) return upper;
  return text;
}

function normalizeToolList(raw) {
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v || "").trim()).filter(Boolean);
  }
  const text = String(raw ?? "").trim();
  if (!text) return [];
  return text
    .split(/[;|,]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizeExternalId(raw) {
  const value = String(raw ?? "").trim();
  return value || null;
}

function buildSourceRef(entry) {
  const parts = [
    entry.recordKey ? `record:${entry.recordKey}` : null,
    entry.jobId ? `job:${entry.jobId}` : null,
    entry.operationId ? `operation_id:${entry.operationId}` : null,
    entry.operationRef ? `operation_ref:${entry.operationRef}` : null,
    entry.dimensionId ? `dimension_id:${entry.dimensionId}` : null,
    entry.dimensionName ? `dimension:${entry.dimensionName}` : null,
    entry.pieceNumber ? `piece:${entry.pieceNumber}` : null
  ].filter(Boolean);
  return parts.length ? parts.join("|") : null;
}

function deriveBatchExternalId(payload, mapped = {}) {
  const topContext = normalizeContext(payload || {});
  if (topContext.recordKey) return topContext.recordKey;

  const explicit = normalizeExternalId(
    payload?.batchKey
    || payload?.batch_key
    || payload?.recordKey
    || payload?.record_key
    || payload?.runId
    || payload?.run_id
    || payload?.inspectionId
    || payload?.inspection_id
  );
  if (explicit) return explicit;

  const recordKeys = new Set([
    ...(mapped.accepted || []).map((row) => normalizeExternalId(row?.record_key)),
    ...(mapped.rejected || []).map((row) => normalizeExternalId(row?.recordKey))
  ].filter(Boolean));
  if (recordKeys.size === 1) {
    return Array.from(recordKeys)[0];
  }

  return null;
}

function normalizeContext(input) {
  const record = toCanonicalRecord(input || {});
  return {
    recordKey: String(first(record, ["record_key", "batch_key", "group_key", "run_id", "inspection_id"]) || "").trim() || null,
    jobId: String(first(record, ["job_id", "job", "job_number", "work_order", "workorder"]) || "").trim() || null,
    partId: String(first(record, ["part_id", "part", "part_number"]) || "").trim() || null,
    partRevision: String(first(record, ["part_revision", "part_rev", "revision"]) || "A").trim() || "A",
    operationId: parsePositiveInteger(first(record, ["operation_id", "op_id"])),
    operationRef: String(first(record, ["operation_ref", "op_number", "operation", "op"]) || "").trim() || null,
    lot: String(first(record, ["lot", "lot_number"]) || "").trim() || null,
    qty: parsePositiveInteger(first(record, ["qty", "quantity"])),
    operatorUserId: parsePositiveInteger(first(record, ["operator_user_id", "user_id", "operator_id"])),
    status: String(first(record, ["status", "record_status"]) || "").trim() || null,
    comment: String(first(record, ["comment", "note", "notes"]) || "").trim() || null
  };
}

function normalizeMeasurementEntry(input, context = {}) {
  const record = toCanonicalRecord(input || {});
  const resultFlagRaw = String(first(record, ["result", "outcome", "status"]) || "").trim().toUpperCase();
  const resultFlag = KNOWN_RESULT_FLAGS.has(resultFlagRaw) ? resultFlagRaw : null;

  const valueRaw = first(record, ["actual", "measured_value", "value", "measurement", "measured", "result"]);
  const value = normalizeMeasurementValue(valueRaw);
  const missingReason = String(first(record, ["missing_reason", "reason", "failure_reason", "missing", "error_reason"]) || "").trim();
  const isOotRaw = parseOptionalBoolean(first(record, ["is_oot", "out_of_tolerance", "oot", "out_of_spec"]));
  const isOot = isOotRaw !== undefined ? isOotRaw : (resultFlag === "FAIL" ? true : resultFlag === "PASS" ? false : undefined);

  const toolItNums = normalizeToolList(first(record, ["tool_it_nums", "tool_it_num", "tool_it", "it_num", "tool", "gage", "gauge", "instrument"]));

  return {
    recordKey: String(first(record, ["record_key", "batch_key", "group_key", "run_id", "inspection_id"]) || context.recordKey || "").trim() || null,
    jobId: String(first(record, ["job_id", "job", "job_number", "work_order", "workorder"]) || context.jobId || "").trim() || null,
    partId: String(first(record, ["part_id", "part", "part_number"]) || context.partId || "").trim() || null,
    partRevision: String(first(record, ["part_revision", "part_rev", "revision"]) || context.partRevision || "A").trim() || "A",
    operationId: parsePositiveInteger(first(record, ["operation_id", "op_id"])) || context.operationId || null,
    operationRef: String(first(record, ["operation_ref", "op_number", "operation", "op"]) || context.operationRef || "").trim() || null,
    lot: String(first(record, ["lot", "lot_number"]) || context.lot || "").trim() || null,
    qty: parsePositiveInteger(first(record, ["qty", "quantity"])) || context.qty || null,
    operatorUserId: parsePositiveInteger(first(record, ["operator_user_id", "user_id", "operator_id"])) || context.operatorUserId || null,
    status: String(first(record, ["status", "record_status"]) || context.status || "").trim() || null,
    comment: String(first(record, ["comment", "note", "notes"]) || context.comment || "").trim() || null,
    dimensionId: parsePositiveInteger(first(record, ["dimension_id", "dim_id"])),
    dimensionName: String(first(record, ["dimension_name", "dimension", "feature", "characteristic", "char", "name"]) || "").trim(),
    pieceNumber: parsePositiveInteger(first(record, ["piece_number", "piece", "piece_no", "sample", "sample_number", "part_piece", "piece_index", "index", "seq", "sequence"])),
    value,
    isOot,
    missingReason,
    ncNum: String(first(record, ["nc_num", "nc", "nc_number"]) || "").trim() || null,
    details: String(first(record, ["details", "missing_details", "notes"]) || "").trim() || null,
    toolItNums
  };
}

function mapMeasurements(payload) {
  const accepted = [];
  const rejected = [];
  let line = 1;

  const topContext = normalizeContext(payload || {});
  const records = Array.isArray(payload?.records) ? payload.records
    : Array.isArray(payload?.items) ? payload.items
      : null;
  const flatResults = Array.isArray(payload?.results) ? payload.results
    : Array.isArray(payload?.measurements) ? payload.measurements
      : Array.isArray(payload?.rows) ? payload.rows
        : null;

  const pushEntry = (entry) => {
    const errors = [];
    if (!entry.jobId) errors.push("missing_job_id");
    if (!entry.operationId && !entry.operationRef) errors.push("missing_operation_ref");
    if (!entry.dimensionId && !entry.dimensionName) errors.push("missing_dimension_name");
    if (!entry.pieceNumber) errors.push("missing_piece_number");
    if (!entry.value && !entry.missingReason) errors.push("missing_value_or_reason");

    if (errors.length > 0) {
      rejected.push({
        line,
        errors,
        recordKey: entry.recordKey,
        jobId: entry.jobId,
        operationRef: entry.operationRef,
        dimensionName: entry.dimensionName || null,
        pieceNumber: entry.pieceNumber,
        sourceRef: buildSourceRef(entry)
      });
    } else {
      accepted.push({
        record_key: entry.recordKey,
        job_id: entry.jobId,
        part_id: entry.partId,
        part_revision: entry.partRevision,
        operation_id: entry.operationId,
        operation_ref: entry.operationRef,
        lot: entry.lot,
        qty: entry.qty,
        operator_user_id: entry.operatorUserId,
        status: entry.status,
        comment: entry.comment,
        dimension_id: entry.dimensionId,
        dimension_name: entry.dimensionName,
        piece_number: entry.pieceNumber,
        value: entry.value,
        is_oot: entry.isOot,
        missing_reason: entry.missingReason,
        nc_num: entry.ncNum,
        details: entry.details,
        tool_it_nums: entry.toolItNums.join("|")
      });
    }
    line += 1;
  };

  if (Array.isArray(records)) {
    for (const record of records) {
      const context = { ...topContext, ...normalizeContext(record || {}) };
      const values = Array.isArray(record?.values) ? record.values
        : Array.isArray(record?.measurements) ? record.measurements
          : Array.isArray(record?.results) ? record.results
            : null;
      if (Array.isArray(values)) {
        for (const value of values) {
          pushEntry(normalizeMeasurementEntry(value, context));
        }
      } else {
        pushEntry(normalizeMeasurementEntry(record, context));
      }
    }
    return { accepted, rejected, total: line - 1 };
  }

  if (Array.isArray(flatResults)) {
    for (const result of flatResults) {
      pushEntry(normalizeMeasurementEntry(result, topContext));
    }
    return { accepted, rejected, total: line - 1 };
  }

  return { accepted, rejected, total: 0 };
}

export function mapMetrologyPayloadToMeasurementRows(payload) {
  return mapMeasurements(payload);
}

export function adaptMetrologyPayload({
  payload,
  sourceType,
  triggerMode = "manual",
  integrationId = null
}) {
  const mapped = mapMeasurements(payload);
  const batchExternalId = deriveBatchExternalId(payload, mapped);

  const externalKey = buildExternalEntityKey({
    importType: "measurements",
    entityType: "batch",
    externalId: batchExternalId
  });

  if (externalKey) {
    validateAndNormalizeCanonicalEnvelope({
      sourceType,
      importType: "measurements",
      externalKey,
      actor: { type: "connector", id: "metrology_adapter" },
      provenance: {
        triggerMode,
        adapter: "metrology_cmm_v1",
        integrationId
      },
      payloadVersion: "1.0",
      payload: { rows: mapped.accepted }
    }, { requireExternalKey: true });
  }

  return {
    adapterPack: "metrology_cmm_v1",
    total: mapped.total,
    acceptedCount: mapped.accepted.length,
    rejectedCount: mapped.rejected.length,
    rejected: mapped.rejected,
    payload: {
      ...(batchExternalId ? { batch_key: batchExternalId } : {}),
      rows: mapped.accepted
    }
  };
}

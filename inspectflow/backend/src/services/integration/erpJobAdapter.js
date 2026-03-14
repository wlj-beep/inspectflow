import { validateAndNormalizeCanonicalEnvelope } from "./canonicalEnvelope.js";
import { buildExternalEntityKey } from "../idempotency/idempotencyKey.js";

const VALID_JOB_STATUS = new Set(["open", "closed", "draft", "incomplete"]);

function canonicalKey(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeOperationNumber(value) {
  const raw = String(value ?? "").trim();
  if (!/^\d{1,3}$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 999) return null;
  return String(n).padStart(3, "0");
}

function normalizePartRevision(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return normalized || "A";
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

function toCanonicalRecord(input) {
  const record = {};
  for (const [rawKey, value] of Object.entries(input || {})) {
    record[canonicalKey(rawKey)] = value;
  }
  return record;
}

export function normalizeErpJobRecord(rawRecord) {
  const row = toCanonicalRecord(rawRecord);
  const status = String(first(row, ["status"]) || "open")
    .trim()
    .toLowerCase();

  return {
    jobId: String(first(row, ["job_id", "job_number", "id"]) || "").trim(),
    partId: String(first(row, ["part_id", "part_number"]) || "").trim(),
    partRevision: normalizePartRevision(first(row, ["part_revision", "revision"])),
    opNumber: normalizeOperationNumber(first(row, ["op_number", "operation_number", "operation"])),
    lot: String(first(row, ["lot", "lot_number"]) || "").trim(),
    qty: Number(first(row, ["qty", "quantity"])),
    status: VALID_JOB_STATUS.has(status) ? status : null,
    externalId: String(first(row, ["external_id", "external_key", "job_id", "job_number", "id"]) || "").trim()
  };
}

export function mapErpJobRecordToEnvelope(rawRecord, options = {}) {
  const normalized = normalizeErpJobRecord(rawRecord);
  const errors = [];

  if (!normalized.jobId) errors.push("missing_job_id");
  if (!normalized.partId) errors.push("missing_part_id");
  if (!normalized.opNumber) errors.push("invalid_op_number");
  if (!normalized.lot) errors.push("missing_lot");
  if (!Number.isInteger(normalized.qty) || normalized.qty <= 0) errors.push("invalid_qty");
  if (!normalized.status) errors.push("invalid_status");

  const externalKey = buildExternalEntityKey({
    importType: "jobs",
    entityType: "job",
    externalId: normalized.externalId
  });
  if (!externalKey) errors.push("missing_external_key");

  if (errors.length > 0) {
    return { ok: false, errors, value: null };
  }

  const envelope = validateAndNormalizeCanonicalEnvelope({
    sourceType: options.sourceType || "api_pull",
    importType: "jobs",
    externalKey,
    actor: options.actor || { type: "connector", id: options.connectorName || "erp_job_adapter" },
    provenance: {
      triggerMode: options.triggerMode || "manual",
      adapter: options.adapter || "erp_job_v1",
      integrationId: options.integrationId || null
    },
    payloadVersion: options.payloadVersion || "1.0",
    ingestTimestamp: options.ingestTimestamp || new Date().toISOString(),
    idempotencyToken: options.idempotencyToken || null,
    payload: {
      entityType: "job",
      entity: {
        id: normalized.jobId,
        partId: normalized.partId,
        partRevision: normalized.partRevision,
        opNumber: normalized.opNumber,
        lot: normalized.lot,
        qty: normalized.qty,
        status: normalized.status
      }
    }
  }, { requireExternalKey: true });

  return envelope;
}

export function mapErpJobBatchToCanonical(records, options = {}) {
  const accepted = [];
  const rejected = [];

  for (const [idx, record] of (records || []).entries()) {
    const mapped = mapErpJobRecordToEnvelope(record, options);
    if (mapped.ok) {
      accepted.push({ line: idx + 1, envelope: mapped.value });
    } else {
      rejected.push({ line: idx + 1, errors: mapped.errors });
    }
  }

  return {
    ok: rejected.length === 0,
    total: (records || []).length,
    accepted,
    rejected
  };
}


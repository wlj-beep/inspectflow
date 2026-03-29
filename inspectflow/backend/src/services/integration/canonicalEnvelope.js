import { createHash } from "node:crypto";

const SOURCE_TYPE_ALIASES = new Map([
  ["manual", "manual"],
  ["manual_csv", "manual"],
  ["manualcsv", "manual"],
  ["operator_csv", "manual"],
  ["operatorcsv", "manual"],
  ["manual_resolution", "manual"],
  ["manualresolution", "manual"],
  ["api", "api_pull"],
  ["api_pull", "api_pull"],
  ["pull", "api_pull"],
  ["webhook", "webhook"],
  ["hook", "webhook"],
  ["excel", "excel_sheet"],
  ["sheet", "excel_sheet"],
  ["excel_sheet", "excel_sheet"],
  ["spreadsheet", "excel_sheet"],
  ["scheduled", "scheduled"],
  ["replay", "replay"],
  // BL-120: IoT collector source types
  ["opc_ua", "opc_ua"],
  ["opcua", "opc_ua"],
  ["mqtt", "mqtt"],
  ["tcp", "tcp"]
]);

const IMPORT_TYPE_ALIASES = new Map([
  ["tools", "tools"],
  ["tool", "tools"],
  ["part_dimensions", "part_dimensions"],
  ["partdimension", "part_dimensions"],
  ["partdimensions", "part_dimensions"],
  ["part_dimension", "part_dimensions"],
  ["jobs", "jobs"],
  ["job", "jobs"],
  ["measurements", "measurements"],
  ["measurement", "measurements"],
  ["cmm", "measurements"]
]);

function normalizeKey(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeEnum(raw, aliases) {
  const key = normalizeKey(raw);
  return aliases.get(key) || null;
}

function normalizeText(raw, { maxLength = 240, allowEmpty = false } = {}) {
  const value = String(raw ?? "").trim();
  if (!value) return allowEmpty ? "" : null;
  return value.slice(0, maxLength);
}

function toIsoTimestamp(raw, now) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return now.toISOString();
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizePayloadVersion(raw) {
  const value = normalizeText(raw, { maxLength: 32 });
  if (!value) return "1.0";
  return value;
}

function normalizeActor(raw) {
  if (!raw) {
    return {
      type: "system",
      id: null,
      display: null
    };
  }

  if (typeof raw === "string") {
    return {
      type: "user",
      id: null,
      display: normalizeText(raw, { maxLength: 120 })
    };
  }

  return {
    type: normalizeText(raw.type, { maxLength: 24 }) || "system",
    id: normalizeText(raw.id, { maxLength: 120 }),
    display: normalizeText(raw.display, { maxLength: 120 })
  };
}

function normalizeProvenance(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      connectorId: null,
      integrationId: null,
      triggerMode: null,
      adapter: null
    };
  }

  const connectorId = Number(raw.connectorId);
  const integrationId = Number(raw.integrationId);

  return {
    connectorId: Number.isInteger(connectorId) && connectorId > 0 ? connectorId : null,
    integrationId: Number.isInteger(integrationId) && integrationId > 0 ? integrationId : null,
    triggerMode: normalizeText(raw.triggerMode, { maxLength: 32 }),
    adapter: normalizeText(raw.adapter, { maxLength: 64 })
  };
}

function deriveTokenSeed({ sourceType, importType, externalKey, payloadVersion, ingestTimestamp }) {
  const joined = [
    sourceType || "",
    importType || "",
    externalKey || "",
    payloadVersion || "",
    ingestTimestamp || ""
  ].join("|");
  return createHash("sha256").update(joined).digest("hex").slice(0, 24);
}

export function normalizeCanonicalEnvelope(input, { now = new Date() } = {}) {
  const source = input || {};
  const sourceType = normalizeEnum(source.sourceType || source.source_type, SOURCE_TYPE_ALIASES);
  const importType = normalizeEnum(source.importType || source.import_type, IMPORT_TYPE_ALIASES);
  const externalKey = normalizeText(source.externalKey || source.external_key);
  const payloadVersion = normalizePayloadVersion(source.payloadVersion || source.payload_version);
  const ingestTimestamp = toIsoTimestamp(source.ingestTimestamp || source.ingest_timestamp, now);
  const actor = normalizeActor(source.actor);
  const provenance = normalizeProvenance(source.provenance);
  const payload = source.payload ?? source.data ?? source.body ?? null;

  const tokenInput = normalizeText(source.idempotencyToken || source.idempotency_token, { maxLength: 160 });
  const idempotencyToken = tokenInput || `tok_${deriveTokenSeed({
    sourceType,
    importType,
    externalKey,
    payloadVersion,
    ingestTimestamp
  })}`;

  return {
    sourceType,
    importType,
    externalKey,
    actor,
    provenance,
    payloadVersion,
    ingestTimestamp,
    idempotencyToken,
    payload
  };
}

export function validateCanonicalEnvelope(envelope, { requireExternalKey = false } = {}) {
  const errors = [];

  if (!envelope.sourceType) {
    errors.push("invalid_source_type");
  }
  if (!envelope.importType) {
    errors.push("invalid_import_type");
  }
  if (!envelope.payloadVersion) {
    errors.push("invalid_payload_version");
  }
  if (!envelope.ingestTimestamp) {
    errors.push("invalid_ingest_timestamp");
  }
  if (!envelope.idempotencyToken) {
    errors.push("invalid_idempotency_token");
  }
  if (requireExternalKey && !envelope.externalKey) {
    errors.push("external_key_required");
  }
  if (envelope.payload === null || envelope.payload === undefined) {
    errors.push("missing_payload");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function validateAndNormalizeCanonicalEnvelope(input, options = {}) {
  const value = normalizeCanonicalEnvelope(input, options);
  const result = validateCanonicalEnvelope(value, options);
  return {
    ...result,
    value: result.ok ? value : null
  };
}

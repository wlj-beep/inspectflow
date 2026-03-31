import { query, transaction } from "../db.js";
import { getActorRole, getActorUserId } from "../middleware/authSession.js";
import {
  createPartSetupRevision,
  ensurePartSetupBaselineRevision,
  getPartRevisionByCode
} from "../revisions.js";
import { executeConnectorRuntime } from "../services/integration/connectorRuntime.js";
import { mapErpJobBatchToCanonical } from "../services/integration/erpJobAdapter.js";
import { buildIntegrationSupportBundle } from "../services/observability/integrationSupportBundle.js";
import {
  createPayloadFingerprint
} from "../services/idempotency/idempotencyKey.js";

export const VALID_TOOL_TYPES = ["Variable", "Go/No-Go", "Attribute"];
export const VALID_UNITS = ["in", "mm", "Ra", "deg"];
export const VALID_SAMPLING = ["first_last", "first_middle_last", "every_5", "every_10", "100pct", "custom_interval"];
export const VALID_INPUT_MODE = ["single", "range"];
export const VALID_JOB_STATUS = ["open", "closed", "draft", "incomplete"];
export const VALID_MEASUREMENT_RECORD_STATUS = ["complete", "incomplete"];
export const VALID_IMPORT_TYPES = ["tools", "part_dimensions", "jobs", "measurements"];
export const VALID_INTEGRATION_SOURCE_TYPES = ["api_pull", "webhook", "excel_sheet"];

export let schedulerHandle = null;

export function normalizeOperationNumber(value) {
  const raw = String(value ?? "").trim();
  if (!/^\d{1,3}$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 999) return null;
  return String(n).padStart(3, "0");
}

export function normalizePartRevision(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return normalized || null;
}

export function requestRole(req) {
  return getActorRole(req);
}

export function canonicalHeader(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function canonicalDimensionName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let i = 0;
  let inQuotes = false;
  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === "\"") {
        if (line[i + 1] === "\"") {
          cur += "\"";
          i += 2;
          continue;
        }
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else if (ch === "\"") {
      inQuotes = true;
    } else {
      cur += ch;
    }
    i += 1;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

export function parseCsvText(csvText) {
  const lines = String(csvText || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]).map(canonicalHeader);
  const rows = lines.slice(1).map((line, idx) => {
    const vals = parseCsvLine(line);
    const row = { _line: idx + 2, _raw: line };
    headers.forEach((h, i) => {
      row[h] = vals[i] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

export function normalizeObjectRows(inputRows) {
  return (inputRows || []).map((raw, idx) => {
    const row = { _line: idx + 2, _raw: raw };
    for (const [k, v] of Object.entries(raw || {})) {
      row[canonicalHeader(k)] = typeof v === "string" ? v.trim() : v;
    }
    return row;
  });
}

export function rowsFromPayload(payload) {
  if (Array.isArray(payload)) return normalizeObjectRows(payload);
  if (typeof payload === "string") return parseCsvText(payload).rows;
  if (payload && typeof payload === "object") {
    if (typeof payload.csvText === "string") return parseCsvText(payload.csvText).rows;
    if (Array.isArray(payload.rows)) return normalizeObjectRows(payload.rows);
    if (Array.isArray(payload.items)) return normalizeObjectRows(payload.items);
  }
  return [];
}

export function firstValue(row, keys) {
  for (const k of keys) {
    const v = row[canonicalHeader(k)];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}

export function parseOptionalBoolean(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "") return undefined;
  if (["true", "1", "yes", "y", "pass", "ok"].includes(v)) return true;
  if (["false", "0", "no", "n", "fail"].includes(v)) return false;
  return undefined;
}

export function parseInterval(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export function parsePositiveInteger(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export function parseOptionalNumber(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function parseImportType(value) {
  const v = canonicalHeader(value);
  if (v === "part_dimensions" || v === "partdimensions" || v === "part_dimension" || v === "part_dimensions_csv" || v === "part-dimensions") {
    return "part_dimensions";
  }
  if (v === "tools" || v === "tool") return "tools";
  if (v === "jobs" || v === "job") return "jobs";
  if (v === "measurements" || v === "measurement" || v === "cmm" || v === "measurement_data") return "measurements";
  return v;
}

export function parseSourceType(value) {
  const v = canonicalHeader(value);
  if (v === "api" || v === "api_pull") return "api_pull";
  if (v === "webhook" || v === "hook") return "webhook";
  if (v === "excel" || v === "sheet" || v === "excel_sheet" || v === "spreadsheet") return "excel_sheet";
  return v;
}

export function parseAdapterPack(value) {
  const v = canonicalHeader(value);
  if (!v) return null;
  if (["erp_job_v1", "erp_jobs_v1", "erp_job", "erp_jobs"].includes(v)) {
    return "erp_job_v1";
  }
  return null;
}

export function resolveAdapterPack({ importType, payload = null, options = {} }) {
  const normalizedImportType = parseImportType(importType);
  if (normalizedImportType !== "jobs") return null;

  const fromOptions = parseAdapterPack(options?.adapterPack || options?.adapter_pack || options?.adapter);
  if (fromOptions) return fromOptions;
  if (payload && typeof payload === "object") {
    const fromPayload = parseAdapterPack(payload.adapterPack || payload.adapter_pack || payload.adapter);
    if (fromPayload) return fromPayload;
  }
  return null;
}

export function mapAdapterRejectedToErrors(rejected = []) {
  return rejected.map((item) => ({
    line: Number(item?.line || 0) || null,
    error: `adapter_rejected:${(Array.isArray(item?.errors) ? item.errors : []).join(",") || "invalid_row"}`
  }));
}

export function adaptErpJobsPayload({
  payload,
  sourceType,
  triggerMode = "manual",
  integrationId = null
}) {
  const rawRows = rowsFromPayload(payload);
  const mapped = mapErpJobBatchToCanonical(rawRows, {
    sourceType,
    triggerMode,
    integrationId,
    adapter: "erp_job_v1"
  });

  const rows = mapped.accepted.map((item) => {
    const entity = item?.envelope?.payload?.entity || {};
    return {
      job_id: entity.id || "",
      part_id: entity.partId || "",
      part_revision: entity.partRevision || "A",
      op_number: entity.opNumber || "",
      lot: entity.lot || "",
      qty: entity.qty ?? "",
      status: entity.status || "open",
      external_id: item?.envelope?.externalKey || null
    };
  });

  return {
    adapterPack: "erp_job_v1",
    total: mapped.total,
    acceptedCount: mapped.accepted.length,
    rejectedCount: mapped.rejected.length,
    rejected: mapped.rejected,
    payload: { rows }
  };
}

export function applyAdapterResultToImportResult(result, adapterResult) {
  if (!adapterResult) return result;

  const normalized = {
    ...result,
    totalRows: Number(adapterResult.total || result?.totalRows || 0),
    failed: Number(result?.failed || 0) + Number(adapterResult.rejectedCount || 0),
    errors: [
      ...(Array.isArray(result?.errors) ? result.errors : []),
      ...mapAdapterRejectedToErrors(adapterResult.rejected)
    ],
    adapter: {
      adapterPack: adapterResult.adapterPack,
      total: Number(adapterResult.total || 0),
      accepted: Number(adapterResult.acceptedCount || 0),
      rejected: Number(adapterResult.rejectedCount || 0)
    }
  };
  return normalized;
}

export function safeErrorCode(err) {
  return String(err?.message || "unknown_error")
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 160) || "unknown_error";
}

export function deriveRunStatus(result) {
  const failed = Number(result?.failed || 0);
  const inserted = Number(result?.inserted || 0);
  const updated = Number(result?.updated || 0);
  return failed > 0 ? (inserted > 0 || updated > 0 ? "partial" : "error") : "success";
}

export function normalizeTriggerMode(triggerMode) {
  const value = String(triggerMode || "manual").trim().toLowerCase();
  if (["manual", "scheduled", "webhook"].includes(value)) return value;
  return "manual";
}

export function nonEmptyString(value) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

export function readPayloadToken(payload, keys = []) {
  if (!payload || typeof payload !== "object") return null;
  for (const key of keys) {
    const normalized = nonEmptyString(payload[key]);
    if (normalized) return normalized;
  }
  return null;
}

export function buildRuntimeEnvelopeInput({
  sourceType,
  importType,
  payload,
  triggerMode,
  integrationId = null,
  adapterName = null,
  actorRole = null,
  payloadFingerprint = createPayloadFingerprint(payload)
}) {
  const normalizedSourceType = parseSourceType(sourceType) || "api_pull";
  const normalizedImportType = parseImportType(importType);
  const normalizedTriggerMode = normalizeTriggerMode(triggerMode);
  const normalizedActorRole = nonEmptyString(actorRole);

  const idempotencyToken = readPayloadToken(payload, [
    "idempotencyToken",
    "idempotency_token",
    "deliveryId",
    "delivery_id",
    "eventId",
    "event_id"
  ]) || `tok_${payloadFingerprint.hash.slice(0, 24)}`;

  const externalKeyHint = readPayloadToken(payload, [
    "externalKey",
    "external_key",
    "batchKey",
    "batch_key",
    "batchId",
    "batch_id",
    "eventId",
    "event_id"
  ]);
  const scopedSource = integrationId ? `integration_${integrationId}` : "adhoc";
  const externalKey = externalKeyHint || [
    normalizedImportType || "import",
    normalizedSourceType || "source",
    normalizedTriggerMode,
    scopedSource,
    payloadFingerprint.hash.slice(0, 24)
  ].join(":");

  return {
    sourceType: normalizedSourceType,
    importType: normalizedImportType,
    externalKey,
    actor: normalizedActorRole
      ? { type: "user", id: normalizedActorRole.toLowerCase(), display: normalizedActorRole }
      : { type: "system", id: null, display: null },
    provenance: {
      integrationId,
      triggerMode: normalizedTriggerMode,
      adapter: adapterName || (integrationId ? "configured_import_integration" : "direct_import_webhook")
    },
    payloadVersion: "1.0",
    ingestTimestamp: readPayloadToken(payload, ["ingestTimestamp", "ingest_timestamp"]) || new Date().toISOString(),
    idempotencyToken,
    payload,
    payloadFingerprint
  };
}

export function normalizeRuntimeImportResult(result) {
  return {
    status: deriveRunStatus(result),
    totalRows: Number(result?.totalRows || 0),
    inserted: Number(result?.inserted || 0),
    updated: Number(result?.updated || 0),
    failed: Number(result?.failed || 0),
    unresolvedCount: Number(result?.unresolvedCount || 0),
    errors: Array.isArray(result?.errors) ? result.errors : [],
    unresolvedItems: Array.isArray(result?.unresolvedItems) ? result.unresolvedItems : []
  };
}

export function mergeRunErrors({ resultErrors = [], runtimeErrors = [] }) {
  const merged = [];
  for (const item of resultErrors) {
    merged.push(item);
  }
  for (const item of runtimeErrors) {
    merged.push({
      code: item?.code || "runtime_error",
      error: item?.message || item?.code || "runtime_error",
      retryable: Boolean(item?.retryable),
      statusCode: item?.statusCode ?? null
    });
  }
  return merged;
}

export function importResponseStatusCode(result) {
  if (result?.duplicate) return 200;
  const inserted = Number(result?.inserted || 0);
  const updated = Number(result?.updated || 0);
  const failed = Number(result?.failed || 0);
  const totalProcessed = inserted + updated + failed;
  if (totalProcessed <= 0) return 200;
  return failed >= totalProcessed ? 400 : 200;
}

export function truncateText(value, max = 240) {
  const normalized = nonEmptyString(value);
  return normalized ? normalized.slice(0, max) : null;
}

export function buildExternalEntityRefs({ importType, payload, sourceType }) {
  const normalizedImportType = parseImportType(importType);
  const normalizedSourceType = parseSourceType(sourceType) || "api_pull";
  const refs = [];

  if (normalizedImportType === "measurements" && Array.isArray(payload?.records)) {
    const records = rowsFromMeasurementRecords(payload.records);
    for (const row of records) {
      const jobId = truncateText(firstValue(row, ["job_id", "job", "job_number", "work_order", "workorder"]), 120);
      const opRef = truncateText(firstValue(row, ["operation_ref", "op_number", "operation", "op"]), 32);
      const pieceNumber = parsePositiveInteger(firstValue(row, ["piece_number", "piece", "sample", "part_piece"]));
      const dimensionName = truncateText(firstValue(row, ["dimension_name", "dimension", "feature", "characteristic", "char"]), 160);
      const recordKey = truncateText(firstValue(row, ["record_key", "batch_key", "group_key"]), 160);
      const externalId = truncateText(
        firstValue(row, ["external_id", "external_key", "record_key", "batch_key", "group_key"]) || (
          jobId && opRef && pieceNumber && (dimensionName || firstValue(row, ["dimension_id", "dim_id"]))
            ? `${jobId}:${opRef}:${dimensionName || firstValue(row, ["dimension_id", "dim_id"])}:${pieceNumber}`
            : null
        ),
        240
      );
      if (!externalId) continue;

      refs.push({
        importType: normalizedImportType,
        entityType: "measurement",
        externalId,
        sourceType: normalizedSourceType,
        internalRef: {
          jobId,
          operationRef: opRef,
          pieceNumber: pieceNumber || null,
          dimensionName,
          recordKey
        }
      });
    }
    return refs;
  }

  const rows = rowsFromPayload(payload);
  if (!rows.length) return refs;

  if (normalizedImportType === "jobs") {
    for (const row of rows) {
      const jobId = truncateText(firstValue(row, ["job_id", "id", "job_number", "job"]), 120);
      const partId = truncateText(firstValue(row, ["part_id", "part_number"]), 120);
      const opNumber = normalizeOperationNumber(firstValue(row, ["op_number", "operation", "operation_number"])) || null;
      const externalId = truncateText(
        firstValue(row, ["external_id", "external_key", "job_id", "id", "job_number", "job"]),
        240
      );
      if (!externalId) continue;

      refs.push({
        importType: normalizedImportType,
        entityType: "job",
        externalId,
        sourceType: normalizedSourceType,
        internalRef: {
          jobId,
          partId,
          opNumber
        }
      });
    }
    return refs;
  }

  if (normalizedImportType === "tools") {
    for (const row of rows) {
      const name = truncateText(firstValue(row, ["name"]), 160);
      const itNum = truncateText(firstValue(row, ["it_num", "itnum", "it_number", "it"]).toUpperCase(), 120);
      const externalId = truncateText(
        firstValue(row, ["external_id", "external_key", "it_num", "itnum", "it_number", "name"]),
        240
      );
      if (!externalId) continue;

      refs.push({
        importType: normalizedImportType,
        entityType: "tool",
        externalId,
        sourceType: normalizedSourceType,
        internalRef: {
          name,
          itNum
        }
      });
    }
    return refs;
  }

  if (normalizedImportType === "part_dimensions") {
    for (const row of rows) {
      const partId = truncateText(firstValue(row, ["part_id", "part_number"]), 120);
      const opNumber = normalizeOperationNumber(firstValue(row, ["op_number", "operation", "operation_number"])) || null;
      const dimensionName = truncateText(firstValue(row, ["dimension_name", "name"]), 160);
      const fallbackId = partId && opNumber && dimensionName
        ? `${partId}:${opNumber}:${dimensionName}`
        : null;
      const externalId = truncateText(
        firstValue(row, ["external_id", "external_key", "dimension_external_id"]) || fallbackId,
        240
      );
      if (!externalId) continue;

      refs.push({
        importType: normalizedImportType,
        entityType: "dimension",
        externalId,
        sourceType: normalizedSourceType,
        internalRef: {
          partId,
          opNumber,
          dimensionName
        }
      });
    }
    return refs;
  }

  return refs;
}

async function registerIdempotencyLedgerEntry({
  idempotencyKey,
  sourceType,
  importType,
  externalKey,
  payloadFingerprint
}) {
  const { rows } = await query(
    `INSERT INTO import_idempotency_ledger
       (idempotency_key, source_type, import_type, external_key, payload_hash, payload_bytes)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (idempotency_key) DO UPDATE
       SET last_seen_at=NOW(),
           hit_count=import_idempotency_ledger.hit_count + 1
     RETURNING id, hit_count`,
    [
      idempotencyKey,
      sourceType,
      importType,
      externalKey,
      payloadFingerprint?.hash || "",
      Number(payloadFingerprint?.bytes || 0)
    ]
  );
  const row = rows[0] || {};
  const hitCount = Number(row.hit_count || 1);
  return {
    duplicate: hitCount > 1,
    key: idempotencyKey,
    ledgerId: Number(row.id || 0),
    hitCount
  };
}

async function finalizeIdempotencyLedgerEntry({ idempotencyKey, runId, runStatus }) {
  if (!idempotencyKey) return;
  await query(
    `UPDATE import_idempotency_ledger
     SET first_run_id=COALESCE(first_run_id, $2),
         last_run_id=$2,
         first_status=COALESCE(first_status, $3),
         last_status=$3,
         last_seen_at=NOW()
     WHERE idempotency_key=$1`,
    [idempotencyKey, runId || null, runStatus || null]
  );
}

export function inferMeasurementValue(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  const upper = text.toUpperCase();
  if (upper === "PASS" || upper === "FAIL") return upper;

  if (text.includes("|")) {
    const [aRaw = "", bRaw = ""] = text.split("|");
    const a = parseOptionalNumber(aRaw);
    const b = parseOptionalNumber(bRaw);
    if (a === null || b === null) return text;
    return `${a}|${b}`;
  }

  const nums = text.match(/-?\d+(?:\.\d+)?/g);
  if (nums && nums.length >= 2 && /to|\.\.|-|–/.test(text)) {
    const a = parseOptionalNumber(nums[0]);
    const b = parseOptionalNumber(nums[1]);
    if (a !== null && b !== null) return `${a}|${b}`;
  }
  if (nums && nums.length === 1) {
    const n = parseOptionalNumber(nums[0]);
    if (n !== null) return String(n);
  }

  return text;
}

export function inferIsOot(value, dim) {
  if (value === "PASS") return false;
  if (value === "FAIL") return true;

  const mode = String(dim?.input_mode || "single");
  if (mode === "range") {
    const [minRaw = "", maxRaw = ""] = String(value || "").split("|");
    const min = Number(minRaw);
    const max = Number(maxRaw);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return false;
    const lower = Number(dim.nominal) - Number(dim.tol_minus);
    const upper = Number(dim.nominal) + Number(dim.tol_plus);
    return min < lower || min > upper || max < lower || max > upper;
  }

  const n = Number(value);
  if (!Number.isFinite(n)) return false;
  const lower = Number(dim.nominal) - Number(dim.tol_minus);
  const upper = Number(dim.nominal) + Number(dim.tol_plus);
  return n < lower || n > upper;
}

export function validateMeasurementValueForMode(value, dim) {
  const mode = String(dim?.input_mode || "single");
  const text = String(value || "").trim();
  if (!text) return false;
  if (text === "PASS" || text === "FAIL") return true;

  if (mode === "range") {
    const [minRaw = "", maxRaw = ""] = text.split("|");
    const min = Number(minRaw);
    const max = Number(maxRaw);
    return Number.isFinite(min) && Number.isFinite(max);
  }

  const n = Number(text);
  return Number.isFinite(n);
}

async function validatePartRevision(client, partId, revisionCode, role) {
  await ensurePartSetupBaselineRevision(client, { partId, changedByRole: role });
  const revision = await getPartRevisionByCode(client, partId, revisionCode);
  return !!revision;
}

async function resolveOperationId(client, partId, row) {
  const operationIdRaw = firstValue(row, ["operation_id", "op_id"]).trim();
  if (operationIdRaw) {
    const opId = Number(operationIdRaw);
    if (!Number.isInteger(opId) || opId <= 0) {
      throw new Error(`line_${row._line}: invalid_operation_id`);
    }
    const opRes = await client.query(
      "SELECT id FROM operations WHERE id=$1 AND part_id=$2",
      [opId, partId]
    );
    if (!opRes.rows[0]) {
      throw new Error(`line_${row._line}: operation_part_mismatch`);
    }
    return opId;
  }

  const opNumberRaw = firstValue(row, ["op_number", "operation", "operation_number"]).trim();
  const opNumber = normalizeOperationNumber(opNumberRaw);
  if (!opNumber) {
    throw new Error(`line_${row._line}: invalid_operation_reference`);
  }
  const rawOp = String(Number(opNumber));
  const opCandidates = Array.from(new Set([
    opNumber,
    rawOp,
    String(rawOp).padStart(3, "0"),
    String(rawOp).replace(/^0+/, "") || "0"
  ]));
  const opRes = await client.query(
    "SELECT id FROM operations WHERE part_id=$1 AND op_number = ANY($2) LIMIT 1",
    [partId, opCandidates]
  );
  if (!opRes.rows[0]) {
    throw new Error(`line_${row._line}: operation_not_found`);
  }
  return Number(opRes.rows[0].id);
}

async function importToolsRows(rows) {
  let inserted = 0;
  let updated = 0;
  const errors = [];

  for (const row of rows) {
    try {
      await transaction(async (client) => {
        const name = firstValue(row, ["name"]).trim();
        const type = firstValue(row, ["type"]).trim();
        const itNum = firstValue(row, ["it_num", "itnum", "it_number", "it"]).trim();
        const size = firstValue(row, ["size"]).trim() || null;
        const active = parseOptionalBoolean(firstValue(row, ["active"]));
        const visible = parseOptionalBoolean(firstValue(row, ["visible", "selectable"]));
        if (!name || !type || !itNum) {
          throw new Error(`line_${row._line}: required_fields_missing`);
        }
        if (!VALID_TOOL_TYPES.includes(type)) {
          throw new Error(`line_${row._line}: invalid_tool_type`);
        }

        const existing = await client.query("SELECT id FROM tools WHERE name=$1", [name]);
        const nextActive = active === undefined ? true : active;
        const nextVisible = visible === undefined ? true : visible;
        await client.query(
          `INSERT INTO tools (name, type, it_num, size, active, visible)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (name) DO UPDATE
             SET type=EXCLUDED.type,
                 it_num=EXCLUDED.it_num,
                 size=EXCLUDED.size,
                 active=EXCLUDED.active,
                 visible=EXCLUDED.visible`,
          [name, type, itNum, size, nextActive, nextVisible]
        );
        if (existing.rows[0]) updated += 1;
        else inserted += 1;
      });
    } catch (err) {
      errors.push({
        line: row._line,
        item: firstValue(row, ["name"]).trim() || null,
        error: safeErrorCode(err)
      });
    }
  }

  return {
    ok: errors.length === 0,
    totalRows: rows.length,
    inserted,
    updated,
    failed: errors.length,
    errors
  };
}

async function importPartDimensionsRows(rows, role) {
  let partsUpserted = 0;
  let operationsUpserted = 0;
  let dimensionsUpserted = 0;

  await transaction(async (client) => {
    const touchedParts = new Map();
    for (const row of rows) {
      const partId = firstValue(row, ["part_id", "part_number"]).trim();
      const partDescription = firstValue(row, ["part_name", "part_description", "description"]).trim() || partId;
      const opNumberRaw = firstValue(row, ["op_number", "operation", "operation_number"]).trim();
      const opNumber = normalizeOperationNumber(opNumberRaw);
      const opLabel = firstValue(row, ["op_label", "operation_label"]).trim() || `Operation ${opNumber}`;
      const dimName = firstValue(row, ["dimension_name", "name"]).trim();
      const nominal = Number(firstValue(row, ["nominal"]));
      const tolPlus = Number(firstValue(row, ["tol_plus", "tolplus"]));
      const tolMinus = Number(firstValue(row, ["tol_minus", "tolminus"]));
      const unit = firstValue(row, ["unit"]).trim();
      const sampling = firstValue(row, ["sampling", "sampling_plan"]).trim();
      const inputMode = firstValue(row, ["input_mode"]).trim() || "single";
      const samplingIntervalRaw = firstValue(row, ["sampling_interval", "interval_n"]);
      const samplingInterval = parseInterval(samplingIntervalRaw);
      const toolItNumsRaw = firstValue(row, ["tool_it_nums", "tool_it_list", "tool_its"]);

      if (!partId || !opNumber || !dimName || Number.isNaN(nominal) || Number.isNaN(tolPlus) || Number.isNaN(tolMinus) || !unit || !sampling) {
        throw new Error(`line_${row._line}: required_fields_missing`);
      }
      if (!VALID_UNITS.includes(unit)) throw new Error(`line_${row._line}: invalid_unit`);
      if (!VALID_SAMPLING.includes(sampling)) throw new Error(`line_${row._line}: invalid_sampling`);
      if (!VALID_INPUT_MODE.includes(inputMode)) throw new Error(`line_${row._line}: invalid_input_mode`);
      if (sampling === "custom_interval" && samplingInterval === null) {
        throw new Error(`line_${row._line}: invalid_sampling_interval`);
      }

      const existingPart = await client.query("SELECT id FROM parts WHERE id=$1", [partId]);
      const isNewPart = !existingPart.rows[0];
      if (!isNewPart) {
        await ensurePartSetupBaselineRevision(client, { partId, changedByRole: role });
      }
      await client.query(
        `INSERT INTO parts (id, description)
         VALUES ($1,$2)
         ON CONFLICT (id) DO UPDATE SET description=EXCLUDED.description`,
        [partId, partDescription]
      );
      if (!existingPart.rows[0]) partsUpserted += 1;
      if (!touchedParts.has(partId)) {
        touchedParts.set(partId, { isNewPart, rowCount: 0 });
      }
      touchedParts.get(partId).rowCount += 1;

      const existingOp = await client.query(
        "SELECT id FROM operations WHERE part_id=$1 AND op_number=$2",
        [partId, opNumber]
      );
      const opRes = await client.query(
        `INSERT INTO operations (part_id, op_number, label)
         VALUES ($1,$2,$3)
         ON CONFLICT (part_id, op_number) DO UPDATE SET label=EXCLUDED.label
         RETURNING id`,
        [partId, opNumber, opLabel]
      );
      if (!existingOp.rows[0]) operationsUpserted += 1;
      const operationId = opRes.rows[0].id;

      const existingDim = await client.query(
        "SELECT id FROM dimensions WHERE operation_id=$1 AND name=$2",
        [operationId, dimName]
      );
      const dimRes = await client.query(
        `INSERT INTO dimensions (operation_id, name, nominal, tol_plus, tol_minus, unit, sampling, sampling_interval, input_mode)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (operation_id, name) DO UPDATE
           SET nominal=EXCLUDED.nominal,
               tol_plus=EXCLUDED.tol_plus,
               tol_minus=EXCLUDED.tol_minus,
               unit=EXCLUDED.unit,
               sampling=EXCLUDED.sampling,
               sampling_interval=EXCLUDED.sampling_interval,
               input_mode=EXCLUDED.input_mode
         RETURNING id`,
        [
          operationId,
          dimName,
          nominal,
          tolPlus,
          tolMinus,
          unit,
          sampling,
          sampling === "custom_interval" ? samplingInterval : null,
          inputMode
        ]
      );
      if (!existingDim.rows[0]) dimensionsUpserted += 1;
      const dimensionId = dimRes.rows[0].id;

      const toolItNums = String(toolItNumsRaw || "")
        .split(/[;|]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (toolItNums.length) {
        const toolRes = await client.query(
          "SELECT id, it_num FROM tools WHERE it_num = ANY($1)",
          [toolItNums]
        );
        if (toolRes.rows.length !== toolItNums.length) {
          throw new Error(`line_${row._line}: unknown_tool_it_num`);
        }
        await client.query("DELETE FROM dimension_tools WHERE dimension_id=$1", [dimensionId]);
        for (const t of toolRes.rows) {
          await client.query(
            "INSERT INTO dimension_tools (dimension_id, tool_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
            [dimensionId, t.id]
          );
        }
      }
    }

    for (const [partId, info] of touchedParts.entries()) {
      await createPartSetupRevision(client, {
        partId,
        changeSummary: `Applied part-dimensions CSV import (${info.rowCount} row${info.rowCount === 1 ? "" : "s"})`,
        changedFields: ["imports.part_dimensions_csv"],
        changedByRole: role,
        createInitialIfMissing: info.isNewPart
      });
    }
  });

  return {
    ok: true,
    totalRows: rows.length,
    partsUpserted,
    operationsUpserted,
    dimensionsUpserted,
    failed: 0,
    errors: []
  };
}

async function importJobsRows(rows, role) {
  let inserted = 0;
  let updated = 0;
  const errors = [];

  for (const row of rows) {
    try {
      await transaction(async (client) => {
        const jobId = firstValue(row, ["job_id", "id", "job_number", "job"]).trim();
        const partId = firstValue(row, ["part_id", "part_number"]).trim();
        const partRevision = normalizePartRevision(
          firstValue(row, ["part_revision", "part_revision_code", "revision"]) || "A"
        );
        const lot = firstValue(row, ["lot", "lot_number"]).trim();
        const qty = parsePositiveInteger(firstValue(row, ["qty", "quantity"]));
        const status = firstValue(row, ["status"]).trim() || "open";

        if (!jobId || !partId || !partRevision || !lot || !qty) {
          throw new Error(`line_${row._line}: required_fields_missing`);
        }
        if (!VALID_JOB_STATUS.includes(status)) {
          throw new Error(`line_${row._line}: invalid_status`);
        }

        const partRes = await client.query("SELECT id FROM parts WHERE id=$1", [partId]);
        if (!partRes.rows[0]) throw new Error(`line_${row._line}: part_not_found`);

        const hasRevision = await validatePartRevision(client, partId, partRevision, role);
        if (!hasRevision) throw new Error(`line_${row._line}: part_revision_not_found`);

        const operationId = await resolveOperationId(client, partId, row);

        const existing = await client.query("SELECT id FROM jobs WHERE id=$1", [jobId]);
        await client.query(
          `INSERT INTO jobs (id, part_id, part_revision_code, operation_id, lot, qty, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (id) DO UPDATE
             SET part_id=EXCLUDED.part_id,
                 part_revision_code=EXCLUDED.part_revision_code,
                 operation_id=EXCLUDED.operation_id,
                 lot=EXCLUDED.lot,
                 qty=EXCLUDED.qty,
                 status=EXCLUDED.status`,
          [jobId, partId, partRevision, operationId, lot, qty, status]
        );
        if (existing.rows[0]) updated += 1;
        else inserted += 1;
      });
    } catch (err) {
      errors.push({
        line: row._line,
        item: firstValue(row, ["job_id", "id", "job_number", "job"]).trim() || null,
        error: safeErrorCode(err)
      });
    }
  }

  return {
    ok: errors.length === 0,
    totalRows: rows.length,
    inserted,
    updated,
    failed: errors.length,
    errors
  };
}

export function looksLikeMeasurementTemplate(rows) {
  if (!rows.length) return false;
  const sample = rows[0];
  const keySet = new Set(Object.keys(sample));
  const expected = ["dimension_name", "piece_number", "value"];
  return expected.every((k) => keySet.has(k));
}

export function normalizeMeasurementRows(rows, options = {}) {
  const unresolved = [];
  const normalized = [];

  const forceJobId = String(options.forceJobId || "").trim() || null;
  const forceOperationId = parsePositiveInteger(options.forceOperationId);
  const forcePartId = String(options.forcePartId || "").trim() || null;
  const forceOperatorUserId = parsePositiveInteger(options.forceOperatorUserId);
  const defaultStatus = String(options.defaultStatus || "").trim().toLowerCase() || null;
  const defaultComment = String(options.defaultComment || "").trim() || null;

  for (const row of rows) {
    const recordKey = firstValue(row, ["record_key", "batch_key", "group_key"]).trim() || null;
    const jobId = forceJobId || firstValue(row, ["job_id", "job", "job_number", "work_order", "workorder"]).trim();
    const partId = forcePartId || firstValue(row, ["part_id", "part", "part_number"]).trim();
    const partRevision = normalizePartRevision(firstValue(row, ["part_revision", "part_revision_code", "revision"]) || "A");

    const operationId = forceOperationId || parsePositiveInteger(firstValue(row, ["operation_id", "op_id"]));
    const operationRef = firstValue(row, ["operation_ref", "op_number", "operation", "op"]).trim();

    const operatorUserId = forceOperatorUserId || parsePositiveInteger(firstValue(row, ["operator_user_id", "user_id", "operator_id"]));
    const lot = firstValue(row, ["lot", "lot_number"]).trim() || null;
    const qty = parsePositiveInteger(firstValue(row, ["qty", "quantity"]));

    const statusRaw = firstValue(row, ["status", "record_status"]).trim().toLowerCase();
    const status = statusRaw || defaultStatus || null;
    const comment = firstValue(row, ["comment", "notes", "note"]).trim() || defaultComment || null;

    const dimensionId = parsePositiveInteger(firstValue(row, ["dimension_id", "dim_id"]));
    const dimensionName = firstValue(row, ["dimension_name", "dimension", "feature", "characteristic", "char"]).trim();

    const pieceNumber = parsePositiveInteger(firstValue(row, ["piece_number", "piece", "sample", "part_piece"]));
    const valueRaw = firstValue(row, ["value", "measurement", "result", "measured_value"]);
    const value = inferMeasurementValue(valueRaw);
    const isOot = parseOptionalBoolean(firstValue(row, ["is_oot", "oot", "out_of_tolerance"]));

    const missingReason = firstValue(row, ["missing_reason", "reason"]).trim();
    const ncNum = firstValue(row, ["nc_num", "nc", "nc_number"]).trim() || null;
    const details = firstValue(row, ["details", "missing_details"]).trim() || null;

    const toolItNums = String(firstValue(row, ["tool_it_nums", "tool_it_num", "tool_it", "it_num", "tool_its"]) || "")
      .split(/[;|,]/)
      .map((v) => v.trim().toUpperCase())
      .filter(Boolean);

    const confidence = [jobId, operationId || operationRef, dimensionId || dimensionName, pieceNumber, value || missingReason]
      .filter(Boolean).length / 5;

    const hasOperationContext = !!(operationId || operationRef || forceJobId);
    if (!jobId || !hasOperationContext || (!dimensionId && !dimensionName) || !pieceNumber || (!value && !missingReason)) {
      unresolved.push({
        line: row._line,
        reason: "insufficient_row_context",
        confidence,
        payload: {
          raw: row,
          inferred: {
            recordKey,
            jobId,
            partId,
            partRevision,
            operationId,
            operationRef,
            operatorUserId,
            lot,
            qty,
            status,
            comment,
            dimensionId,
            dimensionName,
            pieceNumber,
            value,
            isOot,
            missingReason,
            ncNum,
            details,
            toolItNums
          }
        }
      });
      continue;
    }

    normalized.push({
      line: row._line,
      recordKey,
      jobId,
      partId,
      partRevision,
      operationId,
      operationRef,
      operatorUserId,
      lot,
      qty,
      status,
      comment,
      dimensionId,
      dimensionName,
      pieceNumber,
      value,
      isOot,
      missingReason,
      ncNum,
      details,
      toolItNums
    });
  }

  return { normalized, unresolved };
}

export function rowsFromMeasurementRecords(records) {
  const rows = [];

  for (const [idx, record] of (records || []).entries()) {
    const values = Array.isArray(record?.values) ? record.values : [];
    const tools = Array.isArray(record?.tools) ? record.tools : [];
    const missingPieces = Array.isArray(record?.missingPieces) ? record.missingPieces : [];
    const toolByDim = new Map();
    for (const tool of tools) {
      const dimKey = String(tool.dimensionId || tool.dimensionName || "").trim();
      if (!dimKey) continue;
      const it = String(tool.itNum || "").trim();
      if (!it) continue;
      if (!toolByDim.has(dimKey)) toolByDim.set(dimKey, []);
      toolByDim.get(dimKey).push(it);
    }

    for (const v of values) {
      const dimKey = String(v.dimensionId || v.dimensionName || "").trim();
      rows.push({
        _line: idx + 2,
        record_key: record.recordKey || `${record.jobId || ""}_${record.operationId || record.operationRef || ""}`,
        job_id: record.jobId,
        part_id: record.partId,
        part_revision: record.partRevision,
        operation_id: record.operationId,
        operation_ref: record.operationRef,
        lot: record.lot,
        qty: record.qty,
        operator_user_id: record.operatorUserId,
        status: record.status,
        comment: record.comment,
        dimension_id: v.dimensionId,
        dimension_name: v.dimensionName,
        piece_number: v.pieceNumber,
        value: v.value,
        is_oot: v.isOot,
        tool_it_nums: (toolByDim.get(dimKey) || []).join("|")
      });
    }

    for (const m of missingPieces) {
      rows.push({
        _line: idx + 2,
        record_key: record.recordKey || `${record.jobId || ""}_${record.operationId || record.operationRef || ""}`,
        job_id: record.jobId,
        part_id: record.partId,
        part_revision: record.partRevision,
        operation_id: record.operationId,
        operation_ref: record.operationRef,
        lot: record.lot,
        qty: record.qty,
        operator_user_id: record.operatorUserId,
        status: record.status || "incomplete",
        comment: record.comment,
        piece_number: m.pieceNumber,
        value: "",
        missing_reason: m.reason,
        nc_num: m.ncNum,
        details: m.details
      });
    }
  }

  return normalizeObjectRows(rows);
}

async function getDefaultOperatorUserId(client) {
  const preferred = await client.query(
    "SELECT id FROM users WHERE active=true AND role='Operator' ORDER BY id ASC LIMIT 1"
  );
  if (preferred.rows[0]) return Number(preferred.rows[0].id);
  const fallback = await client.query(
    "SELECT id FROM users WHERE active=true ORDER BY id ASC LIMIT 1"
  );
  return fallback.rows[0] ? Number(fallback.rows[0].id) : null;
}

async function importMeasurementsRows(rows, options = {}) {
  const sourceType = String(options.sourceType || "manual");
  const role = options.role || null;
  const requireOpenJob = options.requireOpenJob !== false;
  const requireLockOwnerUserId = parsePositiveInteger(options.requireLockOwnerUserId);

  const { normalized, unresolved: unresolvedFromParse } = normalizeMeasurementRows(rows, options);

  const unresolvedItems = [...unresolvedFromParse];
  const errors = [];
  let recordsInserted = 0;

  const grouped = new Map();
  for (const row of normalized) {
    const key = row.recordKey || `${row.jobId}|${row.operationId || row.operationRef || ""}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  for (const groupRows of grouped.values()) {
    const firstRow = groupRows[0];
    try {
      await transaction(async (client) => {
        const jobRes = await client.query("SELECT * FROM jobs WHERE id=$1 FOR UPDATE", [firstRow.jobId]);
        const job = jobRes.rows[0];
        if (!job) throw new Error(`line_${firstRow.line}: job_not_found`);

        if (requireOpenJob && !["open", "draft", "incomplete"].includes(job.status)) {
          throw new Error(`line_${firstRow.line}: job_not_open`);
        }

        const operatorUserId = parsePositiveInteger(options.forceOperatorUserId || firstRow.operatorUserId)
          || await getDefaultOperatorUserId(client);
        if (!operatorUserId) throw new Error(`line_${firstRow.line}: operator_not_found`);

        const userRes = await client.query("SELECT id FROM users WHERE id=$1", [operatorUserId]);
        if (!userRes.rows[0]) throw new Error(`line_${firstRow.line}: operator_not_found`);

        if (requireLockOwnerUserId) {
          if (!job.lock_owner_user_id || Number(job.lock_owner_user_id) !== requireLockOwnerUserId) {
            throw new Error(`line_${firstRow.line}: job_lock_mismatch`);
          }
        }

        const partId = firstRow.partId || job.part_id;
        const partRevision = firstRow.partRevision || job.part_revision_code || "A";

        let operationId = parsePositiveInteger(options.forceOperationId || firstRow.operationId);
        if (!operationId) {
          const opNumber = normalizeOperationNumber(firstRow.operationRef);
          if (opNumber) {
            const rawOp = String(Number(opNumber));
            const opCandidates = Array.from(new Set([
              opNumber,
              rawOp,
              String(rawOp).padStart(3, "0"),
              String(rawOp).replace(/^0+/, "") || "0"
            ]));
            const opRes = await client.query(
              "SELECT id FROM operations WHERE part_id=$1 AND op_number = ANY($2) LIMIT 1",
              [partId, opCandidates]
            );
            if (opRes.rows[0]) operationId = Number(opRes.rows[0].id);
          }
        }
        if (!operationId) operationId = Number(job.operation_id);

        if (job.part_id !== partId || Number(job.operation_id) !== Number(operationId)) {
          throw new Error(`line_${firstRow.line}: job_mismatch`);
        }

        const hasRevision = await validatePartRevision(client, partId, partRevision, role);
        if (!hasRevision) throw new Error(`line_${firstRow.line}: part_revision_not_found`);

        const dimsRes = await client.query(
          `SELECT id, name, nominal, tol_plus, tol_minus, unit, sampling, sampling_interval, input_mode
           FROM dimensions
           WHERE operation_id=$1
           ORDER BY id ASC`,
          [operationId]
        );
        const dims = dimsRes.rows;
        if (!dims.length) throw new Error(`line_${firstRow.line}: operation_dimensions_not_found`);

        const dimById = new Map(dims.map((d) => [Number(d.id), d]));
        const dimByCanonName = new Map();
        for (const d of dims) {
          const key = canonicalDimensionName(d.name);
          if (!dimByCanonName.has(key)) dimByCanonName.set(key, []);
          dimByCanonName.get(key).push(d);
        }

        const valueRows = [];
        const missingByPiece = new Map();
        const toolLinks = [];

        for (const row of groupRows) {
          let dim = null;
          if (row.dimensionId && dimById.has(Number(row.dimensionId))) {
            dim = dimById.get(Number(row.dimensionId));
          } else if (row.dimensionName) {
            const key = canonicalDimensionName(row.dimensionName);
            const matches = dimByCanonName.get(key) || [];
            if (matches.length === 1) dim = matches[0];
            else {
              unresolvedItems.push({
                line: row.line,
                reason: "dimension_ambiguous_or_missing",
                confidence: matches.length > 1 ? 0.45 : 0.2,
                payload: {
                  inferred: row,
                  suggestions: matches.map((m) => ({ id: m.id, name: m.name })),
                  availableDimensions: dims.map((m) => ({ id: m.id, name: m.name }))
                }
              });
              continue;
            }
          }

          if (!dim) {
            unresolvedItems.push({
              line: row.line,
              reason: "dimension_not_found",
              confidence: 0.2,
              payload: {
                inferred: row,
                availableDimensions: dims.map((m) => ({ id: m.id, name: m.name }))
              }
            });
            continue;
          }

          if (row.missingReason) {
            missingByPiece.set(Number(row.pieceNumber), {
              pieceNumber: Number(row.pieceNumber),
              reason: row.missingReason,
              ncNum: row.ncNum || null,
              details: row.details || null
            });
            continue;
          }

          const normalizedValue = inferMeasurementValue(row.value);
          if (!validateMeasurementValueForMode(normalizedValue, dim)) {
            unresolvedItems.push({
              line: row.line,
              reason: "invalid_value_for_dimension_mode",
              confidence: 0.35,
              payload: {
                inferred: row,
                dimension: { id: dim.id, name: dim.name, inputMode: dim.input_mode }
              }
            });
            continue;
          }

          const oot = row.isOot === undefined ? inferIsOot(normalizedValue, dim) : !!row.isOot;
          valueRows.push({
            dimensionId: Number(dim.id),
            pieceNumber: Number(row.pieceNumber),
            value: normalizedValue,
            isOot: oot
          });

          for (const itNum of row.toolItNums || []) {
            toolLinks.push({
              dimensionId: Number(dim.id),
              itNum
            });
          }
        }

        const dedupedValues = Array.from(
          new Map(valueRows.map((v) => [`${v.dimensionId}_${v.pieceNumber}`, v])).values()
        );
        if (dedupedValues.length === 0 && missingByPiece.size === 0) {
          throw new Error(`line_${firstRow.line}: no_mappable_rows`);
        }

        const lot = firstRow.lot || job.lot;
        const qty = firstRow.qty || Number(job.qty);
        const anyMissing = missingByPiece.size > 0;
        const rowStatus = String(firstRow.status || "").toLowerCase();
        const status = VALID_MEASUREMENT_RECORD_STATUS.includes(rowStatus)
          ? rowStatus
          : (anyMissing ? "incomplete" : "complete");
        const comment = firstRow.comment || null;
        const oot = dedupedValues.some((v) => v.isOot);

        const recRes = await client.query(
          `INSERT INTO records (job_id, part_id, operation_id, lot, qty, operator_user_id, status, oot, comment)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING *`,
          [firstRow.jobId, partId, operationId, lot, qty, operatorUserId, status, oot, comment]
        );
        const record = recRes.rows[0];

        for (const d of dims) {
          await client.query(
            `INSERT INTO record_dimension_snapshots
               (record_id, dimension_id, name, nominal, tol_plus, tol_minus, unit, sampling, sampling_interval, input_mode)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              record.id,
              Number(d.id),
              d.name,
              d.nominal,
              d.tol_plus,
              d.tol_minus,
              d.unit,
              d.sampling,
              d.sampling_interval ?? null,
              d.input_mode || "single"
            ]
          );
        }

        for (const v of dedupedValues) {
          await client.query(
            `INSERT INTO record_values (record_id, dimension_id, piece_number, value, is_oot)
             VALUES ($1,$2,$3,$4,$5)`,
            [record.id, v.dimensionId, v.pieceNumber, String(v.value), !!v.isOot]
          );
        }

        if (toolLinks.length) {
          const uniqueItNums = Array.from(new Set(toolLinks.map((t) => t.itNum)));
          const toolRes = await client.query(
            "SELECT id, it_num FROM tools WHERE UPPER(it_num) = ANY($1)",
            [uniqueItNums.map((v) => String(v).toUpperCase())]
          );
          const toolByIt = new Map(toolRes.rows.map((r) => [String(r.it_num).toUpperCase(), Number(r.id)]));
          const toolRows = [];
          for (const link of toolLinks) {
            const toolId = toolByIt.get(String(link.itNum).toUpperCase());
            if (!toolId) {
              unresolvedItems.push({
                line: firstRow.line,
                reason: "tool_it_num_not_found",
                confidence: 0.5,
                payload: {
                  inferred: link,
                  context: { jobId: firstRow.jobId, operationId }
                }
              });
              continue;
            }
            toolRows.push({ dimensionId: link.dimensionId, toolId, itNum: link.itNum });
          }

          const dedupedTools = Array.from(
            new Map(toolRows.map((t) => [`${t.dimensionId}_${t.toolId}`, t])).values()
          );
          for (const t of dedupedTools) {
            await client.query(
              `INSERT INTO record_tools (record_id, dimension_id, tool_id, it_num)
               VALUES ($1,$2,$3,$4)
               ON CONFLICT DO NOTHING`,
              [record.id, t.dimensionId, t.toolId, t.itNum]
            );
          }
        }

        for (const m of missingByPiece.values()) {
          await client.query(
            `INSERT INTO missing_pieces (record_id, piece_number, reason, nc_num, details)
             VALUES ($1,$2,$3,$4,$5)`,
            [record.id, m.pieceNumber, m.reason, m.ncNum, m.details]
          );
        }

        await client.query(
          "UPDATE jobs SET status=$1, lock_owner_user_id=NULL, lock_timestamp=NULL WHERE id=$2",
          [status === "complete" ? "closed" : "incomplete", firstRow.jobId]
        );
      });

      recordsInserted += 1;
    } catch (err) {
      errors.push({
        line: firstRow.line,
        item: firstRow.jobId,
        error: safeErrorCode(err)
      });
    }
  }

  return {
    ok: errors.length === 0,
    totalRows: rows.length,
    inserted: recordsInserted,
    updated: 0,
    failed: errors.length,
    errors,
    unresolvedCount: unresolvedItems.length,
    unresolvedItems,
    sourceType
  };
}

async function persistUnresolvedItems(items, meta = {}) {
  if (!Array.isArray(items) || !items.length) return;
  for (const item of items) {
    await query(
      `INSERT INTO import_unresolved_items
         (run_id, source_type, import_type, line_number, reason, confidence, payload)
       VALUES ($1,$2,'measurements',$3,$4,$5,$6)`,
      [
        meta.runId || null,
        String(meta.sourceType || "manual"),
        item.line || null,
        String(item.reason || "unresolved"),
        item.confidence ?? null,
        item.payload || {}
      ]
    );
  }
}

async function persistExternalEntityRefs(items, meta = {}) {
  if (!Array.isArray(items) || !items.length) return;
  for (const item of items) {
    const importType = parseImportType(item.importType || meta.importType);
    const entityType = truncateText(item.entityType, 80);
    const externalId = truncateText(item.externalId, 240);
    if (!importType || !entityType || !externalId) continue;

    await query(
      `INSERT INTO import_external_entity_refs
         (import_type, entity_type, external_id, source_type, latest_internal_ref, first_run_id, last_run_id)
       VALUES ($1,$2,$3,$4,$5,$6,$6)
       ON CONFLICT (import_type, entity_type, external_id) DO UPDATE
         SET source_type=EXCLUDED.source_type,
             latest_internal_ref=EXCLUDED.latest_internal_ref,
             last_seen_at=NOW(),
             hit_count=import_external_entity_refs.hit_count + 1,
             last_run_id=EXCLUDED.last_run_id`,
      [
        importType,
        entityType,
        externalId,
        parseSourceType(item.sourceType || meta.sourceType) || "api_pull",
        item.internalRef || {},
        meta.runId || null
      ]
    );
  }
}

export function summarizeForRun(result, runtime = null) {
  const summary = {
    totalRows: Number(result?.totalRows || 0),
    inserted: Number(result?.inserted || 0),
    updated: Number(result?.updated || 0),
    failed: Number(result?.failed || 0),
    unresolvedCount: Number(result?.unresolvedCount || 0),
    externalRefCount: Number(result?.externalRefCount || 0),
    adapter: result?.adapter || null
  };

  if (runtime) {
    summary.runtime = {
      status: String(runtime.status || "success"),
      duplicate: Boolean(runtime.duplicate),
      attemptCount: Array.isArray(runtime.attempts) ? runtime.attempts.length : 0,
      attempts: Array.isArray(runtime.attempts) ? runtime.attempts : [],
      idempotencyKey: runtime.idempotencyKey || null,
      replayMetadata: runtime.replayMetadata || null,
      supportBundle: runtime.supportBundle || null
    };
  }

  return summary;
}

export function deriveSupportBundleFromRunRow(runRow) {
  const existing = runRow?.summary?.runtime?.supportBundle;
  if (existing && typeof existing === "object") {
    return existing;
  }

  return buildIntegrationSupportBundle({
    run: {
      id: runRow?.id || null,
      status: runRow?.status || "unknown",
      triggerMode: runRow?.trigger_mode || null,
      sourceType: runRow?.source_type || null,
      importType: runRow?.import_type || null,
      startedAt: runRow?.created_at || null,
      finishedAt: runRow?.created_at || null
    },
    envelope: {
      sourceType: runRow?.source_type || null,
      importType: runRow?.import_type || null,
      payloadVersion: "1.0",
      provenance: {
        integrationId: runRow?.integration_id || null,
        triggerMode: runRow?.trigger_mode || null,
        adapter: runRow?.summary?.adapter?.adapterPack || null
      }
    },
    attempts: runRow?.summary?.runtime?.attempts || [],
    unresolvedItems: [],
    errors: Array.isArray(runRow?.errors) ? runRow.errors : []
  });
}

async function insertRunLog({ integrationId = null, sourceType, importType, triggerMode, result, runtime = null }) {
  const summary = summarizeForRun(result, runtime);
  const status = runtime?.status || deriveRunStatus(summary);
  const errors = Array.isArray(result?.errors) ? result.errors : [];

  const runRes = await query(
    `INSERT INTO import_runs
       (integration_id, source_type, import_type, trigger_mode, status, total_rows, inserted_count, updated_count, failed_count, summary, errors)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      integrationId,
      sourceType,
      importType,
      triggerMode,
      status,
      summary.totalRows,
      summary.inserted,
      summary.updated,
      summary.failed,
      JSON.stringify(summary),
      JSON.stringify(errors)
    ]
  );

  return { runId: Number(runRes.rows[0].id), status };
}

async function runImportByType({ importType, payload, sourceType = "manual", role = null, options = {} }) {
  if (!VALID_IMPORT_TYPES.includes(importType)) {
    throw new Error("invalid_import_type");
  }

  if (importType === "measurements") {
    let rows = [];
    if (Array.isArray(payload?.records)) {
      rows = rowsFromMeasurementRecords(payload.records);
    } else {
      rows = rowsFromPayload(payload);
    }
    if (!rows.length) {
      throw new Error("csv_no_rows");
    }
    return importMeasurementsRows(rows, {
      sourceType,
      role,
      forceJobId: options.forceJobId,
      forcePartId: options.forcePartId,
      forceOperationId: options.forceOperationId,
      forceOperatorUserId: options.forceOperatorUserId,
      defaultStatus: options.defaultStatus,
      defaultComment: options.defaultComment,
      requireOpenJob: options.requireOpenJob,
      requireLockOwnerUserId: options.requireLockOwnerUserId
    });
  }

  const rows = rowsFromPayload(payload);
  if (!rows.length) {
    throw new Error("csv_no_rows");
  }

  if (importType === "tools") {
    return importToolsRows(rows);
  }
  if (importType === "part_dimensions") {
    return importPartDimensionsRows(rows, role);
  }
  if (importType === "jobs") {
    return importJobsRows(rows, role);
  }

  throw new Error("unsupported_import_type");
}

async function fetchIntegrationPayload(integration) {
  if (!integration.endpoint_url) {
    throw new Error("endpoint_url_required");
  }

  const headers = {};
  if (integration.auth_header) {
    headers.Authorization = integration.auth_header;
  }

  const res = await fetch(integration.endpoint_url, { method: "GET", headers });
  const contentType = String(res.headers.get("content-type") || "").toLowerCase();
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`upstream_${res.status}`);
  }

  if (contentType.includes("application/json")) {
    return JSON.parse(text || "{}");
  }

  return { csvText: text };
}

async function executeConnectorManagedImport({
  integrationId = null,
  sourceType,
  importType,
  triggerMode = "manual",
  payload,
  role = "Admin",
  options = {}
}) {
  const adapterPack = resolveAdapterPack({ importType, payload, options });
  const adapterResult = adapterPack === "erp_job_v1"
    ? adaptErpJobsPayload({
        payload,
        sourceType,
        triggerMode,
        integrationId
      })
    : null;
  const runtimePayload = adapterResult?.payload || payload;

  const payloadFingerprint = createPayloadFingerprint(runtimePayload);
  const envelopeInput = buildRuntimeEnvelopeInput({
    sourceType,
    importType,
    payload: runtimePayload,
    triggerMode,
    integrationId,
    adapterName: adapterResult?.adapterPack || null,
    actorRole: role,
    payloadFingerprint
  });
  const externalRefs = buildExternalEntityRefs({
    importType: envelopeInput.importType,
    payload: runtimePayload,
    sourceType: envelopeInput.sourceType
  });

  const runtime = await executeConnectorRuntime({
    envelopeInput,
    ledger: {
      register: async (idempotencyKey) => registerIdempotencyLedgerEntry({
        idempotencyKey,
        sourceType: envelopeInput.sourceType,
        importType: envelopeInput.importType,
        externalKey: envelopeInput.externalKey,
        payloadFingerprint
      })
    },
    jitterSeed: integrationId
      ? `integration:${integrationId}:${normalizeTriggerMode(triggerMode)}`
      : `${parseSourceType(sourceType)}:${parseImportType(importType)}:${normalizeTriggerMode(triggerMode)}`,
    executeImport: async ({ envelope }) => {
      const imported = await runImportByType({
        importType: envelope.importType,
        payload: envelope.payload,
        sourceType: envelope.sourceType,
        role,
        options
      });
      return normalizeRuntimeImportResult(imported);
    }
  });

  const normalized = normalizeRuntimeImportResult(runtime.result || {});
  normalized.errors = mergeRunErrors({
    resultErrors: normalized.errors,
    runtimeErrors: runtime.errors
  });
  const adaptedNormalized = applyAdapterResultToImportResult(normalized, adapterResult);
  adaptedNormalized.externalRefCount = externalRefs.length;

  return {
    result: {
      ...adaptedNormalized,
      duplicate: Boolean(runtime.duplicate),
      idempotencyKey: runtime.idempotencyKey || null,
      runtimeAttempts: Array.isArray(runtime.attempts) ? runtime.attempts : [],
      replayMetadata: runtime.replayMetadata || null,
      supportBundle: runtime.supportBundle || null
    },
    runtime,
    externalRefs
  };
}

async function executeDirectImportWithAudit({
  importType,
  payload,
  sourceType,
  role,
  triggerMode = "manual",
  options = {}
}) {
  const { result, runtime, externalRefs } = await executeConnectorManagedImport({
    integrationId: null,
    sourceType,
    importType,
    payload,
    role,
    triggerMode,
    options
  });

  const run = await insertRunLog({
    integrationId: null,
    sourceType,
    importType,
    triggerMode,
    result,
    runtime
  });

  await persistUnresolvedItems(result.unresolvedItems || [], {
    runId: run.runId,
    sourceType
  });
  await persistExternalEntityRefs(externalRefs || [], {
    runId: run.runId,
    sourceType,
    importType
  });
  await finalizeIdempotencyLedgerEntry({
    idempotencyKey: result.idempotencyKey,
    runId: run.runId,
    runStatus: run.status
  });

  return {
    ...result,
    ok: Number(result?.failed || 0) === 0,
    runId: run.runId,
    runStatus: run.status
  };
}

export function integrationLastMessage(result, runtime, status) {
  if (status === "error") {
    const runtimeCode = runtime?.errors?.[0]?.code;
    const rowError = result?.errors?.[0]?.error;
    return runtimeCode || rowError || "failed";
  }

  const attemptCount = Array.isArray(runtime?.attempts) ? runtime.attempts.length : 0;
  return [
    `rows=${Number(result?.totalRows || 0)}`,
    `inserted=${Number(result?.inserted || 0)}`,
    `updated=${Number(result?.updated || 0)}`,
    `failed=${Number(result?.failed || 0)}`,
    `attempts=${attemptCount}`,
    `duplicate=${Boolean(runtime?.duplicate)}`
  ].join(" ");
}

async function runConfiguredIntegration(integration, { triggerMode = "manual", payloadOverride = null, role = "Admin" } = {}) {
  const sourceType = String(integration.source_type);
  const importType = String(integration.import_type);

  const payload = payloadOverride || await fetchIntegrationPayload(integration);
  const { result, runtime, externalRefs } = await executeConnectorManagedImport({
    integrationId: integration.id,
    sourceType,
    importType,
    payload,
    role,
    triggerMode,
    options: integration.options || {}
  });

  const run = await insertRunLog({
    integrationId: integration.id,
    sourceType,
    importType,
    triggerMode,
    result,
    runtime
  });

  await persistUnresolvedItems(result.unresolvedItems || [], {
    runId: run.runId,
    sourceType
  });
  await persistExternalEntityRefs(externalRefs || [], {
    runId: run.runId,
    sourceType,
    importType
  });
  await finalizeIdempotencyLedgerEntry({
    idempotencyKey: result.idempotencyKey,
    runId: run.runId,
    runStatus: run.status
  });

  await query(
    `UPDATE import_integrations
     SET last_run_at=NOW(),
         last_status=$2,
         last_message=$3,
         updated_at=NOW()
     WHERE id=$1`,
    [
      integration.id,
      run.status,
      integrationLastMessage(result, runtime, run.status)
    ]
  );

  return {
    ...result,
    runId: run.runId,
    runStatus: run.status
  };
}

async function pollScheduledIntegrations() {
  const { rows } = await query(
    `SELECT *
     FROM import_integrations
     WHERE enabled=true
       AND poll_interval_minutes IS NOT NULL
       AND source_type IN ('api_pull','excel_sheet')
       AND (
         last_run_at IS NULL
         OR last_run_at <= NOW() - make_interval(mins => poll_interval_minutes)
       )
     ORDER BY id ASC
     LIMIT 20`
  );

  for (const integration of rows) {
    try {
      await runConfiguredIntegration(integration, { triggerMode: "scheduled", role: "Admin" });
    } catch (err) {
      await query(
        `UPDATE import_integrations
         SET last_run_at=NOW(),
             last_status='error',
             last_message=$2,
             updated_at=NOW()
         WHERE id=$1`,
        [integration.id, safeErrorCode(err)]
      );
    }
  }
}

export function startImportScheduler() {
  if (process.env.NODE_ENV === "test") return;
  if (schedulerHandle) return;
  schedulerHandle = setInterval(() => {
    pollScheduledIntegrations().catch(() => {});
  }, 60 * 1000);

  setTimeout(() => {
    pollScheduledIntegrations().catch(() => {});
  }, 4000);
}

// Configurable upper bound on measurements per import. Read at call time so tests can override.
function getMaxMeasurements() {
  const parsed = Number(process.env.MAX_MEASUREMENTS_PER_IMPORT || 50000);
  if (!Number.isFinite(parsed) || parsed <= 0) return 50000;
  return Math.floor(parsed);
}

const METROLOGY_PARSER_PACKS = Object.freeze({
  cmm_point_csv_v1: Object.freeze({
    id: "cmm_point_csv_v1",
    family: "cmm",
    description: "Delimited CMM output rows mapped to canonical measurement fields."
  }),
  vision_result_json_v1: Object.freeze({
    id: "vision_result_json_v1",
    family: "vision",
    description: "Vision-system JSON payloads mapped to canonical measurement rows."
  }),
  gage_log_plaintext_v1: Object.freeze({
    id: "gage_log_plaintext_v1",
    family: "gage",
    description: "Plaintext gage logs with key=value tokens mapped to measurement rows."
  })
});

function canonicalHeader(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsvLine(line) {
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

function parseCsvText(csvText) {
  const lines = String(csvText || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]).map(canonicalHeader);
  const rows = lines.slice(1).map((line, idx) => {
    const values = parseCsvLine(line);
    const row = { _line: idx + 2, _raw: line };
    headers.forEach((header, i) => {
      row[header] = values[i] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

function firstValue(row, keys) {
  for (const key of keys) {
    const v = row[canonicalHeader(key)];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}

function parsePositiveInteger(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function parseOptionalBoolean(raw) {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return undefined;
  if (["true", "1", "yes", "y", "pass", "ok"].includes(value)) return true;
  if (["false", "0", "no", "n", "fail"].includes(value)) return false;
  return undefined;
}

function normalizeRowCore({
  line,
  raw,
  jobId,
  partId,
  partRevision,
  operationRef,
  operationId,
  operatorUserId,
  lot,
  pieceNumber,
  dimensionName,
  dimensionId,
  dimensionExternalId,
  value,
  isOot,
  toolItNums = []
}) {
  const errors = [];
  if (!jobId) errors.push("job_id_required");
  if (!operationRef && !operationId) errors.push("operation_required");
  if (!pieceNumber) errors.push("piece_number_required");
  if (!dimensionName && !dimensionId && !dimensionExternalId) errors.push("dimension_required");
  if (value === null || value === undefined || String(value).trim() === "") errors.push("value_required");

  if (errors.length) {
    return {
      ok: false,
      rejected: {
        line,
        errors,
        raw
      }
    };
  }

  return {
    ok: true,
    row: {
      line,
      jobId: String(jobId).trim(),
      partId: String(partId || "").trim() || null,
      partRevision: String(partRevision || "").trim().toUpperCase() || "A",
      operationRef: operationRef ? String(operationRef).trim() : null,
      operationId: operationId ? Number(operationId) : null,
      operatorUserId: operatorUserId ? Number(operatorUserId) : null,
      lot: String(lot || "").trim() || null,
      pieceNumber: Number(pieceNumber),
      dimensionName: dimensionName ? String(dimensionName).trim() : null,
      dimensionId: dimensionId ? Number(dimensionId) : null,
      dimensionExternalId: dimensionExternalId ? String(dimensionExternalId).trim() : null,
      value: String(value).trim(),
      isOot,
      toolItNums
    }
  };
}

function parseCmmCsv(payload) {
  const maxMeasurements = getMaxMeasurements();
  const rawText = typeof payload === "string"
    ? payload
    : String(payload?.rawText || payload?.csvText || "");
  const { rows } = parseCsvText(rawText);

  // Guard: enforce MAX_MEASUREMENTS before any array allocation or iteration
  if (rows.length > maxMeasurements) {
    return { ok: false, error: "measurement_limit_exceeded", limit: maxMeasurements, received: rows.length };
  }

  const accepted = [];
  const rejected = [];

  for (const row of rows) {
    const pieceNumber = parsePositiveInteger(firstValue(row, ["piece_number", "piece", "sample"]));
    const operationRef = firstValue(row, ["operation_ref", "op_number", "operation", "op"]).trim();
    const operationId = parsePositiveInteger(firstValue(row, ["operation_id", "op_id"]));
    const dimensionId = parsePositiveInteger(firstValue(row, ["dimension_id", "characteristic_id", "feature_id"]));
    const dimensionExternalId = firstValue(
      row,
      ["dimension_external_id", "characteristic_external_id", "characteristic_id", "feature_id", "bubble_id"]
    ).trim();
    const dimensionName = firstValue(row, ["dimension_name", "feature", "characteristic", "char"]).trim();
    const result = normalizeRowCore({
      line: row._line,
      raw: row,
      jobId: firstValue(row, ["job_id", "job", "job_number", "work_order", "workorder"]).trim(),
      partId: firstValue(row, ["part_id", "part", "part_number"]).trim(),
      partRevision: firstValue(row, ["part_revision", "part_revision_code", "revision"]).trim() || "A",
      operationRef,
      operationId,
      operatorUserId: parsePositiveInteger(firstValue(row, ["operator_user_id", "user_id", "operator_id"])),
      lot: firstValue(row, ["lot", "lot_number"]).trim(),
      pieceNumber,
      dimensionName,
      dimensionId,
      dimensionExternalId,
      value: firstValue(row, ["value", "measurement", "result", "actual", "actual_value"]).trim(),
      isOot: parseOptionalBoolean(firstValue(row, ["is_oot", "oot", "out_of_tolerance"])),
      toolItNums: String(firstValue(row, ["tool_it_nums", "tool_it_num", "tool_it", "it_num"]) || "")
        .split(/[;|,]/)
        .map((v) => v.trim().toUpperCase())
        .filter(Boolean)
    });
    if (result.ok) accepted.push(result.row);
    else rejected.push(result.rejected);
  }

  return {
    parserPack: "cmm_point_csv_v1",
    totalRows: rows.length,
    acceptedRows: accepted.length,
    rejectedRows: rejected.length,
    rows: accepted,
    rejected
  };
}

function parseVisionJson(payload) {
  const maxMeasurements = getMaxMeasurements();
  let body = payload;
  if (typeof payload === "string") {
    body = JSON.parse(payload);
  } else if (payload && typeof payload === "object" && typeof payload.rawJson === "string") {
    body = JSON.parse(payload.rawJson);
  }

  const measurements = Array.isArray(body?.measurements) ? body.measurements : [];

  // Guard: enforce MAX_MEASUREMENTS before any array allocation or iteration
  if (measurements.length > maxMeasurements) {
    return { ok: false, error: "measurement_limit_exceeded", limit: maxMeasurements, received: measurements.length };
  }

  const accepted = [];
  const rejected = [];

  for (let idx = 0; idx < measurements.length; idx += 1) {
    const item = measurements[idx] || {};
    const row = {
      _line: idx + 1,
      ...item
    };
    const result = normalizeRowCore({
      line: idx + 1,
      raw: row,
      jobId: item.jobId || body?.jobId || body?.job_id,
      partId: item.partId || body?.partId || body?.part_id,
      partRevision: item.partRevision || body?.partRevision || body?.part_revision || "A",
      operationRef: item.operationRef || item.opNumber || body?.operationRef || body?.opNumber || body?.op_number,
      operationId: parsePositiveInteger(item.operationId || item.operation_id || body?.operationId || body?.operation_id),
      operatorUserId: parsePositiveInteger(item.operatorUserId || item.operator_user_id || body?.operatorUserId || body?.operator_user_id),
      lot: item.lot || body?.lot,
      pieceNumber: parsePositiveInteger(item.pieceNumber || item.piece_number || item.sample),
      dimensionName: item.dimensionName || item.feature || item.characteristic || item.name,
      dimensionId: parsePositiveInteger(item.dimensionId || item.dimension_id || item.characteristicId),
      dimensionExternalId: item.dimensionExternalId || item.dimension_external_id || item.characteristicExternalId || item.characteristic_external_id || null,
      value: item.value ?? item.measurement ?? item.result ?? item.actual,
      isOot: parseOptionalBoolean(item.isOot ?? item.is_oot ?? item.outOfTolerance),
      toolItNums: Array.isArray(item.toolItNums)
        ? item.toolItNums.map((v) => String(v).trim().toUpperCase()).filter(Boolean)
        : []
    });
    if (result.ok) accepted.push(result.row);
    else rejected.push(result.rejected);
  }

  return {
    parserPack: "vision_result_json_v1",
    totalRows: measurements.length,
    acceptedRows: accepted.length,
    rejectedRows: rejected.length,
    rows: accepted,
    rejected
  };
}

function parseGagePlaintext(payload) {
  const maxMeasurements = getMaxMeasurements();
  const rawText = typeof payload === "string"
    ? payload
    : String(payload?.rawText || payload?.text || "");
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  // Guard: enforce MAX_MEASUREMENTS before any array allocation or iteration
  if (lines.length > maxMeasurements) {
    return { ok: false, error: "measurement_limit_exceeded", limit: maxMeasurements, received: lines.length };
  }

  const accepted = [];
  const rejected = [];
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    const tokens = line.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
    const map = {};
    for (const token of tokens) {
      const sep = token.indexOf("=");
      if (sep <= 0) continue;
      const key = canonicalHeader(token.slice(0, sep));
      const value = token.slice(sep + 1).trim();
      map[key] = value;
    }

    const result = normalizeRowCore({
      line: idx + 1,
      raw: { line, map },
      jobId: firstValue(map, ["job", "job_id", "job_number"]),
      partId: firstValue(map, ["part", "part_id", "part_number"]),
      partRevision: firstValue(map, ["revision", "part_revision", "part_revision_code"]) || "A",
      operationRef: firstValue(map, ["op", "op_number", "operation", "operation_ref"]),
      operationId: parsePositiveInteger(firstValue(map, ["operation_id", "op_id"])),
      operatorUserId: parsePositiveInteger(firstValue(map, ["operator", "operator_user_id", "user_id"])),
      lot: firstValue(map, ["lot", "lot_number"]),
      pieceNumber: parsePositiveInteger(firstValue(map, ["piece", "piece_number", "sample"])),
      dimensionName: firstValue(map, ["feature", "characteristic", "dimension_name", "char"]),
      dimensionId: parsePositiveInteger(firstValue(map, ["dimension_id", "feature_id", "characteristic_id"])),
      dimensionExternalId: firstValue(map, ["dimension_external_id", "characteristic_external_id", "characteristic_id", "feature_id", "bubble_id"]),
      value: firstValue(map, ["value", "measurement", "result", "actual"]),
      isOot: parseOptionalBoolean(firstValue(map, ["oot", "is_oot", "out_of_tolerance"])),
      toolItNums: String(firstValue(map, ["tool_it", "tool_it_num", "it_num"]) || "")
        .split(/[;|,]/)
        .map((v) => v.trim().toUpperCase())
        .filter(Boolean)
    });
    if (result.ok) accepted.push(result.row);
    else rejected.push(result.rejected);
  }

  return {
    parserPack: "gage_log_plaintext_v1",
    totalRows: lines.length,
    acceptedRows: accepted.length,
    rejectedRows: rejected.length,
    rows: accepted,
    rejected
  };
}

function detectParserPack(payload) {
  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.measurements)) return "vision_result_json_v1";
    if (typeof payload.rawJson === "string") return "vision_result_json_v1";
  }

  const text = typeof payload === "string"
    ? payload
    : String(payload?.rawText || payload?.csvText || payload?.text || "");
  if (!text.trim()) return null;

  const firstLine = text.split(/\r?\n/).find((line) => line.trim() !== "") || "";
  if (firstLine.includes(",") && /job|part|op|feature|dimension|value/i.test(firstLine)) {
    return "cmm_point_csv_v1";
  }
  if (/[a-z0-9_]+\s*=/.test(firstLine.toLowerCase())) {
    return "gage_log_plaintext_v1";
  }
  return null;
}

export function listMetrologyParserPacks() {
  return Object.values(METROLOGY_PARSER_PACKS);
}

export function parseMetrologyPayload({ parserPack = null, payload = null } = {}) {
  const selectedPack = String(parserPack || "").trim() || detectParserPack(payload);
  if (!selectedPack) {
    throw new Error("parser_pack_required_or_undetectable");
  }
  if (!Object.hasOwn(METROLOGY_PARSER_PACKS, selectedPack)) {
    throw new Error("invalid_parser_pack");
  }

  if (selectedPack === "cmm_point_csv_v1") {
    return parseCmmCsv(payload);
  }
  if (selectedPack === "vision_result_json_v1") {
    return parseVisionJson(payload);
  }
  if (selectedPack === "gage_log_plaintext_v1") {
    return parseGagePlaintext(payload);
  }
  throw new Error("invalid_parser_pack");
}

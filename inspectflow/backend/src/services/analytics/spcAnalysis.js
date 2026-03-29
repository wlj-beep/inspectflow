import { analyticsQuery } from "./statementTimeout.js";
import { normalizeIsoTimestamp } from "../dateValidation.js";

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 5000;

const AVAILABLE_RULES = Object.freeze([
  "beyond_spec_limits",
  "point_beyond_3sigma",
  "run_of_8_one_side",
  "trend_of_6"
]);

function toPositiveInt(value, fallback = null) {
  const n = Number(value);
  if (Number.isInteger(n) && n > 0) return n;
  return fallback;
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toOptionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function parseRules(rawRules) {
  const tokens = String(rawRules || "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  if (!tokens.length) {
    return [...AVAILABLE_RULES];
  }
  const filtered = tokens.filter((rule) => AVAILABLE_RULES.includes(rule));
  return filtered.length ? filtered : [...AVAILABLE_RULES];
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function stdDev(values, sample = true) {
  if (!values.length) return null;
  if (values.length === 1) return 0;
  const avg = mean(values);
  if (avg === null) return null;
  const varianceNumerator = values.reduce((acc, value) => acc + (value - avg) ** 2, 0);
  const denominator = sample ? values.length - 1 : values.length;
  if (denominator <= 0) return null;
  return Math.sqrt(varianceNumerator / denominator);
}

function ratio(numerator, denominator) {
  if (!Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

function roundMetric(value, precision = 6) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(precision));
}

function createRuleMap(size) {
  const map = new Map();
  for (let i = 0; i < size; i += 1) {
    map.set(i, new Set());
  }
  return map;
}

function applyRule(map, index, ruleName) {
  if (!map.has(index)) return;
  map.get(index).add(ruleName);
}

function evaluateRules({ points, meanValue, sampleStdDev, lsl, usl, enabledRules }) {
  const enabled = new Set(enabledRules);
  const map = createRuleMap(points.length);

  if (enabled.has("beyond_spec_limits") && Number.isFinite(lsl) && Number.isFinite(usl)) {
    for (let i = 0; i < points.length; i += 1) {
      const value = points[i].value;
      if (value < lsl || value > usl) {
        applyRule(map, i, "beyond_spec_limits");
      }
    }
  }

  if (enabled.has("point_beyond_3sigma") && Number.isFinite(sampleStdDev) && sampleStdDev > 0) {
    const ucl = meanValue + (3 * sampleStdDev);
    const lcl = meanValue - (3 * sampleStdDev);
    for (let i = 0; i < points.length; i += 1) {
      const value = points[i].value;
      if (value > ucl || value < lcl) {
        applyRule(map, i, "point_beyond_3sigma");
      }
    }
  }

  if (enabled.has("run_of_8_one_side") && points.length >= 8) {
    let runStart = 0;
    let runDirection = 0;
    let runLength = 0;
    for (let i = 0; i < points.length; i += 1) {
      const delta = points[i].value - meanValue;
      const direction = delta > 0 ? 1 : (delta < 0 ? -1 : 0);
      if (direction === 0) {
        runDirection = 0;
        runLength = 0;
        runStart = i + 1;
        continue;
      }
      if (direction !== runDirection) {
        runDirection = direction;
        runLength = 1;
        runStart = i;
      } else {
        runLength += 1;
      }
      if (runLength >= 8) {
        for (let idx = runStart; idx <= i; idx += 1) {
          applyRule(map, idx, "run_of_8_one_side");
        }
      }
    }
  }

  if (enabled.has("trend_of_6") && points.length >= 6) {
    for (let i = 5; i < points.length; i += 1) {
      const window = points.slice(i - 5, i + 1).map((point) => point.value);
      const increasing = window.every((value, idx) => idx === 0 || value > window[idx - 1]);
      const decreasing = window.every((value, idx) => idx === 0 || value < window[idx - 1]);
      if (increasing || decreasing) {
        for (let idx = i - 5; idx <= i; idx += 1) {
          applyRule(map, idx, "trend_of_6");
        }
      }
    }
  }

  return map;
}

function buildRuleFindings(ruleMap, enabledRules) {
  const findings = [];
  for (const rule of enabledRules) {
    const indices = [];
    for (const [index, hits] of ruleMap.entries()) {
      if (hits.has(rule)) indices.push(index);
    }
    findings.push({
      rule,
      count: indices.length,
      violatingPointIndices: indices
    });
  }
  return findings;
}

export async function getSpcCharacteristicAnalysis({
  dimensionId,
  operationId = null,
  jobId = null,
  workCenterId = null,
  toolId = null,
  dateFrom = null,
  dateTo = null,
  limit = DEFAULT_LIMIT,
  rules = null,
  siteId = "default"
} = {}) {
  const dimensionIdNum = toPositiveInt(dimensionId);
  if (!dimensionIdNum) {
    throw new Error("invalid_dimension_id");
  }

  const operationIdNum = operationId === null || operationId === undefined || String(operationId).trim() === ""
    ? null
    : toPositiveInt(operationId);
  if (operationId !== null && operationId !== undefined && String(operationId).trim() !== "" && !operationIdNum) {
    throw new Error("invalid_operation_id");
  }

  const safeJobId = String(jobId || "").trim() || null;
  const safeWorkCenterId = toOptionalText(workCenterId);
  const toolIdNum = toolId === null || toolId === undefined || String(toolId).trim() === ""
    ? null
    : toPositiveInt(toolId);
  if (toolId !== null && toolId !== undefined && String(toolId).trim() !== "" && !toolIdNum) {
    throw new Error("invalid_tool_id");
  }

  const safeDateFrom = normalizeIsoTimestamp(dateFrom, "date_from");
  const safeDateTo = normalizeIsoTimestamp(dateTo, "date_to");
  if (safeDateFrom && safeDateTo && safeDateFrom > safeDateTo) {
    throw new Error("invalid_window_range");
  }
  const safeLimit = Math.min(MAX_LIMIT, toPositiveInt(limit, DEFAULT_LIMIT));
  const enabledRules = parseRules(rules);
  let toolFilterParam = null;

  const filters = ["amif.site_id=$1", "amif.dimension_id=$2", "rv.value ~ '^-?[0-9]+(\\.[0-9]+)?$'"];
  const params = [siteId, dimensionIdNum];

  if (operationIdNum) {
    params.push(String(operationIdNum));
    filters.push(`amif.operation_id=$${params.length}`);
  }
  if (safeJobId) {
    params.push(safeJobId);
    filters.push(`amif.job_id=$${params.length}`);
  }
  if (safeWorkCenterId) {
    params.push(safeWorkCenterId);
    filters.push(`amif.work_center_id=$${params.length}`);
  }
  if (toolIdNum) {
    params.push(toolIdNum);
    toolFilterParam = `$${params.length}`;
    filters.push(`EXISTS (
      SELECT 1
      FROM record_tools rt
      WHERE rt.record_id=amif.record_id
        AND rt.dimension_id=amif.dimension_id
        AND rt.tool_id=$${params.length}
    )`);
  }
  if (safeDateFrom) {
    params.push(safeDateFrom);
    filters.push(`amif.event_at >= $${params.length}`);
  }
  if (safeDateTo) {
    params.push(safeDateTo);
    filters.push(`amif.event_at <= $${params.length}`);
  }

  params.push(safeLimit);
  const limitParam = `$${params.length}`;

  const rowsRes = await analyticsQuery(
    `SELECT
       amif.record_id,
       amif.dimension_id,
       amif.piece_number,
       amif.job_id,
       amif.operation_id,
       amif.work_center_id,
       amif.event_at,
       amif.operator_user_id,
       rv.value,
       wc.code AS work_center_code,
       wc.name AS work_center_name,
       tool_ctx.tool_id,
       tool_ctx.it_num,
       tool_ctx.tool_name,
       tool_ctx.tool_type,
       COALESCE(rds.name, d.name) AS dimension_name,
       COALESCE(rds.nominal, d.nominal) AS nominal,
       COALESCE(rds.tol_plus, d.tol_plus) AS tol_plus,
       COALESCE(rds.tol_minus, d.tol_minus) AS tol_minus
     FROM ana_mart_inspection_fact amif
     JOIN record_values rv
       ON rv.record_id=amif.record_id
      AND rv.dimension_id=amif.dimension_id
      AND rv.piece_number=amif.piece_number
     LEFT JOIN record_dimension_snapshots rds
       ON rds.record_id=amif.record_id
      AND rds.dimension_id=amif.dimension_id
     LEFT JOIN dimensions d ON d.id=amif.dimension_id
     LEFT JOIN work_centers wc ON wc.id::TEXT=amif.work_center_id
     LEFT JOIN LATERAL (
       SELECT
         rt.tool_id,
         rt.it_num,
         t.name AS tool_name,
         t.type AS tool_type
       FROM record_tools rt
       JOIN tools t ON t.id=rt.tool_id
       WHERE rt.record_id=amif.record_id
         AND rt.dimension_id=amif.dimension_id
         ${toolFilterParam ? `AND rt.tool_id=${toolFilterParam}` : ""}
        ORDER BY rt.tool_id ASC
        LIMIT 1
     ) tool_ctx ON TRUE
     WHERE ${filters.join(" AND ")}
     ORDER BY amif.event_at ASC, amif.record_id ASC, amif.piece_number ASC
     LIMIT ${limitParam}`,
    params
  );

  const rows = rowsRes.rows || [];
  const points = rows.map((row) => {
    const numericValue = Number(row.value);
    return {
      recordId: Number(row.record_id),
      dimensionId: Number(row.dimension_id),
      pieceNumber: Number(row.piece_number),
      jobId: row.job_id,
      operationId: row.operation_id,
      workCenterId: row.work_center_id || null,
      workCenterCode: row.work_center_code || null,
      workCenterName: row.work_center_name || null,
      timestamp: row.event_at,
      operatorUserId: row.operator_user_id ? Number(row.operator_user_id) : null,
      toolId: row.tool_id ? Number(row.tool_id) : null,
      toolName: row.tool_name || null,
      toolType: row.tool_type || null,
      itNum: row.it_num || null,
      value: numericValue,
      nominal: toFiniteNumber(row.nominal),
      tolPlus: toFiniteNumber(row.tol_plus),
      tolMinus: toFiniteNumber(row.tol_minus),
      dimensionName: row.dimension_name
    };
  }).filter((point) => Number.isFinite(point.value));

  if (!points.length) {
    return {
      contractId: "ANA-KPI-v3",
      capabilityId: "BL-071-spc-v1",
      analysisId: "spc_characteristic_v1",
      siteId,
      filters: {
        dimensionId: dimensionIdNum,
        operationId: operationIdNum,
        jobId: safeJobId,
        workCenterId: safeWorkCenterId,
        toolId: toolIdNum,
        dateFrom: safeDateFrom,
        dateTo: safeDateTo,
        limit: safeLimit
      },
      characteristic: {
        dimensionId: dimensionIdNum,
        dimensionName: null,
        nominal: null,
        tolPlus: null,
        tolMinus: null,
        lsl: null,
        usl: null
      },
      sampleSize: 0,
      statistics: null,
      rulesEvaluated: enabledRules,
      ruleFindings: enabledRules.map((rule) => ({ rule, count: 0, violatingPointIndices: [] })),
      points: []
    };
  }

  const values = points.map((point) => point.value);
  const meanValue = mean(values);
  const sampleStdDev = stdDev(values, true);
  const populationStdDev = stdDev(values, false);
  const latest = points[points.length - 1];
  const nominal = toFiniteNumber(latest.nominal);
  const tolPlus = toFiniteNumber(latest.tolPlus);
  const tolMinus = toFiniteNumber(latest.tolMinus);
  const usl = Number.isFinite(nominal) && Number.isFinite(tolPlus) ? nominal + tolPlus : null;
  const lsl = Number.isFinite(nominal) && Number.isFinite(tolMinus) ? nominal - tolMinus : null;

  const cp = Number.isFinite(usl) && Number.isFinite(lsl) && Number.isFinite(sampleStdDev) && sampleStdDev > 0
    ? (usl - lsl) / (6 * sampleStdDev)
    : null;
  const cpk = Number.isFinite(usl) && Number.isFinite(lsl) && Number.isFinite(sampleStdDev) && sampleStdDev > 0
    ? Math.min(
        (usl - meanValue) / (3 * sampleStdDev),
        (meanValue - lsl) / (3 * sampleStdDev)
      )
    : null;
  const pp = Number.isFinite(usl) && Number.isFinite(lsl) && Number.isFinite(populationStdDev) && populationStdDev > 0
    ? (usl - lsl) / (6 * populationStdDev)
    : null;
  const ppk = Number.isFinite(usl) && Number.isFinite(lsl) && Number.isFinite(populationStdDev) && populationStdDev > 0
    ? Math.min(
        (usl - meanValue) / (3 * populationStdDev),
        (meanValue - lsl) / (3 * populationStdDev)
      )
    : null;

  const ruleMap = evaluateRules({
    points,
    meanValue,
    sampleStdDev,
    lsl,
    usl,
    enabledRules
  });
  const ruleFindings = buildRuleFindings(ruleMap, enabledRules);
  const responsePoints = points.map((point, index) => {
    const ruleHits = Array.from(ruleMap.get(index) || []);
    return {
      index,
      ...point,
      isOutOfControl: ruleHits.length > 0,
      ruleHits
    };
  });

  return {
    contractId: "ANA-KPI-v3",
    capabilityId: "BL-071-spc-v1",
    analysisId: "spc_characteristic_v1",
    siteId,
    filters: {
      dimensionId: dimensionIdNum,
      operationId: operationIdNum,
      jobId: safeJobId,
      workCenterId: safeWorkCenterId,
      toolId: toolIdNum,
      dateFrom: safeDateFrom,
      dateTo: safeDateTo,
      limit: safeLimit
    },
    characteristic: {
      dimensionId: dimensionIdNum,
      dimensionName: latest.dimensionName,
      nominal,
      tolPlus,
      tolMinus,
      lsl: roundMetric(lsl),
      usl: roundMetric(usl)
    },
    sampleSize: points.length,
    statistics: {
      mean: roundMetric(meanValue),
      min: roundMetric(Math.min(...values)),
      max: roundMetric(Math.max(...values)),
      sampleStdDev: roundMetric(sampleStdDev),
      populationStdDev: roundMetric(populationStdDev),
      cp: roundMetric(cp),
      cpk: roundMetric(cpk),
      pp: roundMetric(pp),
      ppk: roundMetric(ppk),
      controlLimits: Number.isFinite(sampleStdDev)
        ? {
            cl: roundMetric(meanValue),
            ucl: roundMetric(meanValue + (3 * sampleStdDev)),
            lcl: roundMetric(meanValue - (3 * sampleStdDev))
          }
        : null
    },
    rulesEvaluated: enabledRules,
    ruleFindings,
    points: responsePoints
  };
}

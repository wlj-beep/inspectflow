export const ANA_MART_CONTRACT_ID = "ANA-MART-v3";
export const ANA_KPI_CONTRACT_ID = "ANA-KPI-v3";
export const ANA_V3_VOCABULARY_VERSION = "2026-03-14";

const INSPECTION_EVENT_DIMENSIONS = Object.freeze([
  "site_id",
  "job_id",
  "part_id",
  "operation_id",
  "lot",
  "work_center_id",
  "operator_user_id"
]);

const INSPECTION_EVENT_MEASURES = Object.freeze([
  "measurement_count",
  "oot_count",
  "pass_count",
  "rework_count"
]);

const CONNECTOR_RUN_DIMENSIONS = Object.freeze(["site_id", "connector_id", "status"]);

const CONNECTOR_RUN_MEASURES = Object.freeze([
  "run_count",
  "failure_count",
  "replayed_count",
  "processed_count",
  "avg_latency_ms"
]);

export const ANA_MART_DEFINITIONS = Object.freeze({
  inspection_event_mart_v1: Object.freeze({
    martId: "inspection_event_mart_v1",
    dimensions: INSPECTION_EVENT_DIMENSIONS,
    measures: INSPECTION_EVENT_MEASURES,
    timeField: "event_at",
    fieldAliases: Object.freeze({
      siteId: "site_id",
      jobId: "job_id",
      partId: "part_id",
      operationId: "operation_id",
      op_number: "operation_id",
      workcenterId: "work_center_id",
      operatorId: "operator_user_id",
      eventAt: "event_at",
      sampled_at: "event_at",
      measurementCount: "measurement_count",
      ootCount: "oot_count",
      passCount: "pass_count",
      reworkCount: "rework_count"
    })
  }),
  connector_run_mart_v1: Object.freeze({
    martId: "connector_run_mart_v1",
    dimensions: CONNECTOR_RUN_DIMENSIONS,
    measures: CONNECTOR_RUN_MEASURES,
    timeField: "run_ended_at",
    fieldAliases: Object.freeze({
      siteId: "site_id",
      connectorId: "connector_id",
      runEndedAt: "run_ended_at",
      finished_at: "run_ended_at",
      runCount: "run_count",
      failureCount: "failure_count",
      unresolved_count: "failure_count",
      replayedRuns: "replayed_count",
      processedCount: "processed_count",
      avgLatencyMs: "avg_latency_ms",
      duration_ms: "avg_latency_ms"
    })
  })
});

export const ANA_KPI_METRIC_KEYS = Object.freeze({
  PASS_PIECES: "pass_pieces",
  TOTAL_PIECES: "total_pieces",
  OOT_PIECES: "oot_pieces",
  CORRECTION_EVENTS: "correction_events",
  CONNECTOR_REPLAYED_RUNS: "connector_replayed_runs",
  CONNECTOR_FAILED_RUNS: "connector_failed_runs",
  CONNECTOR_TOTAL_RUNS: "connector_total_runs"
});

export const ANA_KPI_METRIC_ALIASES = Object.freeze({
  [ANA_KPI_METRIC_KEYS.PASS_PIECES]: Object.freeze(["passCount", "acceptedPieces"]),
  [ANA_KPI_METRIC_KEYS.TOTAL_PIECES]: Object.freeze(["totalPieces"]),
  [ANA_KPI_METRIC_KEYS.OOT_PIECES]: Object.freeze(["ootCount", "ootPieces"]),
  [ANA_KPI_METRIC_KEYS.CORRECTION_EVENTS]: Object.freeze(["correctionEvents", "reworkCount"]),
  [ANA_KPI_METRIC_KEYS.CONNECTOR_REPLAYED_RUNS]: Object.freeze(["replayedRuns"]),
  [ANA_KPI_METRIC_KEYS.CONNECTOR_FAILED_RUNS]: Object.freeze(["failedRuns", "failureCount"]),
  [ANA_KPI_METRIC_KEYS.CONNECTOR_TOTAL_RUNS]: Object.freeze(["totalRuns", "runCount"])
});

const KPI_CANONICAL_KEYS = new Set(Object.values(ANA_KPI_METRIC_KEYS));
const KPI_ALIAS_TO_CANONICAL = new Map();

for (const canonicalKey of KPI_CANONICAL_KEYS) {
  KPI_ALIAS_TO_CANONICAL.set(canonicalKey, canonicalKey);
  for (const alias of ANA_KPI_METRIC_ALIASES[canonicalKey] ?? []) {
    KPI_ALIAS_TO_CANONICAL.set(alias, canonicalKey);
  }
}

function coerceFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function getMartDefinition(martId) {
  return ANA_MART_DEFINITIONS[martId] ?? null;
}

export function canonicalizeMartFieldName(martId, fieldName) {
  const definition = getMartDefinition(martId);
  if (!definition || typeof fieldName !== "string") {
    return null;
  }

  const canonicalField = fieldName.trim();
  if (!canonicalField) {
    return null;
  }

  if (
    definition.dimensions.includes(canonicalField) ||
    definition.measures.includes(canonicalField) ||
    definition.timeField === canonicalField
  ) {
    return canonicalField;
  }

  return definition.fieldAliases[canonicalField] ?? null;
}

export function resolveKpiMetricCanonicalKey(metricKey) {
  if (typeof metricKey !== "string") {
    return null;
  }
  const trimmed = metricKey.trim();
  return KPI_ALIAS_TO_CANONICAL.get(trimmed) ?? null;
}

export function isCanonicalKpiMetricKey(metricKey) {
  return KPI_CANONICAL_KEYS.has(metricKey);
}

export function resolveKpiMetricValue(metrics, canonicalMetricKey) {
  if (!metrics || typeof metrics !== "object") {
    return null;
  }

  const canonicalKey = resolveKpiMetricCanonicalKey(canonicalMetricKey);
  if (!canonicalKey) {
    return null;
  }

  const direct = coerceFiniteNumber(metrics[canonicalKey]);
  if (direct != null) {
    return direct;
  }

  for (const alias of ANA_KPI_METRIC_ALIASES[canonicalKey] ?? []) {
    const aliasValue = coerceFiniteNumber(metrics[alias]);
    if (aliasValue != null) {
      return aliasValue;
    }
  }

  return null;
}

export function normalizeKpiMetrics(metrics = {}) {
  const normalized = {};

  for (const canonicalKey of KPI_CANONICAL_KEYS) {
    const value = resolveKpiMetricValue(metrics, canonicalKey);
    if (value != null) {
      normalized[canonicalKey] = value;
    }
  }

  return normalized;
}

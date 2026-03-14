import {
  ANA_KPI_CONTRACT_ID,
  ANA_KPI_METRIC_KEYS,
  canonicalizeMartFieldName,
  getMartDefinition,
  isCanonicalKpiMetricKey,
  resolveKpiMetricCanonicalKey
} from "../../services/analytics/anaV3Vocabulary.js";
import { KPI_METRIC_DICTIONARY_VERSION } from "../../services/analytics/kpiMetricDictionary.js";
import { MART_CONTRACT_ID, validateMartQueryShape } from "./martContracts.js";

const ALLOWED_GRAINS = new Set(["hour", "shift", "day", "week", "month"]);

export const KPI_CONTRACT_ID = ANA_KPI_CONTRACT_ID;
export const KPI_METRIC_KEYS = ANA_KPI_METRIC_KEYS;
export const KPI_METRIC_KEY_DICTIONARY_VERSION = KPI_METRIC_DICTIONARY_VERSION;

function normalizeDefinitionDimension(martId, dimension, kpiId) {
  const canonicalDimension = canonicalizeMartFieldName(martId, String(dimension).trim());
  if (!canonicalDimension) {
    throw new Error(`kpi ${kpiId} uses unsupported dimension ${dimension}`);
  }
  return canonicalDimension;
}

function normalizeMetricKey(metricKey, label, kpiId) {
  const canonicalMetricKey = resolveKpiMetricCanonicalKey(String(metricKey ?? "").trim());
  if (!canonicalMetricKey || !isCanonicalKpiMetricKey(canonicalMetricKey)) {
    throw new Error(`kpi ${kpiId} has unsupported ${label} ${metricKey}`);
  }
  return canonicalMetricKey;
}

function normalizeKpiDefinition(rawDefinition) {
  const definition = {
    id: String(rawDefinition?.id ?? "").trim(),
    name: String(rawDefinition?.name ?? "").trim(),
    version: String(rawDefinition?.version ?? "").trim(),
    martId: String(rawDefinition?.martId ?? "").trim(),
    measure: String(rawDefinition?.measure ?? "").trim(),
    metricKey: String(rawDefinition?.metricKey ?? "").trim(),
    denominatorMetricKey: String(rawDefinition?.denominatorMetricKey ?? "").trim(),
    aggregation: String(rawDefinition?.aggregation ?? "sum").trim().toLowerCase(),
    defaultGrain: String(rawDefinition?.defaultGrain ?? "day").trim().toLowerCase(),
    allowedGrains: Array.isArray(rawDefinition?.allowedGrains)
      ? rawDefinition.allowedGrains.map((grain) => String(grain).toLowerCase())
      : ["day", "week", "month"],
    dimensions: Array.isArray(rawDefinition?.dimensions)
      ? rawDefinition.dimensions.map((dimension) => String(dimension).trim()).filter(Boolean)
      : []
  };

  if (
    !definition.id ||
    !definition.name ||
    !definition.version ||
    !definition.martId ||
    !definition.measure ||
    !definition.metricKey
  ) {
    throw new Error(
      "kpi definition requires id, name, version, martId, measure, and metricKey"
    );
  }

  const mart = getMartDefinition(definition.martId);
  if (!mart) {
    throw new Error(`kpi ${definition.id} references unknown mart ${definition.martId}`);
  }

  const canonicalMeasure = canonicalizeMartFieldName(definition.martId, definition.measure);
  if (!canonicalMeasure || !mart.measures.includes(canonicalMeasure)) {
    throw new Error(`kpi ${definition.id} measure ${definition.measure} is not a mart measure`);
  }
  definition.measure = canonicalMeasure;

  definition.metricKey = normalizeMetricKey(definition.metricKey, "metricKey", definition.id);
  if (definition.denominatorMetricKey) {
    definition.denominatorMetricKey = normalizeMetricKey(
      definition.denominatorMetricKey,
      "denominatorMetricKey",
      definition.id
    );
  }

  for (const grain of definition.allowedGrains) {
    if (!ALLOWED_GRAINS.has(grain)) {
      throw new Error(`kpi ${definition.id} has unsupported grain ${grain}`);
    }
  }

  if (!definition.allowedGrains.includes(definition.defaultGrain)) {
    throw new Error(`kpi ${definition.id} defaultGrain must exist in allowedGrains`);
  }

  definition.dimensions = definition.dimensions.map((dimension) =>
    normalizeDefinitionDimension(definition.martId, dimension, definition.id)
  );

  return definition;
}

export function createKpiRegistry(definitions = []) {
  const byId = new Map();

  for (const rawDefinition of definitions) {
    const definition = normalizeKpiDefinition(rawDefinition);

    if (byId.has(definition.id)) {
      throw new Error(`duplicate kpi definition: ${definition.id}`);
    }

    byId.set(definition.id, definition);
  }

  return {
    contractId: KPI_CONTRACT_ID,
    martContractId: MART_CONTRACT_ID,
    list: () => Array.from(byId.values()),
    has: (id) => byId.has(id),
    get: (id) => byId.get(id)
  };
}

function normalizeDate(value, fieldName) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid datetime`);
  }
  return date.toISOString();
}

export function buildKpiQueryContract(registry, request) {
  const definition = registry?.get?.(request?.kpiId);
  if (!definition) {
    throw new Error(`unknown kpi: ${request?.kpiId}`);
  }

  const grain = String(request?.grain ?? definition.defaultGrain).toLowerCase();
  if (!definition.allowedGrains.includes(grain)) {
    throw new Error(`kpi ${definition.id} does not support grain ${grain}`);
  }

  const dimensions = Array.isArray(request?.dimensions)
    ? request.dimensions.map((dimension) => String(dimension).trim()).filter(Boolean)
    : [];

  const dimensionAliasUsage = [];
  const normalizedDimensions = dimensions.map((dimension) => {
    const canonicalDimension = canonicalizeMartFieldName(definition.martId, dimension);
    if (!canonicalDimension || !definition.dimensions.includes(canonicalDimension)) {
      throw new Error(`kpi ${definition.id} does not support dimension ${dimension}`);
    }
    if (canonicalDimension !== dimension) {
      dimensionAliasUsage.push({ from: dimension, to: canonicalDimension });
    }
    return canonicalDimension;
  });

  const startAt = normalizeDate(request?.startAt, "startAt");
  const endAt = normalizeDate(request?.endAt, "endAt");

  const timeField = getMartDefinition(definition.martId).timeField;
  const queryShape = {
    martId: definition.martId,
    select: [
      ...normalizedDimensions,
      { field: definition.measure, agg: definition.aggregation, as: definition.metricKey }
    ],
    groupBy: normalizedDimensions,
    filters: [
      {
        field: timeField,
        op: "between",
        value: [startAt, endAt]
      }
    ]
  };

  const shapeValidation = validateMartQueryShape(queryShape);
  if (!shapeValidation.valid) {
    throw new Error(`generated query shape is invalid: ${shapeValidation.errors.join("; ")}`);
  }

  return {
    contractId: KPI_CONTRACT_ID,
    kpiId: definition.id,
    kpiVersion: definition.version,
    metricKey: definition.metricKey,
    denominatorMetricKey: definition.denominatorMetricKey || null,
    grain,
    queryShape: shapeValidation.query,
    aliasUsage: [...dimensionAliasUsage, ...shapeValidation.aliasUsage]
  };
}

export const DEFAULT_KPI_DEFINITIONS = Object.freeze([
  {
    id: "first_pass_yield",
    name: "First Pass Yield",
    version: "3.0.0",
    martId: "inspection_event_mart_v1",
    measure: "pass_count",
    metricKey: ANA_KPI_METRIC_KEYS.PASS_PIECES,
    denominatorMetricKey: ANA_KPI_METRIC_KEYS.TOTAL_PIECES,
    aggregation: "sum",
    defaultGrain: "day",
    allowedGrains: ["shift", "day", "week"],
    dimensions: ["site_id", "part_id", "work_center_id"]
  },
  {
    id: "oot_rate",
    name: "Out Of Tolerance Rate",
    version: "3.0.0",
    martId: "inspection_event_mart_v1",
    measure: "oot_count",
    metricKey: ANA_KPI_METRIC_KEYS.OOT_PIECES,
    denominatorMetricKey: ANA_KPI_METRIC_KEYS.TOTAL_PIECES,
    aggregation: "sum",
    defaultGrain: "day",
    allowedGrains: ["day", "week", "month"],
    dimensions: ["site_id", "part_id", "operation_id"]
  },
  {
    id: "correction_burden_index",
    name: "Correction Burden Index",
    version: "3.0.0",
    martId: "inspection_event_mart_v1",
    measure: "rework_count",
    metricKey: ANA_KPI_METRIC_KEYS.CORRECTION_EVENTS,
    denominatorMetricKey: ANA_KPI_METRIC_KEYS.TOTAL_PIECES,
    aggregation: "sum",
    defaultGrain: "day",
    allowedGrains: ["day", "week", "month"],
    dimensions: ["site_id", "part_id", "operation_id"]
  },
  {
    id: "connector_replay_rate",
    name: "Connector Replay Rate",
    version: "3.0.0",
    martId: "connector_run_mart_v1",
    measure: "replayed_count",
    metricKey: ANA_KPI_METRIC_KEYS.CONNECTOR_REPLAYED_RUNS,
    denominatorMetricKey: ANA_KPI_METRIC_KEYS.CONNECTOR_TOTAL_RUNS,
    aggregation: "sum",
    defaultGrain: "day",
    allowedGrains: ["hour", "day", "week"],
    dimensions: ["site_id", "connector_id", "status"]
  },
  {
    id: "connector_failure_rate",
    name: "Connector Failure Rate",
    version: "3.0.0",
    martId: "connector_run_mart_v1",
    measure: "failure_count",
    metricKey: ANA_KPI_METRIC_KEYS.CONNECTOR_FAILED_RUNS,
    denominatorMetricKey: ANA_KPI_METRIC_KEYS.CONNECTOR_TOTAL_RUNS,
    aggregation: "sum",
    defaultGrain: "day",
    allowedGrains: ["hour", "day", "week"],
    dimensions: ["site_id", "connector_id", "status"]
  }
]);

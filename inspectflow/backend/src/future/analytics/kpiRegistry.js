import { MART_CONTRACT_ID, getMartDefinition, validateMartQueryShape } from "./martContracts.js";

const ALLOWED_GRAINS = new Set(["hour", "shift", "day", "week", "month"]);

export const KPI_CONTRACT_ID = "ANA-KPI-v3";

function normalizeKpiDefinition(rawDefinition) {
  const definition = {
    id: String(rawDefinition?.id ?? "").trim(),
    name: String(rawDefinition?.name ?? "").trim(),
    version: String(rawDefinition?.version ?? "").trim(),
    martId: String(rawDefinition?.martId ?? "").trim(),
    measure: String(rawDefinition?.measure ?? "").trim(),
    aggregation: String(rawDefinition?.aggregation ?? "sum").trim().toLowerCase(),
    defaultGrain: String(rawDefinition?.defaultGrain ?? "day").trim().toLowerCase(),
    allowedGrains: Array.isArray(rawDefinition?.allowedGrains)
      ? rawDefinition.allowedGrains.map((grain) => String(grain).toLowerCase())
      : ["day", "week", "month"],
    dimensions: Array.isArray(rawDefinition?.dimensions)
      ? rawDefinition.dimensions.map((dimension) => String(dimension).trim()).filter(Boolean)
      : []
  };

  if (!definition.id || !definition.name || !definition.version || !definition.martId || !definition.measure) {
    throw new Error("kpi definition requires id, name, version, martId, and measure");
  }

  const mart = getMartDefinition(definition.martId);
  if (!mart) {
    throw new Error(`kpi ${definition.id} references unknown mart ${definition.martId}`);
  }

  if (!mart.measures.includes(definition.measure)) {
    throw new Error(`kpi ${definition.id} measure ${definition.measure} is not a mart measure`);
  }

  for (const grain of definition.allowedGrains) {
    if (!ALLOWED_GRAINS.has(grain)) {
      throw new Error(`kpi ${definition.id} has unsupported grain ${grain}`);
    }
  }

  if (!definition.allowedGrains.includes(definition.defaultGrain)) {
    throw new Error(`kpi ${definition.id} defaultGrain must exist in allowedGrains`);
  }

  for (const dimension of definition.dimensions) {
    if (!mart.dimensions.includes(dimension)) {
      throw new Error(`kpi ${definition.id} uses unsupported dimension ${dimension}`);
    }
  }

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

  for (const dimension of dimensions) {
    if (!definition.dimensions.includes(dimension)) {
      throw new Error(`kpi ${definition.id} does not support dimension ${dimension}`);
    }
  }

  const startAt = normalizeDate(request?.startAt, "startAt");
  const endAt = normalizeDate(request?.endAt, "endAt");

  const queryShape = {
    martId: definition.martId,
    select: [
      ...dimensions,
      { field: definition.measure, agg: definition.aggregation, as: definition.id }
    ],
    groupBy: dimensions,
    filters: [
      {
        field: getMartDefinition(definition.martId).timeField,
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
    grain,
    queryShape
  };
}

export const DEFAULT_KPI_DEFINITIONS = Object.freeze([
  {
    id: "first_pass_yield",
    name: "First Pass Yield",
    version: "3.0.0",
    martId: "inspection_event_mart_v1",
    measure: "passCount",
    aggregation: "sum",
    defaultGrain: "day",
    allowedGrains: ["shift", "day", "week"],
    dimensions: ["siteId", "partId", "workcenterId"]
  },
  {
    id: "oot_rate",
    name: "Out Of Tolerance Rate",
    version: "3.0.0",
    martId: "inspection_event_mart_v1",
    measure: "ootCount",
    aggregation: "sum",
    defaultGrain: "day",
    allowedGrains: ["day", "week", "month"],
    dimensions: ["siteId", "partId", "operationId"]
  },
  {
    id: "connector_failure_rate",
    name: "Connector Failure Rate",
    version: "3.0.0",
    martId: "connector_run_mart_v1",
    measure: "failureCount",
    aggregation: "sum",
    defaultGrain: "day",
    allowedGrains: ["hour", "day", "week"],
    dimensions: ["siteId", "connectorId", "status"]
  }
]);

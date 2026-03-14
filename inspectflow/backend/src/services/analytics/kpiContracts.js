import {
  ANA_KPI_CONTRACT_ID,
  ANA_KPI_METRIC_KEYS,
  isCanonicalKpiMetricKey,
  normalizeKpiMetrics,
  resolveKpiMetricValue
} from "./anaV3Vocabulary.js";

export const KPI_CONTRACT_VERSION = ANA_KPI_CONTRACT_ID;
export const KPI_METRIC_KEYS = ANA_KPI_METRIC_KEYS;

export const KPI_DEFINITIONS = [
  {
    id: "first_pass_yield",
    label: "First Pass Yield",
    ownerRoles: ["Supervisor", "Quality"],
    sourceMarts: ["inspection_event_mart_v1"],
    martMeasure: "pass_count",
    formula: {
      type: "ratio",
      numerator: ANA_KPI_METRIC_KEYS.PASS_PIECES,
      denominator: ANA_KPI_METRIC_KEYS.TOTAL_PIECES,
      scale: 4
    }
  },
  {
    id: "oot_rate",
    label: "Out Of Tolerance Rate",
    ownerRoles: ["Supervisor", "Quality"],
    sourceMarts: ["inspection_event_mart_v1"],
    martMeasure: "oot_count",
    formula: {
      type: "ratio",
      numerator: ANA_KPI_METRIC_KEYS.OOT_PIECES,
      denominator: ANA_KPI_METRIC_KEYS.TOTAL_PIECES,
      scale: 4
    }
  },
  {
    id: "correction_burden_index",
    label: "Correction Burden Index",
    ownerRoles: ["Supervisor", "Admin"],
    sourceMarts: ["inspection_event_mart_v1"],
    martMeasure: "rework_count",
    formula: {
      type: "ratio",
      numerator: ANA_KPI_METRIC_KEYS.CORRECTION_EVENTS,
      denominator: ANA_KPI_METRIC_KEYS.TOTAL_PIECES,
      scale: 4
    }
  },
  {
    id: "connector_replay_rate",
    label: "Connector Replay Rate",
    ownerRoles: ["Admin", "Supervisor"],
    sourceMarts: ["connector_run_mart_v1"],
    martMeasure: "replayed_count",
    formula: {
      type: "ratio",
      numerator: ANA_KPI_METRIC_KEYS.CONNECTOR_REPLAYED_RUNS,
      denominator: ANA_KPI_METRIC_KEYS.CONNECTOR_TOTAL_RUNS,
      scale: 4
    }
  },
  {
    id: "connector_failure_rate",
    label: "Connector Failure Rate",
    ownerRoles: ["Admin", "Supervisor"],
    sourceMarts: ["connector_run_mart_v1"],
    martMeasure: "failure_count",
    formula: {
      type: "ratio",
      numerator: ANA_KPI_METRIC_KEYS.CONNECTOR_FAILED_RUNS,
      denominator: ANA_KPI_METRIC_KEYS.CONNECTOR_TOTAL_RUNS,
      scale: 4
    }
  }
];

function round(value, scale = 4) {
  const factor = 10 ** scale;
  return Math.round(value * factor) / factor;
}

export function validateKpiContracts(definitions = KPI_DEFINITIONS) {
  const ids = new Set();
  const errors = [];

  for (const definition of definitions) {
    if (!definition.id) {
      errors.push("missing_id");
      continue;
    }

    if (ids.has(definition.id)) {
      errors.push(`duplicate_id:${definition.id}`);
    } else {
      ids.add(definition.id);
    }

    if (!definition.formula || definition.formula.type !== "ratio") {
      errors.push(`unsupported_formula:${definition.id}`);
      continue;
    }

    const numerator = definition.formula.numerator;
    const denominator = definition.formula.denominator;
    if (!numerator || !denominator) {
      errors.push(`missing_formula_fields:${definition.id}`);
      continue;
    }

    if (!isCanonicalKpiMetricKey(numerator)) {
      errors.push(`unsupported_formula_numerator:${definition.id}:${numerator}`);
    }
    if (!isCanonicalKpiMetricKey(denominator)) {
      errors.push(`unsupported_formula_denominator:${definition.id}:${denominator}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function getKpiDefinition(id, definitions = KPI_DEFINITIONS) {
  return definitions.find((item) => item.id === id) || null;
}

export function computeKpiValue(definition, metrics) {
  if (!definition || definition.formula?.type !== "ratio") {
    return null;
  }

  const normalizedMetrics = normalizeKpiMetrics(metrics);
  const numerator = resolveKpiMetricValue(normalizedMetrics, definition.formula.numerator);
  const denominator = resolveKpiMetricValue(normalizedMetrics, definition.formula.denominator);

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }

  return round(numerator / denominator, definition.formula.scale ?? 4);
}

export function computeAllKpis(metrics, definitions = KPI_DEFINITIONS) {
  const values = {};
  for (const definition of definitions) {
    values[definition.id] = computeKpiValue(definition, metrics);
  }
  return values;
}

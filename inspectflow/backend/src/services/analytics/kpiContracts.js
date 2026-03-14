export const KPI_CONTRACT_VERSION = "ANA-KPI-v3-draft1";

export const KPI_DEFINITIONS = [
  {
    id: "first_pass_yield",
    label: "First Pass Yield",
    ownerRoles: ["Supervisor", "Quality"],
    sourceMarts: ["ana_mart_job_rollup_day"],
    formula: { type: "ratio", numerator: "acceptedPieces", denominator: "totalPieces", scale: 4 }
  },
  {
    id: "oot_rate",
    label: "Out Of Tolerance Rate",
    ownerRoles: ["Supervisor", "Quality"],
    sourceMarts: ["ana_mart_inspection_fact"],
    formula: { type: "ratio", numerator: "ootPieces", denominator: "totalPieces", scale: 4 }
  },
  {
    id: "correction_burden_index",
    label: "Correction Burden Index",
    ownerRoles: ["Supervisor", "Admin"],
    sourceMarts: ["ana_mart_job_rollup_day"],
    formula: { type: "ratio", numerator: "correctionEvents", denominator: "totalPieces", scale: 4 }
  },
  {
    id: "connector_replay_rate",
    label: "Connector Replay Rate",
    ownerRoles: ["Admin", "Supervisor"],
    sourceMarts: ["ana_mart_connector_run_fact"],
    formula: { type: "ratio", numerator: "replayedRuns", denominator: "totalRuns", scale: 4 }
  },
  {
    id: "connector_failure_rate",
    label: "Connector Failure Rate",
    ownerRoles: ["Admin", "Supervisor"],
    sourceMarts: ["ana_mart_connector_run_fact"],
    formula: { type: "ratio", numerator: "failedRuns", denominator: "totalRuns", scale: 4 }
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
    }
    if (!definition.formula?.numerator || !definition.formula?.denominator) {
      errors.push(`missing_formula_fields:${definition.id}`);
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
  if (!definition || definition.formula?.type !== "ratio") return null;
  const numerator = Number(metrics?.[definition.formula.numerator]);
  const denominator = Number(metrics?.[definition.formula.denominator]);
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


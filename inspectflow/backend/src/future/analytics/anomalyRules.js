export const RISK_CONTRACT_ID = "ANA-RISK-v3";

const SEVERITY_ORDER = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

function normalizeNumber(value, fieldName) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }
  return value;
}

function evaluateCondition(condition, metrics) {
  const metricValue = metrics[condition.metric];
  const op = condition.op;

  if (op === "delta_pct_gt") {
    const current = normalizeNumber(metricValue?.current, `${condition.metric}.current`);
    const baseline = normalizeNumber(metricValue?.baseline, `${condition.metric}.baseline`);

    if (baseline === 0) {
      return { pass: false, observed: null };
    }

    const deltaPct = ((current - baseline) / Math.abs(baseline)) * 100;
    return {
      pass: deltaPct > normalizeNumber(condition.value, `${condition.metric}.threshold`),
      observed: deltaPct
    };
  }

  const numeric = normalizeNumber(metricValue, condition.metric);

  if (op === "gt") {
    return { pass: numeric > normalizeNumber(condition.value, `${condition.metric}.threshold`), observed: numeric };
  }

  if (op === "gte") {
    return { pass: numeric >= normalizeNumber(condition.value, `${condition.metric}.threshold`), observed: numeric };
  }

  if (op === "lt") {
    return { pass: numeric < normalizeNumber(condition.value, `${condition.metric}.threshold`), observed: numeric };
  }

  if (op === "lte") {
    return { pass: numeric <= normalizeNumber(condition.value, `${condition.metric}.threshold`), observed: numeric };
  }

  if (op === "between") {
    if (!Array.isArray(condition.value) || condition.value.length !== 2) {
      throw new Error(`${condition.metric}.threshold must be [min,max] for between`);
    }

    const [min, max] = condition.value;
    const lower = normalizeNumber(min, `${condition.metric}.min`);
    const upper = normalizeNumber(max, `${condition.metric}.max`);
    return { pass: numeric >= lower && numeric <= upper, observed: numeric };
  }

  throw new Error(`unsupported operator: ${op}`);
}

export function evaluateAnomalyRule(rule, metrics, context = {}) {
  const conditions = Array.isArray(rule?.when) ? rule.when : [];

  if (!rule?.id || !rule?.name || conditions.length === 0) {
    throw new Error("rule requires id, name, and at least one condition");
  }

  const evaluations = conditions.map((condition) => {
    const result = evaluateCondition(condition, metrics);
    return {
      metric: condition.metric,
      op: condition.op,
      expected: condition.value,
      observed: result.observed,
      pass: result.pass
    };
  });

  const triggered = evaluations.every((entry) => entry.pass);

  return {
    contractId: RISK_CONTRACT_ID,
    ruleId: rule.id,
    name: rule.name,
    severity: rule.severity ?? "medium",
    triggered,
    evaluations,
    context
  };
}

export function evaluateAnomalyRules({ rules = SAMPLE_ANOMALY_RULES, metrics = {}, context = {} }) {
  const evaluated = rules.map((rule) => evaluateAnomalyRule(rule, metrics, context));
  const triggered = evaluated
    .filter((entry) => entry.triggered)
    .sort((left, right) => (SEVERITY_ORDER[right.severity] ?? 0) - (SEVERITY_ORDER[left.severity] ?? 0));

  return {
    contractId: RISK_CONTRACT_ID,
    triggered,
    evaluated
  };
}

export const SAMPLE_ANOMALY_RULES = Object.freeze([
  {
    id: "oot-rate-spike",
    name: "OOT rate spike",
    severity: "high",
    when: [
      { metric: "ootRate", op: "gt", value: 0.08 },
      { metric: "measurementVolume", op: "gte", value: 30 }
    ]
  },
  {
    id: "connector-failure-burst",
    name: "Connector failure burst",
    severity: "critical",
    when: [
      { metric: "connectorFailureRate", op: "gt", value: 0.15 },
      { metric: "connectorRunCount", op: "gte", value: 10 }
    ]
  },
  {
    id: "cycle-time-drift",
    name: "Cycle time drift",
    severity: "medium",
    when: [{ metric: "cycleTime", op: "delta_pct_gt", value: 20 }]
  }
]);

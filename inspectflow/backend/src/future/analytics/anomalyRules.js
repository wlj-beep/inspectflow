import crypto from "node:crypto";

export const RISK_CONTRACT_ID = "ANA-RISK-v3";
const RISK_EVENT_VERSION = "1.0";

const SEVERITY_ORDER = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};
const MATCH_MODES = new Set(["all", "any"]);

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

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
  const match = String(rule?.match ?? "all").toLowerCase();

  if (!rule?.id || !rule?.name || conditions.length === 0) {
    throw new Error("rule requires id, name, and at least one condition");
  }
  if (!MATCH_MODES.has(match)) {
    throw new Error(`rule match must be one of: ${Array.from(MATCH_MODES).join(", ")}`);
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

  const triggered =
    match === "all" ? evaluations.every((entry) => entry.pass) : evaluations.some((entry) => entry.pass);

  return {
    contractId: RISK_CONTRACT_ID,
    ruleId: rule.id,
    name: rule.name,
    severity: rule.severity ?? "medium",
    match,
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

export function createRiskDedupeKey({ ruleId, severity, subject = {}, occurredAtBucket }) {
  const fingerprint = {
    ruleId: String(ruleId ?? ""),
    severity: String(severity ?? "medium"),
    subject,
    occurredAtBucket: String(occurredAtBucket ?? "")
  };

  return crypto.createHash("sha256").update(stableStringify(fingerprint)).digest("hex");
}

export function buildRiskEventEnvelope(evaluation, options = {}) {
  if (!evaluation || typeof evaluation !== "object") {
    throw new Error("evaluation is required");
  }
  if (!evaluation.ruleId) {
    throw new Error("evaluation.ruleId is required");
  }

  const occurredAtIso = options.occurredAt ? new Date(options.occurredAt).toISOString() : new Date().toISOString();
  const hourBucket = occurredAtIso.slice(0, 13);
  const subject = options.subject && typeof options.subject === "object" ? options.subject : {};
  const dedupeKey =
    options.dedupeKey ??
    createRiskDedupeKey({
      ruleId: evaluation.ruleId,
      severity: evaluation.severity,
      subject,
      occurredAtBucket: hourBucket
    });

  return {
    contractId: RISK_CONTRACT_ID,
    eventVersion: RISK_EVENT_VERSION,
    eventType: "quality.anomaly.detected",
    dedupeKey,
    occurredAt: occurredAtIso,
    rule: {
      id: evaluation.ruleId,
      name: evaluation.name,
      severity: evaluation.severity
    },
    subject,
    evidence: {
      triggered: Boolean(evaluation.triggered),
      evaluations: Array.isArray(evaluation.evaluations) ? evaluation.evaluations : [],
      context: evaluation.context ?? {}
    }
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

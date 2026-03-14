import crypto from "node:crypto";

const SEVERITY_TO_PRIORITY = {
  low: "P3",
  medium: "P2",
  high: "P1",
  critical: "P0"
};

const DEFAULT_POLICY = Object.freeze({
  severityToOwnerRole: {
    low: "Quality",
    medium: "Quality",
    high: "Supervisor",
    critical: "Admin"
  },
  severityToSlaHours: {
    low: 72,
    medium: 24,
    high: 8,
    critical: 2
  }
});

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

function pickNonEmpty(subject, key) {
  const value = subject?.[key];
  const normalized = value == null ? "" : String(value).trim();
  return normalized || null;
}

export function buildTraceEvidenceLinks(subject = {}) {
  const links = [
    {
      type: "trace.job",
      ref: pickNonEmpty(subject, "jobId")
    },
    {
      type: "trace.part",
      ref: pickNonEmpty(subject, "partId")
    },
    {
      type: "trace.lot",
      ref: pickNonEmpty(subject, "lot")
    },
    {
      type: "trace.piece",
      ref: pickNonEmpty(subject, "pieceId")
    },
    {
      type: "trace.serial",
      ref: pickNonEmpty(subject, "serial")
    },
    {
      type: "trace.record",
      ref: pickNonEmpty(subject, "recordId")
    }
  ].filter((entry) => entry.ref !== null);

  return links;
}

export function createEscalationKey({ dedupeKey, ruleId, subject = {} }) {
  const fingerprint = {
    dedupeKey: String(dedupeKey ?? "").trim(),
    ruleId: String(ruleId ?? "").trim(),
    subject
  };

  return crypto.createHash("sha256").update(stableStringify(fingerprint)).digest("hex");
}

export function createEscalationRecord({ eventEnvelope, policy = DEFAULT_POLICY, traceContext = {} }) {
  if (!eventEnvelope || typeof eventEnvelope !== "object") {
    throw new Error("eventEnvelope is required");
  }

  const ruleId = String(eventEnvelope?.rule?.id ?? "").trim();
  const severity = String(eventEnvelope?.rule?.severity ?? "medium").toLowerCase();
  const dedupeKey = String(eventEnvelope?.dedupeKey ?? "").trim();
  const occurredAt = String(eventEnvelope?.occurredAt ?? "").trim();
  const subject = eventEnvelope?.subject && typeof eventEnvelope.subject === "object" ? eventEnvelope.subject : {};

  if (!ruleId || !dedupeKey || !occurredAt) {
    throw new Error("eventEnvelope requires rule.id, dedupeKey, and occurredAt");
  }

  const createdAt = traceContext.createdAt ?? new Date().toISOString();
  const traceLinks = buildTraceEvidenceLinks(subject);
  const escalationKey = createEscalationKey({ dedupeKey, ruleId, subject });

  return {
    contractId: "ANA-RISK-v3",
    workflowContractId: "QUAL-RISK-WORKFLOW-v1",
    escalationKey,
    status: "open",
    priority: SEVERITY_TO_PRIORITY[severity] ?? "P2",
    ownerRole: policy?.severityToOwnerRole?.[severity] ?? "Quality",
    slaHours: policy?.severityToSlaHours?.[severity] ?? 24,
    createdAt,
    sourceEvent: {
      dedupeKey,
      occurredAt,
      rule: eventEnvelope.rule,
      eventType: eventEnvelope.eventType,
      eventVersion: eventEnvelope.eventVersion
    },
    evidence: {
      traceContractId: "QUAL-TRACE-v1",
      traceLinks,
      riskEvidence: eventEnvelope.evidence ?? {},
      traceContext
    }
  };
}

export function validateEscalationRecord(record) {
  const errors = [];

  if (!record || typeof record !== "object") {
    return {
      ok: false,
      errors: ["record must be an object"]
    };
  }

  if (record.contractId !== "ANA-RISK-v3") {
    errors.push("contractId must be ANA-RISK-v3");
  }
  if (record.workflowContractId !== "QUAL-RISK-WORKFLOW-v1") {
    errors.push("workflowContractId must be QUAL-RISK-WORKFLOW-v1");
  }
  if (!record.escalationKey || typeof record.escalationKey !== "string") {
    errors.push("escalationKey is required");
  }
  if (!record.ownerRole || typeof record.ownerRole !== "string") {
    errors.push("ownerRole is required");
  }
  if (!Number.isInteger(record.slaHours) || record.slaHours <= 0) {
    errors.push("slaHours must be a positive integer");
  }

  const traceLinks = Array.isArray(record?.evidence?.traceLinks) ? record.evidence.traceLinks : [];
  if (traceLinks.length === 0) {
    errors.push("evidence.traceLinks must include at least one trace reference");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export { DEFAULT_POLICY };

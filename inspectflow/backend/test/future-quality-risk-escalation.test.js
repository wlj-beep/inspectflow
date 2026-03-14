import { describe, expect, it } from "vitest";
import { buildRiskEventEnvelope, evaluateAnomalyRule } from "../src/future/analytics/anomalyRules.js";
import {
  buildTraceEvidenceLinks,
  createEscalationKey,
  createEscalationRecord,
  validateEscalationRecord
} from "../src/future/quality/riskEscalation.js";

describe("future quality risk escalation workflow", () => {
  it("builds trace evidence links from subject fields", () => {
    const links = buildTraceEvidenceLinks({
      jobId: "J-100",
      partId: "P-500",
      lot: "LOT-1",
      recordId: "REC-10"
    });

    expect(links).toEqual([
      { type: "trace.job", ref: "J-100" },
      { type: "trace.part", ref: "P-500" },
      { type: "trace.lot", ref: "LOT-1" },
      { type: "trace.record", ref: "REC-10" }
    ]);
  });

  it("creates deterministic escalation keys", () => {
    const left = createEscalationKey({
      dedupeKey: "ABC",
      ruleId: "oot-rate-spike",
      subject: { jobId: "J-1", partId: "P-1" }
    });
    const right = createEscalationKey({
      dedupeKey: "ABC",
      ruleId: "oot-rate-spike",
      subject: { partId: "P-1", jobId: "J-1" }
    });

    expect(left).toBe(right);
  });

  it("creates escalation records from anomaly event envelopes", () => {
    const evaluation = evaluateAnomalyRule(
      {
        id: "oot-rate-spike",
        name: "OOT rate spike",
        severity: "high",
        when: [{ metric: "ootRate", op: "gt", value: 0.08 }]
      },
      { ootRate: 0.12 },
      { runId: "RUN-1" }
    );

    const eventEnvelope = buildRiskEventEnvelope(evaluation, {
      occurredAt: "2026-03-14T19:02:00.000Z",
      subject: {
        jobId: "J-100",
        partId: "P-500",
        lot: "LOT-1"
      }
    });

    const record = createEscalationRecord({
      eventEnvelope,
      traceContext: {
        source: "future-test",
        createdAt: "2026-03-14T19:03:00.000Z"
      }
    });

    expect(record.contractId).toBe("ANA-RISK-v3");
    expect(record.workflowContractId).toBe("QUAL-RISK-WORKFLOW-v1");
    expect(record.priority).toBe("P1");
    expect(record.ownerRole).toBe("Supervisor");
    expect(record.evidence.traceLinks.length).toBeGreaterThan(0);

    const validation = validateEscalationRecord(record);
    expect(validation.ok).toBe(true);
  });

  it("flags invalid escalation records", () => {
    const invalid = validateEscalationRecord({
      contractId: "ANA-RISK-v3",
      workflowContractId: "QUAL-RISK-WORKFLOW-v1",
      ownerRole: "Quality",
      slaHours: 0,
      evidence: { traceLinks: [] }
    });

    expect(invalid.ok).toBe(false);
    expect(invalid.errors.join(" ")).toMatch(/slaHours/);
    expect(invalid.errors.join(" ")).toMatch(/traceLinks/);
  });
});

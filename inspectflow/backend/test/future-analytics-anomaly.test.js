import { describe, it, expect } from "vitest";
import {
  RISK_CONTRACT_ID,
  SAMPLE_ANOMALY_RULES,
  buildRiskEventEnvelope,
  createRiskDedupeKey,
  evaluateAnomalyRule,
  evaluateAnomalyRules
} from "../src/future/analytics/anomalyRules.js";

describe("future analytics anomaly rules", () => {
  it("evaluates a single anomaly rule", () => {
    const result = evaluateAnomalyRule(
      {
        id: "custom-oot",
        name: "Custom OOT",
        severity: "high",
        when: [
          { metric: "ootRate", op: "gt", value: 0.05 },
          { metric: "measurementVolume", op: "gte", value: 10 }
        ]
      },
      {
        ootRate: 0.09,
        measurementVolume: 16
      }
    );

    expect(result.contractId).toBe(RISK_CONTRACT_ID);
    expect(result.triggered).toBe(true);
  });

  it("returns triggered rules sorted by severity", () => {
    const result = evaluateAnomalyRules({
      rules: SAMPLE_ANOMALY_RULES,
      metrics: {
        ootRate: 0.12,
        measurementVolume: 45,
        connectorFailureRate: 0.2,
        connectorRunCount: 12,
        cycleTime: { current: 145, baseline: 100 }
      }
    });

    expect(result.contractId).toBe(RISK_CONTRACT_ID);
    expect(result.triggered.map((entry) => entry.ruleId)).toEqual([
      "connector-failure-burst",
      "oot-rate-spike",
      "cycle-time-drift"
    ]);
  });

  it("does not trigger when delta baseline is zero", () => {
    const result = evaluateAnomalyRule(
      {
        id: "drift",
        name: "Drift",
        when: [{ metric: "cycleTime", op: "delta_pct_gt", value: 5 }]
      },
      {
        cycleTime: { current: 120, baseline: 0 }
      }
    );

    expect(result.triggered).toBe(false);
  });

  it("supports any-match mode for partial rule hits", () => {
    const result = evaluateAnomalyRule(
      {
        id: "any-mode",
        name: "Any Mode",
        match: "any",
        when: [
          { metric: "ootRate", op: "gt", value: 0.2 },
          { metric: "measurementVolume", op: "gte", value: 10 }
        ]
      },
      {
        ootRate: 0.05,
        measurementVolume: 12
      }
    );

    expect(result.match).toBe("any");
    expect(result.triggered).toBe(true);
  });

  it("builds deterministic risk event envelope dedupe keys", () => {
    const evaluation = evaluateAnomalyRule(
      {
        id: "oot-rate-spike",
        name: "OOT rate spike",
        severity: "high",
        when: [{ metric: "ootRate", op: "gt", value: 0.08 }]
      },
      { ootRate: 0.09 },
      { siteId: "S1" }
    );

    const subject = { siteId: "S1", partId: "P-1001", jobId: "J-777" };

    const first = buildRiskEventEnvelope(evaluation, {
      occurredAt: "2026-03-14T18:22:03.000Z",
      subject
    });
    const second = buildRiskEventEnvelope(evaluation, {
      occurredAt: "2026-03-14T18:40:00.000Z",
      subject
    });

    expect(first.contractId).toBe(RISK_CONTRACT_ID);
    expect(first.eventVersion).toBe("1.0");
    expect(first.dedupeKey).toBe(second.dedupeKey);
    expect(first.eventType).toBe("quality.anomaly.detected");
  });

  it("can derive dedupe key directly", () => {
    const left = createRiskDedupeKey({
      ruleId: "rule-1",
      severity: "critical",
      subject: { siteId: "S1" },
      occurredAtBucket: "2026-03-14T18"
    });
    const right = createRiskDedupeKey({
      ruleId: "rule-1",
      severity: "critical",
      subject: { siteId: "S1" },
      occurredAtBucket: "2026-03-14T18"
    });

    expect(left).toBe(right);
  });
});

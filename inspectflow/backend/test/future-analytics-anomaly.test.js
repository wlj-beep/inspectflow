import { describe, it, expect } from "vitest";
import {
  RISK_CONTRACT_ID,
  SAMPLE_ANOMALY_RULES,
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
});

import { describe, it, expect } from "vitest";
import {
  DEFAULT_CONNECTOR_POLICY,
  buildRetryPlan,
  computeRetryDelayMs,
  parseConnectorPolicy,
  validateConnectorPolicy
} from "../src/future/integration/connectorPolicy.js";

describe("future integration connector policy", () => {
  it("parses defaults and accepts duration strings", () => {
    const parsed = parseConnectorPolicy({
      retry: {
        maxAttempts: 4,
        backoff: "linear",
        baseDelayMs: "250ms",
        maxDelayMs: "3s",
        backoffMultiplier: 2,
        jitterRatio: 0
      },
      timeoutMs: "5s",
      replayWindowMs: "2m",
      unresolved: {
        maxPerRun: 200,
        strategy: "queue"
      }
    });

    expect(parsed.retry.maxAttempts).toBe(4);
    expect(parsed.retry.baseDelayMs).toBe(250);
    expect(parsed.timeoutMs).toBe(5000);
    expect(parsed.replayWindowMs).toBe(120000);
    expect(parsed.unresolved.maxPerRun).toBe(200);
  });

  it("returns defaults when no input is provided", () => {
    const parsed = parseConnectorPolicy();
    expect(parsed).toEqual(DEFAULT_CONNECTOR_POLICY);
  });

  it("builds deterministic retry plan", () => {
    const policy = {
      retry: {
        maxAttempts: 5,
        backoff: "exponential",
        baseDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        jitterRatio: 0
      }
    };

    expect(buildRetryPlan(policy)).toEqual([100, 200, 400, 800]);
    expect(computeRetryDelayMs(policy, 3)).toBe(400);
  });

  it("flags invalid policy payloads", () => {
    const result = validateConnectorPolicy({
      retry: {
        maxAttempts: 0
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/retry.maxAttempts/);
  });
});

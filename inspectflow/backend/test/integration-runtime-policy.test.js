import { describe, it, expect } from "vitest";
import {
  buildConnectorRunDecision,
  buildReplayMetadata,
  classifyConnectorError
} from "../src/services/integration/connectorRunPolicy.js";
import { buildIntegrationSupportBundle } from "../src/services/observability/integrationSupportBundle.js";

describe("Integration runtime policy and observability scaffolding", () => {
  it("classifies transient connector errors and creates retry decisions", () => {
    const error = { code: "ETIMEDOUT", message: "socket timeout" };
    const classification = classifyConnectorError(error);
    const decision = buildConnectorRunDecision({
      attempt: 1,
      maxAttempts: 4,
      error,
      jitterSeed: "run-500"
    });

    expect(classification).toMatchObject({
      category: "network",
      retryable: true
    });
    expect(decision.shouldRetry).toBe(true);
    expect(decision.nextDelayMs).toBeGreaterThan(0);
  });

  it("stops retries for permanent contract errors", () => {
    const decision = buildConnectorRunDecision({
      attempt: 1,
      maxAttempts: 4,
      error: { status: 400, message: "invalid_payload" }
    });

    expect(decision.shouldRetry).toBe(false);
    expect(decision.classification).toMatchObject({
      category: "contract",
      retryable: false,
      code: "HTTP_400"
    });
  });

  it("builds replay metadata with only safe context", () => {
    const replay = buildReplayMetadata({
      runId: 9001,
      attempt: 2,
      envelope: {
        sourceType: "api_pull",
        importType: "jobs",
        externalKey: "jobs:job:J-9001",
        idempotencyToken: "tok_deadbeef"
      },
      classification: {
        category: "network",
        code: "ETIMEDOUT",
        retryable: true
      },
      now: new Date("2026-02-01T15:00:00.000Z")
    });

    expect(replay).toMatchObject({
      schemaVersion: "int-connector-replay-v1",
      runId: 9001,
      attempt: 2,
      sourceType: "api_pull",
      importType: "jobs"
    });
    expect(replay).not.toHaveProperty("payload");
  });

  it("builds support bundle summaries without measurement value leakage", () => {
    const bundle = buildIntegrationSupportBundle({
      run: {
        id: 41,
        status: "partial",
        sourceType: "webhook",
        importType: "measurements"
      },
      envelope: {
        sourceType: "webhook",
        importType: "measurements",
        payloadVersion: "1.0",
        idempotencyToken: "tok_1234567890",
        externalKey: "measurements:batch:abc",
        payload: {
          rows: [
            { dimension: "A", value: "12.4456", serial: "S-001" },
            { dimension: "B", value: "13.1111", serial: "S-002" }
          ]
        }
      },
      errors: [
        { code: "invalid_measurement", message: "value 12.4456 is out of spec", retryable: false }
      ]
    });

    const serialized = JSON.stringify(bundle);
    expect(serialized).not.toContain("12.4456");
    expect(bundle.payloadSummary.keyPaths).toContain("rows");
    expect(bundle.errorSummary.total).toBe(1);
    expect(bundle.envelope.externalKeyPresent).toBe(true);
  });
});


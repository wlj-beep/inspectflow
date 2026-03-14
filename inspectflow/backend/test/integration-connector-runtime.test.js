import { describe, it, expect } from "vitest";
import { executeConnectorRuntime } from "../src/services/integration/connectorRuntime.js";
import { createIdempotencyLedger } from "../src/services/idempotency/idempotencyKey.js";

function makeClock(startIso = "2026-03-14T14:00:00.000Z", stepMs = 10) {
  const start = new Date(startIso).getTime();
  let index = 0;
  return () => new Date(start + stepMs * index++);
}

function makeEnvelope(overrides = {}) {
  return {
    sourceType: "api_pull",
    importType: "jobs",
    externalKey: "jobs:job:J-500",
    payloadVersion: "1.0",
    ingestTimestamp: "2026-03-14T14:00:00.000Z",
    idempotencyToken: "tok_500",
    payload: {
      entityType: "job",
      entity: {
        id: "J-500",
        partId: "P-500",
        opNumber: "020",
        lot: "LOT-500",
        qty: 5,
        status: "open"
      }
    },
    ...overrides
  };
}

describe("Connector runtime orchestration", () => {
  it("executes successfully on first attempt", async () => {
    const result = await executeConnectorRuntime({
      runId: 1001,
      envelopeInput: makeEnvelope(),
      executeImport: async () => ({
        status: "success",
        totalRows: 1,
        inserted: 1,
        updated: 0,
        failed: 0,
        unresolvedCount: 0
      }),
      now: makeClock()
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("success");
    expect(result.attempts).toHaveLength(1);
    expect(result.result).toMatchObject({ inserted: 1, failed: 0 });
    expect(result.supportBundle.errorSummary.total).toBe(0);
  });

  it("retries transient failure and succeeds deterministically", async () => {
    let calls = 0;
    const result = await executeConnectorRuntime({
      runId: 1002,
      envelopeInput: makeEnvelope({ idempotencyToken: "tok_501" }),
      executeImport: async () => {
        calls += 1;
        if (calls === 1) {
          const error = new Error("socket timeout");
          error.code = "ETIMEDOUT";
          throw error;
        }
        return {
          status: "success",
          totalRows: 1,
          inserted: 0,
          updated: 1,
          failed: 0,
          unresolvedCount: 0
        };
      },
      jitterSeed: "run-1002",
      now: makeClock("2026-03-14T14:05:00.000Z")
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("success");
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0].classificationCode).toBe("ETIMEDOUT");
    expect(result.attempts[0].retryDelayMs).toBeGreaterThan(0);
    expect(result.attempts[1].status).toBe("success");
  });

  it("skips duplicate runs based on idempotency ledger", async () => {
    const ledger = createIdempotencyLedger();
    const clock = makeClock("2026-03-14T14:10:00.000Z");
    const envelope = makeEnvelope({ idempotencyToken: "tok_502" });

    const first = await executeConnectorRuntime({
      runId: 1003,
      envelopeInput: envelope,
      executeImport: async () => ({
        status: "success",
        totalRows: 1,
        inserted: 1,
        updated: 0,
        failed: 0,
        unresolvedCount: 0
      }),
      ledger,
      now: clock
    });

    const second = await executeConnectorRuntime({
      runId: 1004,
      envelopeInput: envelope,
      executeImport: async () => ({
        status: "success",
        totalRows: 1,
        inserted: 1,
        updated: 0,
        failed: 0,
        unresolvedCount: 0
      }),
      ledger,
      now: clock
    });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.attempts).toHaveLength(0);
    expect(second.code).toBe("idempotent_skip");
  });

  it("returns terminal error for non-retryable contract failures", async () => {
    const result = await executeConnectorRuntime({
      runId: 1005,
      envelopeInput: makeEnvelope({ idempotencyToken: "tok_503" }),
      executeImport: async () => {
        const error = new Error("invalid payload mapping");
        error.status = 400;
        throw error;
      },
      now: makeClock("2026-03-14T14:20:00.000Z")
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("error");
    expect(result.attempts).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ code: "HTTP_400", retryable: false });
    expect(result.replayMetadata).toMatchObject({
      schemaVersion: "int-connector-replay-v1",
      runId: 1005
    });
    expect(JSON.stringify(result.supportBundle)).not.toContain("LOT-500");
  });
});


import { describe, it, expect } from "vitest";
import {
  normalizeCanonicalEnvelope,
  validateCanonicalEnvelope
} from "../src/future/integration/canonicalEnvelope.js";
import {
  buildIdempotencyFingerprint,
  createIdempotencyKey,
  idempotencyKeysEqual
} from "../src/future/integration/idempotency.js";

const baseEnvelope = {
  envelopeVersion: "1.0",
  connectorId: "erp-sap",
  eventType: "inspection.measurement",
  operation: "upsert",
  occurredAt: "2026-03-14T16:00:00.000Z",
  entity: {
    type: "measurement_record",
    externalId: "SAP-REC-1001"
  },
  payload: {
    b: 2,
    a: 1
  },
  metadata: {
    tenant: "site-1"
  }
};

describe("future integration idempotency + envelope", () => {
  it("normalizes canonical envelope with sorted payload keys", () => {
    const normalized = normalizeCanonicalEnvelope(baseEnvelope);
    expect(Object.keys(normalized.payload)).toEqual(["a", "b"]);
    expect(normalized.occurredAt).toBe("2026-03-14T16:00:00.000Z");
  });

  it("validates canonical envelope errors", () => {
    const result = validateCanonicalEnvelope({
      ...baseEnvelope,
      operation: "invalid-op"
    });

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/operation/);
  });

  it("generates deterministic idempotency keys for equivalent payload order", () => {
    const envelopeA = {
      ...baseEnvelope,
      payload: {
        a: 1,
        b: 2
      }
    };

    const envelopeB = {
      ...baseEnvelope,
      payload: {
        b: 2,
        a: 1
      }
    };

    const keyA = createIdempotencyKey(envelopeA);
    const keyB = createIdempotencyKey(envelopeB);

    expect(idempotencyKeysEqual(keyA, keyB)).toBe(true);
    expect(buildIdempotencyFingerprint(envelopeA)).toBe(buildIdempotencyFingerprint(envelopeB));
  });

  it("changes idempotency key when operation changes", () => {
    const keyA = createIdempotencyKey(baseEnvelope);
    const keyB = createIdempotencyKey({
      ...baseEnvelope,
      operation: "delete"
    });

    expect(keyA).not.toBe(keyB);
  });
});

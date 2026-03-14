import crypto from "node:crypto";
import { normalizeCanonicalEnvelope } from "./canonicalEnvelope.js";

export const IDEMPOTENCY_CONTRACT_ID = "INT-IDEMPOTENCY-v2";

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

function buildFingerprintParts(input) {
  if (input && typeof input === "object" && input.entity && input.operation) {
    const normalized = normalizeCanonicalEnvelope(input);

    return {
      connectorId: normalized.connectorId,
      entityType: normalized.entity.type,
      externalId: normalized.entity.externalId,
      operation: normalized.operation,
      occurredAt: normalized.occurredAt,
      payload: normalized.payload
    };
  }

  if (!input || typeof input !== "object") {
    throw new Error("idempotency input must be an object");
  }

  const connectorId = String(input.connectorId ?? "").trim();
  const entityType = String(input.entityType ?? "").trim();
  const externalId = String(input.externalId ?? "").trim();
  const operation = String(input.operation ?? "").trim().toLowerCase();

  if (!connectorId || !entityType || !externalId || !operation) {
    throw new Error("connectorId, entityType, externalId, and operation are required");
  }

  return {
    connectorId,
    entityType,
    externalId,
    operation,
    occurredAt: input.occurredAt ? new Date(input.occurredAt).toISOString() : "",
    payload: input.payload ?? {}
  };
}

export function buildIdempotencyFingerprint(input) {
  const parts = buildFingerprintParts(input);
  return stableStringify(parts);
}

export function createIdempotencyKey(input, { keyVersion = "v2", digestLength = 32 } = {}) {
  const fingerprint = buildIdempotencyFingerprint(input);
  const digest = crypto.createHash("sha256").update(fingerprint).digest("hex");
  const shortDigest = digest.slice(0, digestLength);

  const parts = buildFingerprintParts(input);
  return `${IDEMPOTENCY_CONTRACT_ID}:${keyVersion}:${parts.connectorId}:${parts.entityType}:${parts.operation}:${shortDigest}`;
}

export function idempotencyKeysEqual(left, right) {
  return String(left ?? "") === String(right ?? "");
}

export { stableStringify };

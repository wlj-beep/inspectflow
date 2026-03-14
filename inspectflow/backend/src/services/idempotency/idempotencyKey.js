import { createHash } from "node:crypto";

function sortObject(input) {
  if (Array.isArray(input)) {
    return input.map(sortObject);
  }
  if (!input || typeof input !== "object") {
    return input;
  }

  return Object.keys(input)
    .sort()
    .reduce((acc, key) => {
      acc[key] = sortObject(input[key]);
      return acc;
    }, {});
}

export function stableStringify(input) {
  return JSON.stringify(sortObject(input));
}

export function buildExternalEntityKey({ importType, entityType, externalId }) {
  const scope = String(importType || "").trim().toLowerCase();
  const entity = String(entityType || "").trim().toLowerCase();
  const id = String(externalId || "").trim();
  if (!scope || !entity || !id) return null;
  return `${scope}:${entity}:${id}`;
}

export function createIdempotencyKey({
  sourceType,
  importType,
  externalKey,
  payloadVersion,
  idempotencyToken,
  payloadFingerprint
}) {
  const digestInput = [
    String(sourceType || "").trim().toLowerCase(),
    String(importType || "").trim().toLowerCase(),
    String(externalKey || "").trim(),
    String(payloadVersion || "").trim(),
    String(idempotencyToken || "").trim(),
    stableStringify(payloadFingerprint ?? null)
  ].join("|");

  const digest = createHash("sha256").update(digestInput).digest("hex");
  return `idem_v1_${digest}`;
}

export function createIdempotencyLedger(seedKeys = []) {
  const keys = new Set(seedKeys.filter(Boolean));

  return {
    has(key) {
      return keys.has(key);
    },
    register(key) {
      if (!key) return { duplicate: false, key: null };
      const duplicate = keys.has(key);
      if (!duplicate) keys.add(key);
      return { duplicate, key };
    },
    snapshot() {
      return Array.from(keys.values()).sort();
    }
  };
}

export function checkAndRegisterIdempotencyKey({ key, ledger }) {
  if (!ledger || typeof ledger.register !== "function") {
    throw new Error("idempotency_ledger_required");
  }
  return ledger.register(key);
}


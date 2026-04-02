import { createHash } from "node:crypto";

const TRANSIENT_ERROR_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "ENOTFOUND"
]);

const TRANSIENT_HTTP_CODES = new Set([408, 425, 429]);

function toStatusCode(error) {
  const fromStatus = Number(error?.status);
  if (Number.isInteger(fromStatus)) return fromStatus;
  const fromStatusCode = Number(error?.statusCode);
  if (Number.isInteger(fromStatusCode)) return fromStatusCode;
  return null;
}

function deterministicJitterMs(seed, attempt) {
  const key = `${seed || "connector"}:${attempt}`;
  const digest = createHash("sha256").update(key).digest("hex").slice(0, 6);
  const sample = Number.parseInt(digest, 16);
  return Number.isFinite(sample) ? sample % 251 : 0;
}

export function classifyConnectorError(error) {
  const statusCode = toStatusCode(error);
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();

  if (TRANSIENT_ERROR_CODES.has(code)) {
    return { category: "network", retryable: true, code: code || "NETWORK_ERROR", statusCode };
  }

  if (statusCode !== null) {
    if (statusCode >= 500 || TRANSIENT_HTTP_CODES.has(statusCode)) {
      return { category: "remote_service", retryable: true, code: `HTTP_${statusCode}`, statusCode };
    }
    if (statusCode >= 400) {
      return { category: "contract", retryable: false, code: `HTTP_${statusCode}`, statusCode };
    }
  }

  if (message.includes("validation") || message.includes("schema") || message.includes("invalid_")) {
    return { category: "contract", retryable: false, code: "VALIDATION_ERROR", statusCode };
  }

  return { category: "unknown", retryable: false, code: "UNCLASSIFIED", statusCode };
}

export function computeRetryDelayMs({
  attempt,
  baseDelayMs = 1000,
  maxDelayMs = 60000,
  backoffFactor = 2,
  jitterSeed = "connector"
}) {
  const safeAttempt = Math.max(1, Number(attempt || 1));
  const exponential = baseDelayMs * backoffFactor ** (safeAttempt - 1);
  const jitter = deterministicJitterMs(jitterSeed, safeAttempt);
  return Math.min(maxDelayMs, exponential + jitter);
}

export function buildConnectorRunDecision({
  attempt,
  maxAttempts = 3,
  error,
  baseDelayMs = 1000,
  maxDelayMs = 60000,
  jitterSeed = "connector"
}) {
  const classification = classifyConnectorError(error);
  const safeAttempt = Math.max(1, Number(attempt || 1));
  const safeMaxAttempts = Math.max(1, Number(maxAttempts || 1));
  const canRetry = classification.retryable && safeAttempt < safeMaxAttempts;

  return {
    attempt: safeAttempt,
    maxAttempts: safeMaxAttempts,
    classification,
    shouldRetry: canRetry,
    nextDelayMs: canRetry
      ? computeRetryDelayMs({
        attempt: safeAttempt,
        baseDelayMs,
        maxDelayMs,
        jitterSeed
      })
      : null,
    terminalReason: canRetry ? null : classification.code
  };
}

export function buildReplayMetadata({
  runId,
  attempt,
  envelope,
  classification,
  now = new Date()
}) {
  const sourceType = String(envelope?.sourceType || "");
  const importType = String(envelope?.importType || "");
  const token = String(envelope?.idempotencyToken || "");
  const externalKey = String(envelope?.externalKey || "");

  return {
    schemaVersion: "int-connector-replay-v1",
    runId: runId || null,
    attempt: Number(attempt || 1),
    recordedAt: now.toISOString(),
    sourceType,
    importType,
    externalKey,
    idempotencyToken: token,
    classification: {
      category: String(classification?.category || "unknown"),
      code: String(classification?.code || "UNCLASSIFIED"),
      retryable: Boolean(classification?.retryable)
    }
  };
}

export function buildDeadLetterRecord({
  runId,
  attempt,
  envelope,
  classification,
  now = new Date(),
  reason = "terminal_failure",
  errorCount = 1
}) {
  const sourceType = String(envelope?.sourceType || "");
  const importType = String(envelope?.importType || "");
  const token = String(envelope?.idempotencyToken || "");
  const externalKey = String(envelope?.externalKey || "");

  return {
    schemaVersion: "int-dead-letter-v1",
    runId: runId || null,
    recordedAt: now.toISOString(),
    reason: String(reason || "terminal_failure"),
    sourceType,
    importType,
    externalKey,
    idempotencyToken: token,
    attempt: Number(attempt || 1),
    errorCount: Number(errorCount || 0),
    classification: {
      category: String(classification?.category || "unknown"),
      code: String(classification?.code || "UNCLASSIFIED"),
      retryable: Boolean(classification?.retryable)
    },
    replayControl: {
      replayable: true,
      strategy: "resubmit_with_new_token",
      requiresNewIdempotencyToken: true
    }
  };
}

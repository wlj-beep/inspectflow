import { createHash } from "node:crypto";

function safeString(input, maxLength = 120) {
  const value = String(input ?? "").trim();
  return value ? value.slice(0, maxLength) : null;
}

function hashText(input) {
  return createHash("sha256").update(String(input || "")).digest("hex").slice(0, 16);
}

function payloadType(payload) {
  if (Array.isArray(payload)) return "array";
  if (payload && typeof payload === "object") return "object";
  if (payload === null || payload === undefined) return "empty";
  return typeof payload;
}

function collectKeyPaths(input, { maxDepth = 3, prefix = "", depth = 0 } = {}) {
  if (depth >= maxDepth || !input || typeof input !== "object") return [];
  const paths = [];
  const entries = Array.isArray(input)
    ? input.slice(0, 5).map((value, index) => [String(index), value])
    : Object.entries(input).slice(0, 20);

  for (const [rawKey, value] of entries) {
    const key = String(rawKey)
      .replace(/[^a-zA-Z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48);
    const nextPath = prefix ? `${prefix}.${key}` : key;
    paths.push(nextPath);
    paths.push(...collectKeyPaths(value, { maxDepth, prefix: nextPath, depth: depth + 1 }));
  }

  return paths;
}

function summarizePayloadShape(payload) {
  const type = payloadType(payload);
  const keyPaths = collectKeyPaths(payload);

  if (type === "array") {
    return {
      type,
      itemCount: payload.length,
      keyPaths
    };
  }

  if (type === "object") {
    return {
      type,
      fieldCount: Object.keys(payload).length,
      keyPaths
    };
  }

  return { type };
}

function summarizeErrors(errors) {
  const list = (errors || []).map((error) => {
    const code = safeString(error?.code || error?.error || "unknown_error", 80);
    const statusCode = Number(error?.statusCode || error?.status);
    return {
      code: code || "unknown_error",
      statusCode: Number.isInteger(statusCode) ? statusCode : null,
      retryable: Boolean(error?.retryable),
      fingerprint: hashText(error?.message || error?.error || JSON.stringify(error || {}))
    };
  });

  const byCode = {};
  let retryableCount = 0;
  for (const item of list) {
    byCode[item.code] = (byCode[item.code] || 0) + 1;
    if (item.retryable) retryableCount += 1;
  }

  return {
    total: list.length,
    retryableCount,
    nonRetryableCount: list.length - retryableCount,
    byCode,
    samples: list.slice(0, 5)
  };
}

function summarizeUnresolved(items) {
  const byStatus = {};
  const byReason = {};

  for (const item of items || []) {
    const status = safeString(item?.status || "open", 32) || "open";
    const reason = safeString(item?.reason || "unresolved", 80) || "unresolved";
    byStatus[status] = (byStatus[status] || 0) + 1;
    byReason[reason] = (byReason[reason] || 0) + 1;
  }

  return {
    total: (items || []).length,
    byStatus,
    byReason
  };
}

function summarizeAttempts(attempts) {
  return (attempts || []).map((attempt) => ({
    attempt: Number(attempt?.attempt || 1),
    status: safeString(attempt?.status || "unknown", 24),
    startedAt: safeString(attempt?.startedAt, 48),
    finishedAt: safeString(attempt?.finishedAt, 48),
    durationMs: Number.isFinite(Number(attempt?.durationMs)) ? Number(attempt.durationMs) : null,
    retryDelayMs: Number.isFinite(Number(attempt?.retryDelayMs)) ? Number(attempt.retryDelayMs) : null,
    classificationCode: safeString(attempt?.classificationCode || attempt?.classification?.code, 48)
  }));
}

export function buildIntegrationSupportBundle({
  run,
  envelope,
  attempts = [],
  unresolvedItems = [],
  errors = [],
  now = new Date()
}) {
  const normalizedRun = run || {};
  const normalizedEnvelope = envelope || {};

  return {
    schemaVersion: "int-support-bundle-v1",
    generatedAt: now.toISOString(),
    run: {
      id: normalizedRun.id || null,
      status: safeString(normalizedRun.status || "unknown", 32),
      triggerMode: safeString(normalizedRun.triggerMode || normalizedRun.trigger_mode, 32),
      sourceType: safeString(normalizedRun.sourceType || normalizedEnvelope.sourceType, 32),
      importType: safeString(normalizedRun.importType || normalizedEnvelope.importType, 32),
      startedAt: safeString(normalizedRun.startedAt || normalizedRun.started_at, 48),
      finishedAt: safeString(normalizedRun.finishedAt || normalizedRun.finished_at, 48),
      durationMs: Number.isFinite(Number(normalizedRun.durationMs)) ? Number(normalizedRun.durationMs) : null
    },
    envelope: {
      payloadVersion: safeString(normalizedEnvelope.payloadVersion, 32),
      externalKeyPresent: Boolean(normalizedEnvelope.externalKey),
      idempotencyTokenSuffix: String(normalizedEnvelope.idempotencyToken || "").slice(-8) || null,
      actorType: safeString(normalizedEnvelope.actor?.type, 24),
      provenance: {
        adapter: safeString(normalizedEnvelope.provenance?.adapter, 64),
        integrationId: Number.isInteger(Number(normalizedEnvelope.provenance?.integrationId))
          ? Number(normalizedEnvelope.provenance.integrationId)
          : null,
        triggerMode: safeString(normalizedEnvelope.provenance?.triggerMode, 32)
      }
    },
    payloadSummary: summarizePayloadShape(normalizedEnvelope.payload),
    attempts: summarizeAttempts(attempts),
    unresolvedSummary: summarizeUnresolved(unresolvedItems),
    errorSummary: summarizeErrors(errors)
  };
}


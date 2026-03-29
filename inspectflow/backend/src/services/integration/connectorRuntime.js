import {
  createIdempotencyKey,
  createPayloadFingerprint,
  createIdempotencyLedger,
  checkAndRegisterIdempotencyKey
} from "../idempotency/idempotencyKey.js";
import {
  buildConnectorRunDecision,
  classifyConnectorError,
  buildReplayMetadata
} from "./connectorRunPolicy.js";
import {
  validateAndNormalizeCanonicalEnvelope
} from "./canonicalEnvelope.js";
import { buildIntegrationSupportBundle } from "../observability/integrationSupportBundle.js";

function toResultStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["success", "partial", "error"].includes(normalized)) return normalized;
  return "success";
}

function toAttemptStatus(ok) {
  return ok ? "success" : "error";
}

function normalizeImportResult(result, { fallbackStatus = "success" } = {}) {
  return {
    status: toResultStatus(result?.status || fallbackStatus),
    totalRows: Number(result?.totalRows || 0),
    inserted: Number(result?.inserted || 0),
    updated: Number(result?.updated || 0),
    failed: Number(result?.failed || 0),
    unresolvedCount: Number(result?.unresolvedCount || 0),
    errors: Array.isArray(result?.errors) ? result.errors : [],
    warnings: Array.isArray(result?.warnings) ? result.warnings : [],
    unresolvedItems: Array.isArray(result?.unresolvedItems) ? result.unresolvedItems : []
  };
}

export async function executeConnectorRuntime({
  runId = null,
  envelopeInput,
  executeImport,
  maxAttempts = 3,
  baseDelayMs = 1000,
  maxDelayMs = 60000,
  jitterSeed = "connector",
  ledger = createIdempotencyLedger(),
  now = () => new Date()
}) {
  if (typeof executeImport !== "function") {
    throw new Error("execute_import_required");
  }

  const normalized = validateAndNormalizeCanonicalEnvelope(envelopeInput, {
    requireExternalKey: true,
    now: now()
  });

  if (!normalized.ok) {
    return {
      ok: false,
      status: "error",
      code: "invalid_envelope",
      errors: normalized.errors,
      attempts: [],
      supportBundle: buildIntegrationSupportBundle({
        run: {
          id: runId,
          status: "error",
          sourceType: envelopeInput?.sourceType || envelopeInput?.source_type,
          importType: envelopeInput?.importType || envelopeInput?.import_type
        },
        envelope: envelopeInput || {},
        attempts: [],
        errors: normalized.errors.map((code) => ({ code, retryable: false }))
      })
    };
  }

  const envelope = normalized.value;
  const payloadFingerprint = createPayloadFingerprint(envelope.payload);
  const idempotencyKey = createIdempotencyKey({
    sourceType: envelope.sourceType,
    importType: envelope.importType,
    externalKey: envelope.externalKey,
    payloadVersion: envelope.payloadVersion,
    idempotencyToken: envelope.idempotencyToken,
    payloadFingerprint
  });

  const idempotencyCheck = await Promise.resolve(
    checkAndRegisterIdempotencyKey({ key: idempotencyKey, ledger })
  );
  if (idempotencyCheck.duplicate) {
    const duplicateResult = {
      ok: true,
      status: "success",
      duplicate: true,
      code: "idempotent_skip",
      runId,
      idempotencyKey,
      attempts: [],
      replayMetadata: null,
      result: normalizeImportResult({}, { fallbackStatus: "success" })
    };

    duplicateResult.supportBundle = buildIntegrationSupportBundle({
      run: {
        id: runId,
        status: duplicateResult.status,
        sourceType: envelope.sourceType,
        importType: envelope.importType
      },
      envelope,
      attempts: [],
      errors: []
    });
    return duplicateResult;
  }

  const attempts = [];
  const errorItems = [];
  let finalResult = null;
  let replayMetadata = null;

  for (let attempt = 1; attempt <= Math.max(1, Number(maxAttempts || 1)); attempt += 1) {
    const startedAt = now();
    try {
      const result = await executeImport({
        envelope,
        attempt,
        idempotencyKey
      });

      finalResult = normalizeImportResult(result, { fallbackStatus: "success" });

      const finishedAt = now();
      attempts.push({
        attempt,
        status: toAttemptStatus(true),
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
        retryDelayMs: null,
        classificationCode: null
      });
      break;
    } catch (error) {
      const finishedAt = now();
      const decision = buildConnectorRunDecision({
        attempt,
        maxAttempts,
        error,
        baseDelayMs,
        maxDelayMs,
        jitterSeed
      });

      attempts.push({
        attempt,
        status: toAttemptStatus(false),
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
        retryDelayMs: decision.nextDelayMs,
        classificationCode: decision.classification.code
      });

      errorItems.push({
        code: decision.classification.code,
        retryable: decision.classification.retryable,
        statusCode: decision.classification.statusCode,
        message: String(error?.message || "connector_runtime_error")
      });

      replayMetadata = buildReplayMetadata({
        runId,
        attempt,
        envelope,
        classification: classifyConnectorError(error),
        now: finishedAt
      });

      if (!decision.shouldRetry) {
        finalResult = normalizeImportResult({
          status: "error",
          totalRows: 0,
          inserted: 0,
          updated: 0,
          failed: 1,
          unresolvedCount: 0,
          errors: []
        }, { fallbackStatus: "error" });
        break;
      }
    }
  }

  const status = toResultStatus(finalResult?.status || "error");
  const runtimeResult = {
    ok: status !== "error",
    status,
    duplicate: false,
    runId,
    idempotencyKey,
    attempts,
    replayMetadata,
    errors: errorItems,
    result: finalResult || normalizeImportResult({
      status: "error",
      totalRows: 0,
      inserted: 0,
      updated: 0,
      failed: 1,
      unresolvedCount: 0,
      errors: []
    }, { fallbackStatus: "error" })
  };

  if (!runtimeResult.result.errors.length && errorItems.length) {
    runtimeResult.result.errors = errorItems.map((item) => ({
      code: item.code,
      message: item.message,
      retryable: item.retryable,
      statusCode: item.statusCode
    }));
  }

  runtimeResult.supportBundle = buildIntegrationSupportBundle({
    run: {
      id: runId,
      status,
      sourceType: envelope.sourceType,
      importType: envelope.importType
    },
    envelope,
    attempts,
    unresolvedItems: [],
    errors: errorItems
  });

  return runtimeResult;
}

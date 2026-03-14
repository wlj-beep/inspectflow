const DURATION_UNITS = {
  ms: 1,
  s: 1000,
  m: 60_000
};

const ALLOWED_BACKOFF = new Set(["fixed", "linear", "exponential"]);
const ALLOWED_UNRESOLVED_STRATEGY = new Set(["queue", "skip", "fail"]);

export const DEFAULT_CONNECTOR_POLICY = Object.freeze({
  retry: {
    maxAttempts: 3,
    backoff: "exponential",
    baseDelayMs: 500,
    maxDelayMs: 30_000,
    backoffMultiplier: 2,
    jitterRatio: 0
  },
  timeoutMs: 10_000,
  replayWindowMs: 60 * 60 * 1000,
  unresolved: {
    maxPerRun: 500,
    strategy: "queue"
  }
});

function parseDurationMs(value, fieldName) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a number of milliseconds or duration string`);
  }

  const match = value.trim().match(/^(\d+(?:\.\d+)?)(ms|s|m)$/i);
  if (!match) {
    throw new Error(`${fieldName} must match <number><unit> where unit is ms, s, or m`);
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = DURATION_UNITS[unit];

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${fieldName} must be a positive duration`);
  }

  return Math.round(amount * multiplier);
}

function parsePositiveInt(value, fieldName, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value)) {
    throw new Error(`${fieldName} must be an integer`);
  }
  if (value < min || value > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}`);
  }
  return value;
}

function parseRatio(value, fieldName) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a number`);
  }
  if (value < 0 || value > 1) {
    throw new Error(`${fieldName} must be between 0 and 1`);
  }
  return value;
}

function mergePolicy(rawPolicy = {}) {
  return {
    retry: {
      ...DEFAULT_CONNECTOR_POLICY.retry,
      ...(rawPolicy.retry ?? {})
    },
    timeoutMs: rawPolicy.timeoutMs ?? DEFAULT_CONNECTOR_POLICY.timeoutMs,
    replayWindowMs: rawPolicy.replayWindowMs ?? DEFAULT_CONNECTOR_POLICY.replayWindowMs,
    unresolved: {
      ...DEFAULT_CONNECTOR_POLICY.unresolved,
      ...(rawPolicy.unresolved ?? {})
    }
  };
}

export function parseConnectorPolicy(rawPolicy = {}) {
  const merged = mergePolicy(rawPolicy);

  const retry = {
    maxAttempts: parsePositiveInt(merged.retry.maxAttempts, "retry.maxAttempts", { min: 1, max: 20 }),
    backoff: merged.retry.backoff,
    baseDelayMs: parseDurationMs(merged.retry.baseDelayMs, "retry.baseDelayMs"),
    maxDelayMs: parseDurationMs(merged.retry.maxDelayMs, "retry.maxDelayMs"),
    backoffMultiplier:
      typeof merged.retry.backoffMultiplier === "number" && Number.isFinite(merged.retry.backoffMultiplier)
        ? merged.retry.backoffMultiplier
        : Number.NaN,
    jitterRatio: parseRatio(merged.retry.jitterRatio, "retry.jitterRatio")
  };

  if (!ALLOWED_BACKOFF.has(retry.backoff)) {
    throw new Error(`retry.backoff must be one of: ${Array.from(ALLOWED_BACKOFF).join(", ")}`);
  }
  if (!Number.isFinite(retry.backoffMultiplier) || retry.backoffMultiplier < 1 || retry.backoffMultiplier > 10) {
    throw new Error("retry.backoffMultiplier must be between 1 and 10");
  }
  if (retry.maxDelayMs < retry.baseDelayMs) {
    throw new Error("retry.maxDelayMs must be greater than or equal to retry.baseDelayMs");
  }

  const timeoutMs = parseDurationMs(merged.timeoutMs, "timeoutMs");
  const replayWindowMs = parseDurationMs(merged.replayWindowMs, "replayWindowMs");

  if (timeoutMs < 100) {
    throw new Error("timeoutMs must be at least 100ms");
  }
  if (replayWindowMs < 1000) {
    throw new Error("replayWindowMs must be at least 1000ms");
  }

  const unresolved = {
    maxPerRun: parsePositiveInt(merged.unresolved.maxPerRun, "unresolved.maxPerRun", { min: 1, max: 100_000 }),
    strategy: merged.unresolved.strategy
  };

  if (!ALLOWED_UNRESOLVED_STRATEGY.has(unresolved.strategy)) {
    throw new Error(
      `unresolved.strategy must be one of: ${Array.from(ALLOWED_UNRESOLVED_STRATEGY).join(", ")}`
    );
  }

  return {
    retry,
    timeoutMs,
    replayWindowMs,
    unresolved
  };
}

export function validateConnectorPolicy(rawPolicy = {}) {
  try {
    const policy = parseConnectorPolicy(rawPolicy);
    return { ok: true, errors: [], policy };
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}

function jitterDelay(delayMs, jitterRatio, attemptNumber, seed = 0) {
  if (jitterRatio === 0) {
    return delayMs;
  }

  const pseudo = ((seed + attemptNumber * 17) % 1000) / 1000;
  const signed = (pseudo * 2) - 1;
  const withJitter = delayMs + (delayMs * jitterRatio * signed);
  return Math.max(0, Math.round(withJitter));
}

export function computeRetryDelayMs(policy, attemptNumber, { jitterSeed = 0 } = {}) {
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) {
    throw new Error("attemptNumber must be an integer >= 1");
  }

  const parsed = parseConnectorPolicy(policy);
  const { retry } = parsed;

  let baseDelay;
  if (retry.backoff === "fixed") {
    baseDelay = retry.baseDelayMs;
  } else if (retry.backoff === "linear") {
    baseDelay = retry.baseDelayMs * attemptNumber;
  } else {
    baseDelay = retry.baseDelayMs * (retry.backoffMultiplier ** (attemptNumber - 1));
  }

  const cappedDelay = Math.min(Math.round(baseDelay), retry.maxDelayMs);
  return jitterDelay(cappedDelay, retry.jitterRatio, attemptNumber, jitterSeed);
}

export function buildRetryPlan(policy, { jitterSeed = 0 } = {}) {
  const parsed = parseConnectorPolicy(policy);
  const delays = [];

  for (let attempt = 1; attempt < parsed.retry.maxAttempts; attempt += 1) {
    delays.push(computeRetryDelayMs(parsed, attempt, { jitterSeed }));
  }

  return delays;
}

export { parseDurationMs };

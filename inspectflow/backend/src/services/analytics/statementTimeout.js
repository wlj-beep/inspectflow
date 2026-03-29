import { transaction } from "../../db.js";

export const DEFAULT_ANALYTICS_STATEMENT_TIMEOUT_MS = 30_000;

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return fallback;
}

export function getAnalyticsStatementTimeoutMs(rawValue = process.env.ANALYTICS_STATEMENT_TIMEOUT_MS) {
  return parsePositiveInt(rawValue, DEFAULT_ANALYTICS_STATEMENT_TIMEOUT_MS);
}

async function applyStatementTimeout(client, timeoutMs) {
  await client.query("SELECT set_config('statement_timeout', $1, true)", [String(timeoutMs)]);
}

export async function withAnalyticsStatementTimeout(fn, {
  timeoutMs = getAnalyticsStatementTimeoutMs(),
  transactionFn = transaction
} = {}) {
  return transactionFn(async (client) => {
    await applyStatementTimeout(client, timeoutMs);
    return fn(client);
  });
}

export async function analyticsQuery(text, params, options = {}) {
  return withAnalyticsStatementTimeout((client) => client.query(text, params), options);
}

export function isAnalyticsTimeoutError(error) {
  return String(error?.code || "") === "57014"
    || /statement timeout/i.test(String(error?.message || ""));
}

export function buildAnalyticsTimeoutResponse({
  timeoutMs = getAnalyticsStatementTimeoutMs()
} = {}) {
  return {
    error: "analytics_timeout",
    timeoutMs,
    detail: "statement_timeout_exceeded"
  };
}

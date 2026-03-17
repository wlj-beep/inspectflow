/**
 * Token budget tracking and retry logic for Anthropic API calls.
 * Handles 429 (rate limit) and 5xx (server error) responses with
 * exponential backoff. Uses Promise.allSettled so one agent failing
 * does not abort the others.
 */

const INITIAL_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 60_000;
const MAX_RETRIES = 5;

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps an Anthropic SDK call with retry logic for rate limits and
 * transient server errors. Returns the response or throws after
 * exhausting retries.
 *
 * @param {Function} fn - Async function that makes the API call
 * @param {string} label - Human-readable label for logging
 * @returns {Promise<object>} Anthropic API response
 */
export async function withRetry(fn, label = "api call") {
  let attempt = 0;
  let backoff = INITIAL_BACKOFF_MS;

  while (attempt <= MAX_RETRIES) {
    try {
      const result = await fn();
      return result;
    } catch (err) {
      const status = err?.status ?? err?.response?.status;
      const isRateLimit = status === 429;
      const isServerError = status >= 500 && status < 600;

      if (!isRateLimit && !isServerError) {
        // Non-retriable error — propagate immediately
        throw err;
      }

      attempt++;
      if (attempt > MAX_RETRIES) {
        console.error(`[token-budget] ${label}: exhausted ${MAX_RETRIES} retries (last status ${status})`);
        throw err;
      }

      // For 429, use the Retry-After header if present
      const retryAfterHeader = err?.headers?.["retry-after"];
      const waitMs = retryAfterHeader
        ? parseInt(retryAfterHeader, 10) * 1000
        : Math.min(backoff, MAX_BACKOFF_MS);

      console.warn(
        `[token-budget] ${label}: status ${status}, attempt ${attempt}/${MAX_RETRIES}, ` +
        `waiting ${Math.round(waitMs / 1000)}s before retry`
      );

      await sleep(waitMs);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    }
  }
}

/**
 * Simple token usage tracker. Accumulates input/output token counts
 * across all API calls in a run and logs a cost estimate at the end.
 */
export class TokenTracker {
  constructor() {
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.callCount = 0;
  }

  record(usage) {
    if (!usage) return;
    this.inputTokens += usage.input_tokens ?? 0;
    this.outputTokens += usage.output_tokens ?? 0;
    this.callCount++;
  }

  /**
   * Returns a human-readable summary string.
   * Pricing: claude-sonnet-4-6 approx $3/MTok input, $15/MTok output (as of early 2026)
   */
  summary() {
    const inputCost = (this.inputTokens / 1_000_000) * 3.0;
    const outputCost = (this.outputTokens / 1_000_000) * 15.0;
    const totalCost = inputCost + outputCost;
    return (
      `Token usage: ${this.inputTokens.toLocaleString()} input, ` +
      `${this.outputTokens.toLocaleString()} output ` +
      `across ${this.callCount} API call(s). ` +
      `Estimated cost: ~$${totalCost.toFixed(4)}`
    );
  }
}

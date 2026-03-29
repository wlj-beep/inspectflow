import { describe, expect, it } from "vitest";
import {
  analyticsQuery,
  buildAnalyticsTimeoutResponse,
  getAnalyticsStatementTimeoutMs,
  isAnalyticsTimeoutError,
  withAnalyticsStatementTimeout
} from "../src/services/analytics/statementTimeout.js";

describe("analytics statement timeout controls", () => {
  it("applies the configured statement_timeout before running the query", async () => {
    const calls = [];
    const result = await analyticsQuery(
      "SELECT 1 AS ok",
      [],
      {
        timeoutMs: 1234,
        transactionFn: async (callback) => callback({
          query: async (text, params) => {
            calls.push({ text, params });
            if (text.startsWith("SELECT set_config")) {
              return { rows: [] };
            }
            return { rows: [{ ok: 1 }] };
          }
        })
      }
    );

    expect(result.rows).toEqual([{ ok: 1 }]);
    expect(calls[0]).toEqual({
      text: "SELECT set_config('statement_timeout', $1, true)",
      params: ["1234"]
    });
    expect(calls[1]).toEqual({
      text: "SELECT 1 AS ok",
      params: []
    });
  });

  it("formats structured timeout responses from pg timeout errors", () => {
    expect(isAnalyticsTimeoutError({ code: "57014" })).toBe(true);
    expect(isAnalyticsTimeoutError({ message: "canceling statement due to statement timeout" })).toBe(true);
    expect(isAnalyticsTimeoutError({ code: "23505" })).toBe(false);
    expect(buildAnalyticsTimeoutResponse({ timeoutMs: 45000 })).toEqual({
      error: "analytics_timeout",
      timeoutMs: 45000,
      detail: "statement_timeout_exceeded"
    });
    expect(getAnalyticsStatementTimeoutMs("not-a-number")).toBe(30000);
  });

  it("allows direct transaction wrapping for multi-statement analytics work", async () => {
    const seen = [];
    const result = await withAnalyticsStatementTimeout(
      async (client) => {
        seen.push("callback");
        return client.query("SELECT 2 AS ok", []);
      },
      {
        timeoutMs: 2000,
        transactionFn: async (callback) => callback({
          query: async (text, params) => {
            seen.push([text, params]);
            return { rows: [{ ok: 2 }] };
          }
        })
      }
    );

    expect(result.rows).toEqual([{ ok: 2 }]);
    expect(seen).toEqual([
      ["SELECT set_config('statement_timeout', $1, true)", ["2000"]],
      "callback",
      ["SELECT 2 AS ok", []]
    ]);
  });
});

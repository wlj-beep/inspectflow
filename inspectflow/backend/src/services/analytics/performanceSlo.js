import { analyticsQuery } from "./statementTimeout.js";

const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_BUILD_P95_MS = 30000;
const DEFAULT_MIN_SUCCESS_RATE = 0.95;
const DEFAULT_MAX_ERROR_RATE = 0.05;
const DEFAULT_STORAGE_BUDGET_MB = 2048;

function toPositiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function toPositiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function round(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function scoreThreshold({ better, actual, target }) {
  if (actual == null || target == null) return "warn";
  if (better === "at_least") return actual >= target ? "pass" : "fail";
  if (better === "at_most") return actual <= target ? "pass" : "fail";
  return "warn";
}

export async function getAnalyticsPerformanceSlo({
  siteId = "default"
} = {}) {
  const windowDays = toPositiveInt(process.env.ANALYTICS_SLO_WINDOW_DAYS, DEFAULT_WINDOW_DAYS);
  const maxBuildP95Ms = toPositiveInt(process.env.ANALYTICS_SLO_MAX_BUILD_P95_MS, DEFAULT_BUILD_P95_MS);
  const minSuccessRate = toPositiveNumber(process.env.ANALYTICS_SLO_MIN_SUCCESS_RATE, DEFAULT_MIN_SUCCESS_RATE);
  const maxErrorRate = toPositiveNumber(process.env.ANALYTICS_SLO_MAX_ERROR_RATE, DEFAULT_MAX_ERROR_RATE);
  const storageBudgetMb = toPositiveInt(process.env.ANALYTICS_SLO_STORAGE_BUDGET_MB, DEFAULT_STORAGE_BUDGET_MB);

  const buildStats = await analyticsQuery(
    `SELECT
       COUNT(*)::INT AS total_builds,
       COUNT(*) FILTER (WHERE status='success')::INT AS success_builds,
       COUNT(*) FILTER (WHERE status='error')::INT AS error_builds,
       AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)::NUMERIC AS avg_build_ms,
       PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)::NUMERIC AS p95_build_ms
     FROM ana_mart_build_runs
     WHERE site_id=$1
       AND created_at >= NOW() - ($2::TEXT || ' days')::INTERVAL`,
    [siteId, windowDays]
  );

  const storageRes = await analyticsQuery(
    `SELECT (
       pg_total_relation_size('ana_mart_inspection_fact')
       + pg_total_relation_size('ana_mart_connector_run_fact')
       + pg_total_relation_size('ana_mart_job_rollup_day')
       + pg_total_relation_size('ana_mart_build_runs')
       + pg_total_relation_size('ana_risk_event_log')
     )::BIGINT AS storage_bytes`,
    []
  );

  const row = buildStats.rows[0] || {};
  const totalBuilds = Number(row.total_builds || 0);
  const successBuilds = Number(row.success_builds || 0);
  const errorBuilds = Number(row.error_builds || 0);
  const successRate = totalBuilds > 0 ? successBuilds / totalBuilds : null;
  const errorRate = totalBuilds > 0 ? errorBuilds / totalBuilds : 0;
  const avgBuildMs = row.avg_build_ms == null ? null : Number(row.avg_build_ms);
  const p95BuildMs = row.p95_build_ms == null ? null : Number(row.p95_build_ms);
  const storageBytes = Number(storageRes.rows[0]?.storage_bytes || 0);
  const storageMb = storageBytes / (1024 * 1024);

  const checks = [
    {
      id: "build_p95_latency",
      status: scoreThreshold({ better: "at_most", actual: p95BuildMs, target: maxBuildP95Ms }),
      better: "at_most",
      actual: round(p95BuildMs, 2),
      target: maxBuildP95Ms,
      unit: "ms"
    },
    {
      id: "build_success_rate",
      status: scoreThreshold({ better: "at_least", actual: successRate, target: minSuccessRate }),
      better: "at_least",
      actual: round(successRate, 4),
      target: minSuccessRate,
      unit: "ratio"
    },
    {
      id: "build_error_rate",
      status: scoreThreshold({ better: "at_most", actual: errorRate, target: maxErrorRate }),
      better: "at_most",
      actual: round(errorRate, 4),
      target: maxErrorRate,
      unit: "ratio"
    },
    {
      id: "analytics_storage_budget",
      status: scoreThreshold({ better: "at_most", actual: storageMb, target: storageBudgetMb }),
      better: "at_most",
      actual: round(storageMb, 2),
      target: storageBudgetMb,
      unit: "mb"
    }
  ];

  const hasFail = checks.some((check) => check.status === "fail");
  const hasWarn = checks.some((check) => check.status === "warn");

  return {
    contractId: "ANA-KPI-v3",
    capabilityId: "BL-045-analytics-slo-v1",
    siteId,
    windowDays,
    thresholds: {
      maxBuildP95Ms,
      minSuccessRate,
      maxErrorRate,
      storageBudgetMb
    },
    metrics: {
      totalBuilds,
      successBuilds,
      errorBuilds,
      avgBuildMs: round(avgBuildMs, 2),
      p95BuildMs: round(p95BuildMs, 2),
      successRate: round(successRate, 4),
      errorRate: round(errorRate, 4),
      storageMb: round(storageMb, 2)
    },
    checks,
    overallStatus: hasFail ? "fail" : hasWarn ? "warn" : "pass"
  };
}

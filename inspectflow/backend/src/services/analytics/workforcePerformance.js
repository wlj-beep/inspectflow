import { ANA_KPI_METRIC_KEYS } from "./anaV3Vocabulary.js";
import { analyticsQuery } from "./statementTimeout.js";
import { normalizeIsoTimestamp } from "../dateValidation.js";

const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_BREAKDOWN_LIMIT = 20;
const MAX_BREAKDOWN_LIMIT = 500;

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (Number.isInteger(n) && n > 0) return n;
  return fallback;
}

function defaultWindow() {
  const end = new Date();
  const start = new Date(end.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  return {
    dateFrom: start.toISOString(),
    dateTo: end.toISOString()
  };
}

function buildWindow({ dateFrom, dateTo }) {
  const normalizedFrom = normalizeIsoTimestamp(dateFrom, "date_from");
  const normalizedTo = normalizeIsoTimestamp(dateTo, "date_to");
  const defaults = defaultWindow();
  const window = {
    dateFrom: normalizedFrom || defaults.dateFrom,
    dateTo: normalizedTo || defaults.dateTo
  };

  if (window.dateFrom > window.dateTo) {
    throw new Error("invalid_window_range");
  }

  return window;
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function ratio(numerator, denominator) {
  if (!denominator) return null;
  return safeNumber(numerator) / safeNumber(denominator);
}

async function loadSummary(window, siteId) {
  const inspectionRes = await analyticsQuery(
    `SELECT
       COALESCE(SUM(measurement_count), 0)::INT AS total_pieces,
       COALESCE(SUM(pass_count), 0)::INT AS pass_pieces,
       COALESCE(SUM(oot_count), 0)::INT AS oot_pieces,
       COALESCE(SUM(rework_count), 0)::INT AS correction_events,
       COUNT(DISTINCT record_id)::INT AS records_submitted,
       COUNT(DISTINCT operator_user_id)::INT AS active_operators,
       COUNT(DISTINCT job_id)::INT AS jobs_observed
     FROM ana_mart_inspection_fact
     WHERE event_at >= $1 AND event_at <= $2
       AND site_id=$3`,
    [window.dateFrom, window.dateTo, siteId]
  );

  const connectorRes = await analyticsQuery(
    `SELECT
       COALESCE(SUM(run_count), 0)::INT AS connector_total_runs,
       COALESCE(SUM(replayed_count), 0)::INT AS connector_replayed_runs,
       COALESCE(SUM(failure_count), 0)::INT AS connector_failed_runs
     FROM ana_mart_connector_run_fact
     WHERE run_ended_at >= $1 AND run_ended_at <= $2
       AND site_id=$3`,
    [window.dateFrom, window.dateTo, siteId]
  );

  const inspection = inspectionRes.rows[0] || {};
  const connector = connectorRes.rows[0] || {};
  const totalPieces = safeNumber(inspection.total_pieces);
  const passPieces = safeNumber(inspection.pass_pieces);
  const ootPieces = safeNumber(inspection.oot_pieces);
  const correctionEvents = safeNumber(inspection.correction_events);
  const recordsSubmitted = safeNumber(inspection.records_submitted);

  return {
    totals: {
      totalPieces,
      passPieces,
      ootPieces,
      correctionEvents,
      recordsSubmitted,
      activeOperators: safeNumber(inspection.active_operators),
      jobsObserved: safeNumber(inspection.jobs_observed),
      connectorTotalRuns: safeNumber(connector.connector_total_runs),
      connectorReplayedRuns: safeNumber(connector.connector_replayed_runs),
      connectorFailedRuns: safeNumber(connector.connector_failed_runs)
    },
    rates: {
      firstPassYield: ratio(passPieces, totalPieces),
      ootRate: ratio(ootPieces, totalPieces),
      correctionRate: ratio(correctionEvents, totalPieces),
      avgPiecesPerRecord: ratio(totalPieces, recordsSubmitted),
      connectorFailureRate: ratio(connector.connector_failed_runs, connector.connector_total_runs),
      connectorReplayRate: ratio(connector.connector_replayed_runs, connector.connector_total_runs)
    },
    metricKeyMap: {
      totalPieces: ANA_KPI_METRIC_KEYS.TOTAL_PIECES,
      passPieces: ANA_KPI_METRIC_KEYS.PASS_PIECES,
      ootPieces: ANA_KPI_METRIC_KEYS.OOT_PIECES,
      correctionEvents: ANA_KPI_METRIC_KEYS.CORRECTION_EVENTS,
      connectorTotalRuns: ANA_KPI_METRIC_KEYS.CONNECTOR_TOTAL_RUNS,
      connectorReplayedRuns: ANA_KPI_METRIC_KEYS.CONNECTOR_REPLAYED_RUNS,
      connectorFailedRuns: ANA_KPI_METRIC_KEYS.CONNECTOR_FAILED_RUNS
    }
  };
}

async function loadOperatorBreakdown(window, limit, siteId) {
  const { rows } = await analyticsQuery(
    `SELECT
       amif.operator_user_id,
       COALESCE(u.name, 'Unknown') AS operator_name,
       COUNT(DISTINCT amif.record_id)::INT AS records_submitted,
       COALESCE(SUM(amif.measurement_count), 0)::INT AS total_pieces,
       COALESCE(SUM(amif.pass_count), 0)::INT AS pass_pieces,
       COALESCE(SUM(amif.oot_count), 0)::INT AS oot_pieces,
       COALESCE(SUM(amif.rework_count), 0)::INT AS correction_events
     FROM ana_mart_inspection_fact amif
     LEFT JOIN users u ON u.id=amif.operator_user_id
     WHERE amif.event_at >= $1 AND amif.event_at <= $2
       AND amif.site_id=$3
     GROUP BY amif.operator_user_id, COALESCE(u.name, 'Unknown')
     ORDER BY total_pieces DESC, operator_name ASC
     LIMIT $4`,
    [window.dateFrom, window.dateTo, siteId, limit]
  );

  return rows.map((row) => {
    const totalPieces = safeNumber(row.total_pieces);
    const passPieces = safeNumber(row.pass_pieces);
    const ootPieces = safeNumber(row.oot_pieces);
    const correctionEvents = safeNumber(row.correction_events);
    const recordsSubmitted = safeNumber(row.records_submitted);
    return {
      operatorUserId: row.operator_user_id ? Number(row.operator_user_id) : null,
      operatorName: row.operator_name,
      totals: {
        recordsSubmitted,
        totalPieces,
        passPieces,
        ootPieces,
        correctionEvents
      },
      rates: {
        firstPassYield: ratio(passPieces, totalPieces),
        ootRate: ratio(ootPieces, totalPieces),
        correctionRate: ratio(correctionEvents, totalPieces),
        avgPiecesPerRecord: ratio(totalPieces, recordsSubmitted)
      }
    };
  });
}

async function loadWorkCenterBreakdown(window, limit, siteId) {
  const { rows } = await analyticsQuery(
    `SELECT
       COALESCE(work_center_id, 'unassigned') AS work_center_id,
       COUNT(DISTINCT record_id)::INT AS records_submitted,
       COALESCE(SUM(measurement_count), 0)::INT AS total_pieces,
       COALESCE(SUM(pass_count), 0)::INT AS pass_pieces,
       COALESCE(SUM(oot_count), 0)::INT AS oot_pieces,
       COALESCE(SUM(rework_count), 0)::INT AS correction_events
     FROM ana_mart_inspection_fact
     WHERE event_at >= $1 AND event_at <= $2
       AND site_id=$3
     GROUP BY COALESCE(work_center_id, 'unassigned')
     ORDER BY total_pieces DESC, work_center_id ASC
     LIMIT $4`,
    [window.dateFrom, window.dateTo, siteId, limit]
  );

  return rows.map((row) => {
    const totalPieces = safeNumber(row.total_pieces);
    const passPieces = safeNumber(row.pass_pieces);
    const ootPieces = safeNumber(row.oot_pieces);
    const correctionEvents = safeNumber(row.correction_events);
    const recordsSubmitted = safeNumber(row.records_submitted);
    return {
      workCenterId: row.work_center_id,
      totals: {
        recordsSubmitted,
        totalPieces,
        passPieces,
        ootPieces,
        correctionEvents
      },
      rates: {
        firstPassYield: ratio(passPieces, totalPieces),
        ootRate: ratio(ootPieces, totalPieces),
        correctionRate: ratio(correctionEvents, totalPieces),
        avgPiecesPerRecord: ratio(totalPieces, recordsSubmitted)
      }
    };
  });
}

async function loadJobBreakdown(window, limit, siteId) {
  const { rows } = await analyticsQuery(
    `SELECT
       job_id,
       part_id,
       COUNT(DISTINCT record_id)::INT AS records_submitted,
       COALESCE(SUM(measurement_count), 0)::INT AS total_pieces,
       COALESCE(SUM(pass_count), 0)::INT AS pass_pieces,
       COALESCE(SUM(oot_count), 0)::INT AS oot_pieces,
       COALESCE(SUM(rework_count), 0)::INT AS correction_events
     FROM ana_mart_inspection_fact
     WHERE event_at >= $1 AND event_at <= $2
       AND site_id=$3
     GROUP BY job_id, part_id
     ORDER BY total_pieces DESC, job_id ASC
     LIMIT $4`,
    [window.dateFrom, window.dateTo, siteId, limit]
  );

  return rows.map((row) => {
    const totalPieces = safeNumber(row.total_pieces);
    const passPieces = safeNumber(row.pass_pieces);
    const ootPieces = safeNumber(row.oot_pieces);
    const correctionEvents = safeNumber(row.correction_events);
    const recordsSubmitted = safeNumber(row.records_submitted);
    return {
      jobId: row.job_id,
      partId: row.part_id,
      totals: {
        recordsSubmitted,
        totalPieces,
        passPieces,
        ootPieces,
        correctionEvents
      },
      rates: {
        firstPassYield: ratio(passPieces, totalPieces),
        ootRate: ratio(ootPieces, totalPieces),
        correctionRate: ratio(correctionEvents, totalPieces),
        avgPiecesPerRecord: ratio(totalPieces, recordsSubmitted)
      }
    };
  });
}

async function loadDailyTrend(window, limit, siteId) {
  const { rows } = await analyticsQuery(
    `SELECT
       (event_at AT TIME ZONE 'UTC')::DATE::TEXT AS day,
       COUNT(DISTINCT record_id)::INT AS records_submitted,
       COALESCE(SUM(measurement_count), 0)::INT AS total_pieces,
       COALESCE(SUM(pass_count), 0)::INT AS pass_pieces,
       COALESCE(SUM(oot_count), 0)::INT AS oot_pieces,
       COALESCE(SUM(rework_count), 0)::INT AS correction_events
     FROM ana_mart_inspection_fact
     WHERE event_at >= $1 AND event_at <= $2
       AND site_id=$3
     GROUP BY (event_at AT TIME ZONE 'UTC')::DATE
     ORDER BY day DESC
     LIMIT $4`,
    [window.dateFrom, window.dateTo, siteId, limit]
  );

  return rows
    .map((row) => {
      const totalPieces = safeNumber(row.total_pieces);
      const passPieces = safeNumber(row.pass_pieces);
      const ootPieces = safeNumber(row.oot_pieces);
      const correctionEvents = safeNumber(row.correction_events);
      const recordsSubmitted = safeNumber(row.records_submitted);
      return {
        day: row.day,
        totals: {
          recordsSubmitted,
          totalPieces,
          passPieces,
          ootPieces,
          correctionEvents
        },
        rates: {
          firstPassYield: ratio(passPieces, totalPieces),
          ootRate: ratio(ootPieces, totalPieces),
          correctionRate: ratio(correctionEvents, totalPieces),
          avgPiecesPerRecord: ratio(totalPieces, recordsSubmitted)
        }
      };
    })
    .sort((left, right) => String(left.day).localeCompare(String(right.day)));
}

async function loadJobStatusSummary() {
  const { rows } = await analyticsQuery(
    `SELECT status, COUNT(*)::INT AS count
     FROM jobs
     GROUP BY status`
  );
  const summary = {
    open: 0,
    draft: 0,
    incomplete: 0,
    closed: 0
  };
  for (const row of rows) {
    const key = String(row.status || "").trim();
    if (Object.hasOwn(summary, key)) {
      summary[key] = Number(row.count || 0);
    }
  }
  return summary;
}

async function loadLatestBuildMeta(siteId) {
  const { rows } = await analyticsQuery(
    `SELECT id, trigger_source, transform_version, status, created_at, completed_at
     FROM ana_mart_build_runs
     WHERE site_id=$1
     ORDER BY id DESC
     LIMIT 1`,
    [siteId]
  );
  return rows[0] || null;
}

export async function getWorkforcePerformanceDashboard({
  dateFrom = null,
  dateTo = null,
  limit = DEFAULT_BREAKDOWN_LIMIT,
  siteId = "default"
} = {}) {
  const window = buildWindow({ dateFrom, dateTo });
  const safeLimit = Math.min(MAX_BREAKDOWN_LIMIT, toPositiveInt(limit, DEFAULT_BREAKDOWN_LIMIT));

  const [summary, byOperator, byWorkCenter, byJob, dailyTrend, jobStatusCounts, latestBuild] = await Promise.all([
    loadSummary(window, siteId),
    loadOperatorBreakdown(window, safeLimit, siteId),
    loadWorkCenterBreakdown(window, safeLimit, siteId),
    loadJobBreakdown(window, safeLimit, siteId),
    loadDailyTrend(window, Math.max(safeLimit, 30), siteId),
    loadJobStatusSummary(),
    loadLatestBuildMeta(siteId)
  ]);

  return {
    contractId: "ANA-KPI-v3",
    capabilityId: "BL-070-supervisor-performance-v1",
    dashboardId: "supervisor_admin_performance_v1",
    siteId,
    window,
    freshness: {
      latestBuild
    },
    summary: summary.totals,
    rates: summary.rates,
    metricKeyMap: summary.metricKeyMap,
    production: {
      jobStatusCounts
    },
    breakdowns: {
      byOperator,
      byWorkCenter,
      byJob,
      dailyTrend
    }
  };
}

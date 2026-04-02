import { query } from "../../db.js";

const CONTRACT_ID = "COMM-GTM-v1";
const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_SITE_ID = "default";
const SITE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

function toOptionalIso(value, fieldName) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`invalid_${fieldName}`);
  }
  return date.toISOString();
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
  const normalizedFrom = toOptionalIso(dateFrom, "date_from");
  const normalizedTo = toOptionalIso(dateTo, "date_to");
  if (normalizedFrom && normalizedTo && normalizedFrom > normalizedTo) {
    throw new Error("invalid_window_range");
  }
  if (!normalizedFrom && !normalizedTo) return defaultWindow();
  return {
    dateFrom: normalizedFrom || defaultWindow().dateFrom,
    dateTo: normalizedTo || new Date().toISOString()
  };
}

function normalizeSiteId(siteId) {
  if (siteId === undefined || siteId === null || String(siteId).trim() === "") {
    return null;
  }
  const trimmed = String(siteId).trim();
  if (trimmed === "*" || trimmed.toLowerCase() === "all") {
    throw new Error("invalid_site_scope");
  }
  if (!SITE_ID_PATTERN.test(trimmed)) {
    throw new Error("invalid_site_id");
  }
  return trimmed;
}

function resolveSiteFilter({ siteId, entitlements }) {
  const normalizedSiteId = normalizeSiteId(siteId);
  const multisiteEnabled = entitlements?.moduleFlags?.MULTISITE === true;
  if (!multisiteEnabled) {
    if (normalizedSiteId && normalizedSiteId !== DEFAULT_SITE_ID) {
      throw new Error("multisite_not_enabled");
    }
    return {
      multisiteEnabled,
      siteFilter: DEFAULT_SITE_ID
    };
  }
  return {
    multisiteEnabled,
    siteFilter: normalizedSiteId
  };
}

function ratio(numerator, denominator) {
  const n = Number(numerator || 0);
  const d = Number(denominator || 0);
  if (d <= 0) return 0;
  return n / d;
}

function roundPercent(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value || 0))));
}

function scoreDeployment(metrics) {
  let score = 0;
  const signals = {
    connectorActivity: metrics.connectorRuns > 0,
    inspectionsCaptured: metrics.measurementCount > 0,
    traceableJobs: metrics.jobCount > 0,
    operatorCoverage: metrics.operatorCount > 0,
    workCenterCoverage: metrics.workCenterCount > 0
  };
  if (signals.connectorActivity) score += 20;
  if (signals.inspectionsCaptured) score += 30;
  if (signals.traceableJobs) score += 20;
  if (signals.operatorCoverage) score += 15;
  if (signals.workCenterCoverage) score += 15;

  const status = score >= 85 ? "ready" : score >= 50 ? "in_progress" : "not_started";
  return {
    score,
    status,
    signals
  };
}

function scoreAdoption(metrics) {
  let score = 0;
  if (metrics.measurementCount >= 20) score += 30;
  else if (metrics.measurementCount >= 5) score += 18;
  else if (metrics.measurementCount > 0) score += 8;

  if (metrics.activeDays >= 5) score += 25;
  else if (metrics.activeDays >= 2) score += 14;
  else if (metrics.activeDays >= 1) score += 6;

  if (metrics.jobCount >= 4) score += 20;
  else if (metrics.jobCount >= 2) score += 12;
  else if (metrics.jobCount >= 1) score += 5;

  if (metrics.operatorCount >= 3) score += 15;
  else if (metrics.operatorCount >= 2) score += 10;
  else if (metrics.operatorCount >= 1) score += 4;

  if (metrics.connectorRuns >= 5) score += 10;
  else if (metrics.connectorRuns >= 1) score += 4;

  let milestone = "not_started";
  if (score >= 75) milestone = "expanding";
  else if (score >= 45) milestone = "adopting";
  else if (score >= 15) milestone = "activated";

  return {
    score,
    milestone,
    signals: {
      activeDays: metrics.activeDays,
      jobsObserved: metrics.jobCount,
      operatorsActive: metrics.operatorCount,
      measuredPieces: metrics.measurementCount,
      connectorRuns: metrics.connectorRuns
    }
  };
}

function scoreRenewalRisk(metrics, adoptionScore) {
  const ootRate = ratio(metrics.ootCount, metrics.measurementCount);
  const connectorFailureRate = ratio(metrics.connectorFailures, metrics.connectorRuns);
  const replayRate = ratio(metrics.connectorReplays, metrics.connectorRuns);

  let score = 0;
  if (ootRate >= 0.25) score += 35;
  else if (ootRate >= 0.1) score += 20;
  else if (metrics.measurementCount > 0) score += 6;

  if (connectorFailureRate >= 0.25) score += 25;
  else if (connectorFailureRate > 0) score += 10;

  if (replayRate >= 0.2) score += 15;
  else if (replayRate > 0) score += 6;

  if (metrics.daysSinceActivity === null) score += 25;
  else if (metrics.daysSinceActivity > 14) score += 20;
  else if (metrics.daysSinceActivity > 7) score += 10;

  if (adoptionScore < 20) score += 20;
  else if (adoptionScore < 45) score += 10;

  score = Math.max(0, Math.min(100, score));
  const level = score >= 60 ? "high" : score >= 30 ? "medium" : "low";

  return {
    score,
    level,
    indicators: {
      ootRate: Number(ootRate.toFixed(4)),
      connectorFailureRate: Number(connectorFailureRate.toFixed(4)),
      replayRate: Number(replayRate.toFixed(4)),
      daysSinceActivity: metrics.daysSinceActivity
    }
  };
}

function toSiteValueScore({ deploymentScore, adoptionScore, renewalRiskScore }) {
  return roundPercent(
    deploymentScore * 0.35
      + adoptionScore * 0.4
      + (100 - renewalRiskScore) * 0.25
  );
}

export async function getPilotReadinessScorecard({
  dateFrom = null,
  dateTo = null,
  siteId = null,
  entitlements = null
} = {}) {
  const window = buildWindow({ dateFrom, dateTo });
  const { siteFilter, multisiteEnabled } = resolveSiteFilter({ siteId, entitlements });

  const params = [window.dateFrom, window.dateTo];
  let inspectionSiteClause = "";
  let connectorSiteClause = "";
  if (siteFilter) {
    params.push(siteFilter);
    inspectionSiteClause = ` AND site_id = $${params.length}`;
    connectorSiteClause = ` AND site_id = $${params.length}`;
  }

  const { rows } = await query(
    `WITH inspection AS (
       SELECT
         site_id,
         COUNT(DISTINCT job_id)::INT AS job_count,
         COUNT(DISTINCT operator_user_id)::INT AS operator_count,
         COUNT(DISTINCT COALESCE(work_center_id, 'unassigned'))::INT AS work_center_count,
         COUNT(DISTINCT (event_at AT TIME ZONE 'UTC')::DATE)::INT AS active_days,
         COALESCE(SUM(measurement_count), 0)::INT AS measurement_count,
         COALESCE(SUM(pass_count), 0)::INT AS pass_count,
         COALESCE(SUM(oot_count), 0)::INT AS oot_count,
         COALESCE(SUM(rework_count), 0)::INT AS correction_events,
         MAX(event_at) AS last_inspection_at
       FROM ana_mart_inspection_fact
       WHERE event_at >= $1 AND event_at <= $2${inspectionSiteClause}
       GROUP BY site_id
     ),
     connector AS (
       SELECT
         site_id,
         COUNT(DISTINCT connector_id)::INT AS connector_count,
         COALESCE(SUM(run_count), 0)::INT AS connector_runs,
         COALESCE(SUM(failure_count), 0)::INT AS connector_failures,
         COALESCE(SUM(replayed_count), 0)::INT AS connector_replays,
         COALESCE(SUM(processed_count), 0)::INT AS processed_count,
         MAX(run_ended_at) AS last_connector_at
       FROM ana_mart_connector_run_fact
       WHERE run_ended_at >= $1 AND run_ended_at <= $2${connectorSiteClause}
       GROUP BY site_id
     )
     SELECT
       COALESCE(i.site_id, c.site_id) AS site_id,
       COALESCE(i.job_count, 0) AS job_count,
       COALESCE(i.operator_count, 0) AS operator_count,
       COALESCE(i.work_center_count, 0) AS work_center_count,
       COALESCE(i.active_days, 0) AS active_days,
       COALESCE(i.measurement_count, 0) AS measurement_count,
       COALESCE(i.pass_count, 0) AS pass_count,
       COALESCE(i.oot_count, 0) AS oot_count,
       COALESCE(i.correction_events, 0) AS correction_events,
       COALESCE(c.connector_count, 0) AS connector_count,
       COALESCE(c.connector_runs, 0) AS connector_runs,
       COALESCE(c.connector_failures, 0) AS connector_failures,
       COALESCE(c.connector_replays, 0) AS connector_replays,
       COALESCE(c.processed_count, 0) AS processed_count,
       i.last_inspection_at,
       c.last_connector_at
     FROM inspection i
     FULL OUTER JOIN connector c ON c.site_id = i.site_id
     ORDER BY COALESCE(i.site_id, c.site_id) ASC`,
    params
  );

  const sites = rows.map((row) => {
    const lastActivityAt = row.last_inspection_at || row.last_connector_at || null;
    const daysSinceActivity = lastActivityAt
      ? Math.max(0, Math.floor((Date.now() - new Date(lastActivityAt).getTime()) / (1000 * 60 * 60 * 24)))
      : null;

    const metrics = {
      jobCount: Number(row.job_count || 0),
      operatorCount: Number(row.operator_count || 0),
      workCenterCount: Number(row.work_center_count || 0),
      activeDays: Number(row.active_days || 0),
      measurementCount: Number(row.measurement_count || 0),
      passCount: Number(row.pass_count || 0),
      ootCount: Number(row.oot_count || 0),
      correctionEvents: Number(row.correction_events || 0),
      connectorCount: Number(row.connector_count || 0),
      connectorRuns: Number(row.connector_runs || 0),
      connectorFailures: Number(row.connector_failures || 0),
      connectorReplays: Number(row.connector_replays || 0),
      processedCount: Number(row.processed_count || 0),
      lastActivityAt: lastActivityAt ? new Date(lastActivityAt).toISOString() : null,
      daysSinceActivity
    };

    const deploymentCompletion = scoreDeployment(metrics);
    const adoptionMilestone = scoreAdoption(metrics);
    const renewalRisk = scoreRenewalRisk(metrics, adoptionMilestone.score);
    const valueScore = toSiteValueScore({
      deploymentScore: deploymentCompletion.score,
      adoptionScore: adoptionMilestone.score,
      renewalRiskScore: renewalRisk.score
    });

    return {
      siteId: row.site_id,
      valueScore,
      deploymentCompletion,
      adoptionMilestone,
      renewalRisk,
      metrics
    };
  });

  return {
    contractId: CONTRACT_ID,
    dashboardId: "pilot_readiness_scorecard_v1",
    window,
    multisiteEnabled,
    siteScope: siteFilter || (multisiteEnabled ? "all" : DEFAULT_SITE_ID),
    sites
  };
}

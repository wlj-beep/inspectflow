import { query } from "../../db.js";
import {
  computeAllKpis,
  KPI_CONTRACT_VERSION,
  KPI_DEFINITIONS,
  validateKpiContracts
} from "./kpiContracts.js";
import {
  ANA_KPI_METRIC_KEYS,
  ANA_MART_CONTRACT_ID
} from "./anaV3Vocabulary.js";

const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_BREAKDOWN_LIMIT = 12;

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (Number.isInteger(n) && n > 0) return n;
  return fallback;
}

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
  if (!normalizedFrom && !normalizedTo) {
    return defaultWindow();
  }
  return {
    dateFrom: normalizedFrom || defaultWindow().dateFrom,
    dateTo: normalizedTo || new Date().toISOString()
  };
}

function buildMetricPayload({ inspectionRow, connectorRow }) {
  return {
    [ANA_KPI_METRIC_KEYS.PASS_PIECES]: Number(inspectionRow?.pass_pieces || 0),
    [ANA_KPI_METRIC_KEYS.TOTAL_PIECES]: Number(inspectionRow?.total_pieces || 0),
    [ANA_KPI_METRIC_KEYS.OOT_PIECES]: Number(inspectionRow?.oot_pieces || 0),
    [ANA_KPI_METRIC_KEYS.CORRECTION_EVENTS]: Number(inspectionRow?.correction_events || 0),
    [ANA_KPI_METRIC_KEYS.CONNECTOR_TOTAL_RUNS]: Number(connectorRow?.connector_total_runs || 0),
    [ANA_KPI_METRIC_KEYS.CONNECTOR_REPLAYED_RUNS]: Number(connectorRow?.connector_replayed_runs || 0),
    [ANA_KPI_METRIC_KEYS.CONNECTOR_FAILED_RUNS]: Number(connectorRow?.connector_failed_runs || 0)
  };
}

function normalizeDefinition(definition) {
  return {
    id: definition.id,
    label: definition.label,
    ownerRoles: definition.ownerRoles,
    sourceMarts: definition.sourceMarts,
    formula: definition.formula
  };
}

async function loadDashboardTotals(window, siteId) {
  const inspection = await query(
    `SELECT
       COALESCE(SUM(measurement_count), 0)::INT AS total_pieces,
       COALESCE(SUM(pass_count), 0)::INT AS pass_pieces,
       COALESCE(SUM(oot_count), 0)::INT AS oot_pieces,
       COALESCE(SUM(rework_count), 0)::INT AS correction_events
     FROM ana_mart_inspection_fact
     WHERE event_at >= $1 AND event_at <= $2
       AND site_id=$3`,
    [window.dateFrom, window.dateTo, siteId]
  );

  const connector = await query(
    `SELECT
       COALESCE(SUM(run_count), 0)::INT AS connector_total_runs,
       COALESCE(SUM(replayed_count), 0)::INT AS connector_replayed_runs,
       COALESCE(SUM(failure_count), 0)::INT AS connector_failed_runs
     FROM ana_mart_connector_run_fact
     WHERE run_ended_at >= $1 AND run_ended_at <= $2
       AND site_id=$3`,
    [window.dateFrom, window.dateTo, siteId]
  );

  return {
    inspection: inspection.rows[0] || {},
    connector: connector.rows[0] || {}
  };
}

async function loadWorkCenterBreakdown(window, limit, siteId) {
  const { rows } = await query(
    `SELECT
       COALESCE(work_center_id, 'unassigned') AS work_center_id,
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
    const metrics = buildMetricPayload({ inspectionRow: row, connectorRow: {} });
    return {
      workCenterId: row.work_center_id,
      metrics,
      kpis: computeAllKpis(metrics)
    };
  });
}

async function loadOperatorBreakdown(window, limit, siteId) {
  const { rows } = await query(
    `SELECT
       amif.operator_user_id,
       COALESCE(u.name, 'Unknown') AS operator_name,
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
    const metrics = buildMetricPayload({ inspectionRow: row, connectorRow: {} });
    return {
      operatorUserId: row.operator_user_id ? Number(row.operator_user_id) : null,
      operatorName: row.operator_name,
      metrics,
      kpis: computeAllKpis(metrics)
    };
  });
}

async function loadDailyTrend(window, limit, siteId) {
  const inspectionRes = await query(
    `SELECT
       (event_at AT TIME ZONE 'UTC')::DATE::TEXT AS day,
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

  const connectorRes = await query(
    `SELECT
       (run_ended_at AT TIME ZONE 'UTC')::DATE::TEXT AS day,
       COALESCE(SUM(run_count), 0)::INT AS connector_total_runs,
       COALESCE(SUM(replayed_count), 0)::INT AS connector_replayed_runs,
       COALESCE(SUM(failure_count), 0)::INT AS connector_failed_runs
     FROM ana_mart_connector_run_fact
     WHERE run_ended_at >= $1 AND run_ended_at <= $2
       AND site_id=$3
     GROUP BY (run_ended_at AT TIME ZONE 'UTC')::DATE
     ORDER BY day DESC
     LIMIT $4`,
    [window.dateFrom, window.dateTo, siteId, limit]
  );

  const merged = new Map();
  for (const row of inspectionRes.rows) {
    merged.set(row.day, { day: row.day, inspection: row, connector: {} });
  }
  for (const row of connectorRes.rows) {
    const current = merged.get(row.day) || { day: row.day, inspection: {}, connector: {} };
    current.connector = row;
    merged.set(row.day, current);
  }

  return Array.from(merged.values())
    .sort((left, right) => String(left.day).localeCompare(String(right.day)))
    .map((item) => {
      const metrics = buildMetricPayload({
        inspectionRow: item.inspection,
        connectorRow: item.connector
      });
      return {
        day: item.day,
        metrics,
        kpis: computeAllKpis(metrics)
      };
    });
}

export function listKpiDashboardDefinitions() {
  const validation = validateKpiContracts(KPI_DEFINITIONS);
  if (!validation.ok) {
    throw new Error(`invalid_kpi_contracts:${validation.errors.join(",")}`);
  }
  return {
    contractId: KPI_CONTRACT_VERSION,
    martContractId: ANA_MART_CONTRACT_ID,
    definitions: KPI_DEFINITIONS.map((definition) => normalizeDefinition(definition))
  };
}

export async function getKpiDashboard({
  dateFrom = null,
  dateTo = null,
  limit = DEFAULT_BREAKDOWN_LIMIT,
  siteId = "default"
} = {}) {
  const validation = validateKpiContracts(KPI_DEFINITIONS);
  if (!validation.ok) {
    throw new Error(`invalid_kpi_contracts:${validation.errors.join(",")}`);
  }

  const window = buildWindow({ dateFrom, dateTo });
  const safeLimit = toPositiveInt(limit, DEFAULT_BREAKDOWN_LIMIT);
  const totals = await loadDashboardTotals(window, siteId);
  const metrics = buildMetricPayload({
    inspectionRow: totals.inspection,
    connectorRow: totals.connector
  });

  const [workCenters, operators, dailyTrend] = await Promise.all([
    loadWorkCenterBreakdown(window, safeLimit, siteId),
    loadOperatorBreakdown(window, safeLimit, siteId),
    loadDailyTrend(window, Math.max(safeLimit, 30), siteId)
  ]);

  return {
    contractId: KPI_CONTRACT_VERSION,
    dashboardId: "operator_supervisor_kpi_v1",
    siteId,
    martContractId: ANA_MART_CONTRACT_ID,
    window,
    definitions: KPI_DEFINITIONS.map((definition) => normalizeDefinition(definition)),
    metrics,
    kpis: computeAllKpis(metrics),
    breakdowns: {
      byWorkCenter: workCenters,
      byOperator: operators,
      dailyTrend
    }
  };
}

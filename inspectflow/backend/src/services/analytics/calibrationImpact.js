import {
  analyticsQuery,
  withAnalyticsStatementTimeout
} from "./statementTimeout.js";
import {
  buildRiskEventEnvelope,
  evaluateAnomalyRule
} from "../../future/analytics/anomalyRules.js";
import {
  createEscalationRecord,
  validateEscalationRecord
} from "../../future/quality/riskEscalation.js";
import { normalizeIsoTimestamp } from "../dateValidation.js";

const DEFAULT_LIMIT = 200;
const DEFAULT_RISK_RULE = Object.freeze({
  id: "tool-calibration-impact-correlation",
  name: "Tool calibration impact correlation",
  severity: "high",
  match: "all",
  when: [
    { metric: "measurementVolume", op: "gte", value: 2 },
    { metric: "overdueMeasurementVolume", op: "gte", value: 1 },
    { metric: "overdueOotRate", op: "gt", value: 0.25 },
    { metric: "ootRateDelta", op: "gt", value: 0.2 }
  ]
});

function toPositiveInt(value, fallback = null) {
  const n = Number(value);
  if (Number.isInteger(n) && n > 0) return n;
  return fallback;
}

function rate(numerator, denominator) {
  const n = Number(numerator || 0);
  const d = Number(denominator || 0);
  if (d <= 0) return null;
  return Math.round((n / d) * 10000) / 10000;
}

function normalizeStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["open", "acknowledged", "resolved"].includes(normalized)) return normalized;
  return "open";
}

function toTextOrNull(value, max = 500) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, max) : null;
}

function buildIssueDetailsFromRiskRow(row) {
  const event = row?.event_envelope || {};
  const escalation = row?.escalation_record || {};
  const traceLinks = Array.isArray(escalation?.evidence?.traceLinks) ? escalation.evidence.traceLinks : [];
  const traceSummary = traceLinks
    .map((link) => `${String(link?.type || "trace").trim()}:${String(link?.ref || "").trim()}`)
    .filter(Boolean)
    .slice(0, 12)
    .join(", ");

  const ruleId = String(event?.rule?.id || row?.context?.ruleId || "unknown_rule");
  const severity = String(event?.rule?.severity || row?.severity || "medium");
  const dedupeKey = String(row?.dedupe_key || event?.dedupeKey || "");

  return [
    `Risk escalation from ANA-RISK-v3`,
    `rule=${ruleId}`,
    `severity=${severity}`,
    dedupeKey ? `dedupe=${dedupeKey}` : null,
    traceSummary ? `trace=${traceSummary}` : null
  ].filter(Boolean).join(" | ");
}

function buildWindowFilter({ dateFrom, dateTo, siteId = "default" }, alias = "amif") {
  const filters = [];
  const params = [];
  params.push(siteId);
  filters.push(`${alias}.site_id = $${params.length}`);
  if (dateFrom) {
    params.push(dateFrom);
    filters.push(`${alias}.event_at >= $${params.length}`);
  }
  if (dateTo) {
    params.push(dateTo);
    filters.push(`${alias}.event_at <= $${params.length}`);
  }
  return {
    where: filters.length ? `WHERE ${filters.join(" AND ")}` : "",
    params
  };
}

async function loadMachinePerformance({ dateFrom, dateTo, siteId }) {
  const { where, params } = buildWindowFilter({ dateFrom, dateTo, siteId }, "amif");
  const { rows } = await analyticsQuery(
    `SELECT
       COALESCE(amif.work_center_id, 'unassigned') AS work_center_id,
       COUNT(*)::INT AS measurement_count,
       SUM(amif.oot_count)::INT AS oot_count,
       SUM(amif.pass_count)::INT AS pass_count,
       SUM(amif.rework_count)::INT AS rework_count,
       MIN(amif.event_at) AS first_event_at,
       MAX(amif.event_at) AS last_event_at
     FROM ana_mart_inspection_fact amif
     ${where}
     GROUP BY COALESCE(amif.work_center_id, 'unassigned')
     ORDER BY measurement_count DESC, work_center_id ASC`,
    params
  );

  return rows.map((row) => {
    const measurementCount = Number(row.measurement_count || 0);
    const ootCount = Number(row.oot_count || 0);
    const passCount = Number(row.pass_count || 0);
    const reworkCount = Number(row.rework_count || 0);
    return {
      workCenterId: row.work_center_id,
      measurementCount,
      ootCount,
      passCount,
      reworkCount,
      ootRate: rate(ootCount, measurementCount),
      reworkRate: rate(reworkCount, measurementCount),
      firstEventAt: row.first_event_at,
      lastEventAt: row.last_event_at
    };
  });
}

async function loadToolPerformance({ dateFrom, dateTo, limit, siteId }) {
  const safeLimit = toPositiveInt(limit, DEFAULT_LIMIT);
  const { where, params } = buildWindowFilter({ dateFrom, dateTo, siteId }, "amif");
  params.push(safeLimit);

  const { rows } = await analyticsQuery(
    `SELECT
       t.id AS tool_id,
       t.name AS tool_name,
       t.it_num AS tool_it_num,
       t.calibration_due_date,
       COALESCE(amif.work_center_id, 'unassigned') AS work_center_id,
       COUNT(*)::INT AS measurement_count,
       SUM(amif.oot_count)::INT AS oot_count,
       SUM(amif.pass_count)::INT AS pass_count,
       SUM(amif.rework_count)::INT AS rework_count,
       SUM(CASE WHEN t.calibration_due_date IS NOT NULL AND t.calibration_due_date < (amif.event_at AT TIME ZONE 'UTC')::DATE THEN 1 ELSE 0 END)::INT AS overdue_measurement_count,
       SUM(CASE WHEN t.calibration_due_date IS NOT NULL AND t.calibration_due_date < (amif.event_at AT TIME ZONE 'UTC')::DATE THEN amif.oot_count ELSE 0 END)::INT AS overdue_oot_count,
       SUM(CASE WHEN t.calibration_due_date IS NULL OR t.calibration_due_date >= (amif.event_at AT TIME ZONE 'UTC')::DATE THEN 1 ELSE 0 END)::INT AS ontime_measurement_count,
       SUM(CASE WHEN t.calibration_due_date IS NULL OR t.calibration_due_date >= (amif.event_at AT TIME ZONE 'UTC')::DATE THEN amif.oot_count ELSE 0 END)::INT AS ontime_oot_count,
       (ARRAY_AGG(amif.job_id ORDER BY amif.event_at DESC))[1] AS sample_job_id,
       (ARRAY_AGG(amif.part_id ORDER BY amif.event_at DESC))[1] AS sample_part_id,
       (ARRAY_AGG(amif.lot ORDER BY amif.event_at DESC))[1] AS sample_lot,
       (ARRAY_AGG(amif.record_id ORDER BY amif.event_at DESC))[1] AS sample_record_id,
       (ARRAY_AGG(amif.piece_number ORDER BY amif.event_at DESC))[1] AS sample_piece_number,
       MAX(amif.event_at) AS last_event_at
     FROM ana_mart_inspection_fact amif
     JOIN record_tools rt
       ON rt.record_id=amif.record_id
      AND rt.dimension_id=amif.dimension_id
     JOIN tools t ON t.id=rt.tool_id
     ${where}
     GROUP BY t.id, t.name, t.it_num, t.calibration_due_date, COALESCE(amif.work_center_id, 'unassigned')
     ORDER BY measurement_count DESC, tool_id ASC
     LIMIT $${params.length}`,
    params
  );

  return rows.map((row) => {
    const measurementCount = Number(row.measurement_count || 0);
    const ootCount = Number(row.oot_count || 0);
    const passCount = Number(row.pass_count || 0);
    const reworkCount = Number(row.rework_count || 0);
    const overdueMeasurementCount = Number(row.overdue_measurement_count || 0);
    const overdueOotCount = Number(row.overdue_oot_count || 0);
    const ontimeMeasurementCount = Number(row.ontime_measurement_count || 0);
    const ontimeOotCount = Number(row.ontime_oot_count || 0);
    const overdueOotRate = rate(overdueOotCount, overdueMeasurementCount);
    const ontimeOotRate = rate(ontimeOotCount, ontimeMeasurementCount);
    const ootRateDelta = overdueOotRate === null || ontimeOotRate === null
      ? null
      : Math.round((overdueOotRate - ontimeOotRate) * 10000) / 10000;

    return {
      toolId: Number(row.tool_id),
      toolName: row.tool_name,
      toolItNum: row.tool_it_num,
      calibrationDueDate: row.calibration_due_date,
      workCenterId: row.work_center_id,
      measurementCount,
      ootCount,
      passCount,
      reworkCount,
      ootRate: rate(ootCount, measurementCount),
      reworkRate: rate(reworkCount, measurementCount),
      overdueMeasurementCount,
      overdueOotCount,
      overdueOotRate,
      ontimeMeasurementCount,
      ontimeOotCount,
      ontimeOotRate,
      ootRateDelta,
      overdueShare: rate(overdueMeasurementCount, measurementCount),
      sample: {
        jobId: row.sample_job_id || null,
        partId: row.sample_part_id || null,
        lot: row.sample_lot || null,
        recordId: row.sample_record_id ? Number(row.sample_record_id) : null,
        pieceId: row.sample_record_id && row.sample_piece_number
          ? `${row.sample_record_id}:${row.sample_piece_number}`
          : null
      },
      lastEventAt: row.last_event_at
    };
  });
}

function buildRiskInputs(toolItem) {
  const metrics = {
    measurementVolume: Number(toolItem.measurementCount || 0),
    overdueMeasurementVolume: Number(toolItem.overdueMeasurementCount || 0),
    overdueOotRate: Number(toolItem.overdueOotRate || 0),
    ootRateDelta: Number(toolItem.ootRateDelta || 0)
  };
  const context = {
    toolId: toolItem.toolId,
    toolName: toolItem.toolName,
    toolItNum: toolItem.toolItNum,
    workCenterId: toolItem.workCenterId,
    calibrationDueDate: toolItem.calibrationDueDate,
    metrics: {
      measurementCount: toolItem.measurementCount,
      ootCount: toolItem.ootCount,
      overdueMeasurementCount: toolItem.overdueMeasurementCount,
      overdueOotCount: toolItem.overdueOotCount,
      ontimeMeasurementCount: toolItem.ontimeMeasurementCount,
      ontimeOotCount: toolItem.ontimeOotCount,
      ootRate: toolItem.ootRate,
      overdueOotRate: toolItem.overdueOotRate,
      ontimeOotRate: toolItem.ontimeOotRate,
      ootRateDelta: toolItem.ootRateDelta
    }
  };
  return { metrics, context };
}

function buildSubject(toolItem) {
  return {
    toolId: String(toolItem.toolId),
    toolItNum: toolItem.toolItNum,
    workCenterId: toolItem.workCenterId === "unassigned" ? null : toolItem.workCenterId,
    jobId: toolItem.sample?.jobId || null,
    partId: toolItem.sample?.partId || null,
    lot: toolItem.sample?.lot || null,
    recordId: toolItem.sample?.recordId ? String(toolItem.sample.recordId) : null,
    pieceId: toolItem.sample?.pieceId || null
  };
}

function buildCalibrationRiskPreview(toolPerformance) {
  const triggered = [];

  for (const item of toolPerformance) {
    const { metrics, context } = buildRiskInputs(item);
    const evaluation = evaluateAnomalyRule(DEFAULT_RISK_RULE, metrics, context);
    if (!evaluation.triggered) continue;

    const event = buildRiskEventEnvelope(evaluation, {
      subject: buildSubject(item)
    });
    const escalation = createEscalationRecord({
      eventEnvelope: event,
      traceContext: {
        generatedBy: "analytics.calibration_impact",
        generatedAt: new Date().toISOString(),
        tool: {
          id: item.toolId,
          name: item.toolName,
          itNum: item.toolItNum,
          workCenterId: item.workCenterId
        },
        metrics: context.metrics
      }
    });
    const validation = validateEscalationRecord(escalation);
    if (!validation.ok) continue;

    triggered.push({
      event,
      escalation
    });
  }

  return {
    ruleId: DEFAULT_RISK_RULE.id,
    triggeredCount: triggered.length,
    events: triggered.map((item) => item.event),
    escalations: triggered.map((item) => item.escalation)
  };
}

async function persistRiskPreview(preview) {
  const events = Array.isArray(preview?.events) ? preview.events : [];
  const escalations = Array.isArray(preview?.escalations) ? preview.escalations : [];
  if (!events.length || events.length !== escalations.length) {
    return { persisted: 0, updated: 0 };
  }

  let persisted = 0;
  let updated = 0;
  await withAnalyticsStatementTimeout(async (client) => {
    for (let i = 0; i < events.length; i += 1) {
      const event = events[i];
      const escalation = escalations[i];
      const upsertRes = await client.query(
        `INSERT INTO ana_risk_event_log
           (dedupe_key, contract_id, source, severity, status, event_envelope, escalation_record, context)
         VALUES ($1,$2,$3,$4,'open',$5,$6,$7)
         ON CONFLICT (dedupe_key) DO UPDATE
           SET severity=EXCLUDED.severity,
               status='open',
               event_envelope=EXCLUDED.event_envelope,
               escalation_record=EXCLUDED.escalation_record,
               context=EXCLUDED.context,
               acknowledged_by_role=NULL,
               acknowledged_by_user_id=NULL,
               acknowledgement_note=NULL,
               acknowledged_at=NULL,
               resolved_by_role=NULL,
               resolved_by_user_id=NULL,
               resolution_note=NULL,
               resolved_at=NULL,
               last_seen_at=NOW(),
               hit_count=ana_risk_event_log.hit_count + 1,
               updated_at=NOW()
         RETURNING (xmax = 0) AS inserted`,
        [
          event.dedupeKey,
          event.contractId,
          "analytics.calibration_impact",
          event?.rule?.severity || "medium",
          event,
          escalation,
          {
            ruleId: event?.rule?.id || null,
            eventType: event?.eventType || null
          }
        ]
      );

      if (upsertRes.rows[0]?.inserted) persisted += 1;
      else updated += 1;
    }
  });

  return { persisted, updated };
}

function summarizeMachinePerformance(machinePerformance, toolPerformance) {
  const totalMeasurements = machinePerformance.reduce((sum, row) => sum + Number(row.measurementCount || 0), 0);
  const totalOot = machinePerformance.reduce((sum, row) => sum + Number(row.ootCount || 0), 0);
  const overdueMeasurements = toolPerformance.reduce((sum, row) => sum + Number(row.overdueMeasurementCount || 0), 0);
  return {
    totalMeasurements,
    totalOot,
    overallOotRate: rate(totalOot, totalMeasurements),
    overdueMeasurements,
    machineCount: machinePerformance.length,
    toolCount: toolPerformance.length
  };
}

export async function getCalibrationImpactAnalytics({
  dateFrom = null,
  dateTo = null,
  limit = DEFAULT_LIMIT,
  siteId = "default"
} = {}) {
  const normalizedDateFrom = normalizeIsoTimestamp(dateFrom, "date_from");
  const normalizedDateTo = normalizeIsoTimestamp(dateTo, "date_to");
  const machinePerformance = await loadMachinePerformance({
    dateFrom: normalizedDateFrom,
    dateTo: normalizedDateTo,
    siteId
  });
  const toolPerformance = await loadToolPerformance({
    dateFrom: normalizedDateFrom,
    dateTo: normalizedDateTo,
    limit,
    siteId
  });
  const riskPreview = buildCalibrationRiskPreview(toolPerformance);

  return {
    contractId: "ANA-KPI-v3",
    capabilityId: "BL-041-calibration-impact-v1",
    window: {
      dateFrom: normalizedDateFrom,
      dateTo: normalizedDateTo,
      siteId
    },
    summary: summarizeMachinePerformance(machinePerformance, toolPerformance),
    machinePerformance,
    toolPerformance,
    riskIntegration: {
      contractId: "ANA-RISK-v3",
      ...riskPreview,
      persistence: { persisted: 0, updated: 0 }
    }
  };
}

export async function refreshCalibrationImpactAnalytics(options = {}) {
  const result = await getCalibrationImpactAnalytics(options);
  const persistence = await persistRiskPreview(result.riskIntegration);
  return {
    ...result,
    riskIntegration: {
      ...result.riskIntegration,
      persistence
    }
  };
}

export async function listCalibrationRiskEvents({ status = "open", limit = 100 } = {}) {
  const normalizedStatus = normalizeStatus(status);
  const safeLimit = toPositiveInt(limit, 100);
  const { rows } = await analyticsQuery(
    `SELECT id, dedupe_key, contract_id, source, severity, status, event_envelope,
            escalation_record, context, hit_count, first_seen_at, last_seen_at,
            acknowledged_by_role, acknowledged_by_user_id, acknowledgement_note, acknowledged_at,
            linked_issue_id,
            resolved_by_role, resolved_by_user_id, resolution_note, resolved_at,
            created_at, updated_at
     FROM ana_risk_event_log
     WHERE status=$1
     ORDER BY last_seen_at DESC, id DESC
     LIMIT $2`,
    [normalizedStatus, safeLimit]
  );
  return rows;
}

export async function acknowledgeCalibrationRiskEvent({
  eventId,
  acknowledgedByRole = null,
  acknowledgedByUserId = null,
  acknowledgementNote = null
} = {}) {
  const id = toPositiveInt(eventId);
  if (!id) {
    throw new Error("invalid_event_id");
  }

  const { rows } = await analyticsQuery(
    `UPDATE ana_risk_event_log
     SET status='acknowledged',
         acknowledged_by_role=$2,
         acknowledged_by_user_id=$3,
         acknowledgement_note=$4,
         acknowledged_at=NOW(),
         updated_at=NOW()
     WHERE id=$1 AND status!='resolved'
     RETURNING id, status, acknowledged_at, linked_issue_id`,
    [
      id,
      toTextOrNull(acknowledgedByRole, 40),
      toPositiveInt(acknowledgedByUserId),
      toTextOrNull(acknowledgementNote, 500)
    ]
  );

  return rows[0] || null;
}

export async function escalateCalibrationRiskEventToIssue({
  eventId,
  submittedByRole = null,
  submittedByUserId = null,
  detailsOverride = null
} = {}) {
  const id = toPositiveInt(eventId);
  if (!id) {
    throw new Error("invalid_event_id");
  }
  const actorId = toPositiveInt(submittedByUserId);
  if (!actorId) {
    throw new Error("submitted_by_user_required");
  }

  return withAnalyticsStatementTimeout(async (client) => {
    const riskRes = await client.query(
      `SELECT id,
              status,
              linked_issue_id,
              event_envelope,
              escalation_record,
              context,
              severity,
              dedupe_key,
              acknowledged_by_role,
              acknowledged_by_user_id,
              acknowledged_at
       FROM ana_risk_event_log
       WHERE id=$1
       LIMIT 1`,
      [id]
    );
    const row = riskRes.rows[0];
    if (!row) return null;

    const linkedIssueId = toPositiveInt(row.linked_issue_id);
    if (linkedIssueId) {
      return { id, status: row.status, issueId: linkedIssueId, alreadyLinked: true };
    }

    const event = row.event_envelope || {};
    const subject = event.subject || {};
    const recordId = toPositiveInt(subject.recordId);
    const details = toTextOrNull(detailsOverride, 2000) || buildIssueDetailsFromRiskRow(row);

    const issueRes = await client.query(
      `INSERT INTO issue_reports
         (category, details, status, part_id, operation_id, dimension_id, job_id, record_id, submitted_by_user_id, submitted_by_role)
       VALUES ('tolerance_issue',$1,'open',$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, status`,
      [
        details,
        toTextOrNull(subject.partId, 120),
        toPositiveInt(subject.operationId),
        toPositiveInt(subject.dimensionId),
        toTextOrNull(subject.jobId, 120),
        recordId,
        actorId,
        toTextOrNull(submittedByRole, 40) || "Admin"
      ]
    );
    const issue = issueRes.rows[0];

    const updatedRisk = await client.query(
      `UPDATE ana_risk_event_log
       SET status='acknowledged',
           linked_issue_id=$2,
           acknowledged_by_role=COALESCE(acknowledged_by_role, $3),
           acknowledged_by_user_id=COALESCE(acknowledged_by_user_id, $4),
           acknowledged_at=COALESCE(acknowledged_at, NOW()),
           updated_at=NOW()
       WHERE id=$1
       RETURNING id, status, linked_issue_id`,
      [
        id,
        issue.id,
        toTextOrNull(submittedByRole, 40),
        actorId
      ]
    );

    return {
      id: updatedRisk.rows[0]?.id || id,
      status: updatedRisk.rows[0]?.status || "acknowledged",
      issueId: Number(updatedRisk.rows[0]?.linked_issue_id || issue.id),
      alreadyLinked: false
    };
  });
}

export async function resolveCalibrationRiskEvent({
  eventId,
  resolvedByRole = null,
  resolvedByUserId = null,
  resolutionNote = null
} = {}) {
  const id = toPositiveInt(eventId);
  if (!id) {
    throw new Error("invalid_event_id");
  }

  const { rows } = await analyticsQuery(
    `UPDATE ana_risk_event_log
     SET status='resolved',
         resolved_by_role=$2,
         resolved_by_user_id=$3,
         resolution_note=$4,
         resolved_at=NOW(),
         updated_at=NOW()
     WHERE id=$1 AND status!='resolved'
     RETURNING id, status, resolved_at`,
    [
      id,
      resolvedByRole ? String(resolvedByRole).slice(0, 40) : null,
      toPositiveInt(resolvedByUserId),
      resolutionNote ? String(resolutionNote).slice(0, 500) : null
    ]
  );

  return rows[0] || null;
}

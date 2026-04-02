import { query, transaction } from "../../db.js";
import {
  buildRiskEventEnvelope,
  evaluateAnomalyRule
} from "../../future/analytics/anomalyRules.js";
import {
  createEscalationRecord,
  validateEscalationRecord
} from "../../future/quality/riskEscalation.js";

const DEFAULT_LIMIT = 200;
const CALIBRATION_IMPACT_FOUNDATION_CONTRACT_ID = "ANA-KPI-v3";
const MEASUREMENT_SYSTEM_CONTRACT_ID = "ANA-MSA-v1";
const OPERATOR_REMEDIATION_VIEW_ID = "operator_safe_remediation_v1";
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

function toOptionalIso(value, fieldName) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`invalid_${fieldName}`);
  }
  return date.toISOString();
}

function rate(numerator, denominator) {
  const n = Number(numerator || 0);
  const d = Number(denominator || 0);
  if (d <= 0) return null;
  return Math.round((n / d) * 10000) / 10000;
}

function roundPercent(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value || 0))));
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

function buildWindowFilter({ dateFrom, dateTo }, alias = "amif") {
  const filters = [];
  const params = [];
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

async function loadMachinePerformance({ dateFrom, dateTo }) {
  const { where, params } = buildWindowFilter({ dateFrom, dateTo }, "amif");
  const { rows } = await query(
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

async function loadToolPerformance({ dateFrom, dateTo, limit }) {
  const safeLimit = toPositiveInt(limit, DEFAULT_LIMIT);
  const { where, params } = buildWindowFilter({ dateFrom, dateTo }, "amif");
  params.push(safeLimit);

  const { rows } = await query(
    `SELECT
       t.id AS tool_id,
       t.name AS tool_name,
       t.it_num AS tool_it_num,
       t.calibration_due_date,
       COALESCE((ARRAY_AGG(COALESCE(amif.work_center_id, 'unassigned') ORDER BY amif.event_at DESC))[1], 'unassigned') AS work_center_id,
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
     GROUP BY t.id, t.name, t.it_num, t.calibration_due_date
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
  await transaction(async (client) => {
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

function buildToolHealth(toolItem) {
  const overdueMeasurements = Number(toolItem.overdueMeasurementCount || 0);
  const measurementCount = Number(toolItem.measurementCount || 0);
  const overdueOotRate = Number(toolItem.overdueOotRate || 0);
  const ootRateDelta = Number(toolItem.ootRateDelta || 0);
  const reworkRate = Number(toolItem.reworkRate || 0);

  const calibrationState = !toolItem.calibrationDueDate
    ? "untracked"
    : overdueMeasurements > 0
      ? "overdue"
      : "in_calibration";

  let impactScore = 0;
  if (calibrationState === "overdue") impactScore += 35;
  else if (calibrationState === "untracked") impactScore += 20;
  if (overdueMeasurements > 0) impactScore += 10;
  if (overdueOotRate >= 0.25) impactScore += 25;
  else if (overdueOotRate >= 0.1) impactScore += 15;
  if (ootRateDelta > 0.2) impactScore += 20;
  else if (ootRateDelta > 0.05) impactScore += 10;
  if (reworkRate > 0.1) impactScore += 10;
  if (measurementCount >= 5) impactScore += 5;
  impactScore = roundPercent(impactScore);

  const defectRiskBand = impactScore >= 60 ? "high" : impactScore >= 30 ? "medium" : "low";
  const correlationStatus = overdueMeasurements > 0 && ootRateDelta > 0
    ? "degrades_quality"
    : overdueMeasurements > 0
      ? "under_observation"
      : "stable";

  return {
    calibrationState,
    defectRiskBand,
    impactScore,
    correlationStatus
  };
}

function withToolHealth(toolPerformance) {
  return toolPerformance.map((toolItem) => ({
    ...toolItem,
    toolHealth: buildToolHealth(toolItem)
  }));
}

function buildMeasurementSystemSummary(toolPerformance, riskPreview) {
  const totals = toolPerformance.reduce((acc, item) => {
    acc.measurementCount += Number(item.measurementCount || 0);
    acc.overdueMeasurementCount += Number(item.overdueMeasurementCount || 0);
    acc.ontimeMeasurementCount += Number(item.ontimeMeasurementCount || 0);
    acc.overdueOotCount += Number(item.overdueOotCount || 0);
    acc.ontimeOotCount += Number(item.ontimeOotCount || 0);
    if (item.toolHealth.calibrationState === "overdue") acc.overdueToolCount += 1;
    if (item.toolHealth.calibrationState === "untracked") acc.untrackedToolCount += 1;
    if (item.overdueOotRate !== null && item.ontimeOotRate !== null) acc.correlatedToolCount += 1;
    acc.riskBandCounts[item.toolHealth.defectRiskBand] += 1;
    return acc;
  }, {
    measurementCount: 0,
    overdueMeasurementCount: 0,
    ontimeMeasurementCount: 0,
    overdueOotCount: 0,
    ontimeOotCount: 0,
    overdueToolCount: 0,
    untrackedToolCount: 0,
    correlatedToolCount: 0,
    riskBandCounts: { low: 0, medium: 0, high: 0 }
  });

  const overdueOotRate = rate(totals.overdueOotCount, totals.overdueMeasurementCount);
  const ontimeOotRate = rate(totals.ontimeOotCount, totals.ontimeMeasurementCount);
  const ootRateDelta = overdueOotRate === null || ontimeOotRate === null
    ? null
    : Math.round((overdueOotRate - ontimeOotRate) * 10000) / 10000;

  return {
    contractId: MEASUREMENT_SYSTEM_CONTRACT_ID,
    correlatedToolCount: totals.correlatedToolCount,
    triggeredToolCount: Number(riskPreview?.triggeredCount || 0),
    overdueToolCount: totals.overdueToolCount,
    untrackedToolCount: totals.untrackedToolCount,
    overdueMeasurementShare: rate(totals.overdueMeasurementCount, totals.measurementCount),
    overdueOotRate,
    ontimeOotRate,
    ootRateDelta,
    toolHealthCounts: {
      inCalibration: Math.max(0, toolPerformance.length - totals.overdueToolCount - totals.untrackedToolCount),
      overdue: totals.overdueToolCount,
      untracked: totals.untrackedToolCount
    },
    defectRiskCounts: totals.riskBandCounts
  };
}

function buildOperatorSafeActions(toolItem) {
  const actionMap = new Map();
  const addAction = (code, label) => {
    if (!actionMap.has(code)) {
      actionMap.set(code, {
        code,
        label,
        actorRole: "Operator",
        safe: true
      });
    }
  };

  if (toolItem.toolHealth.calibrationState === "overdue") {
    addAction("hold_tool_use", "Stop using this tool for new measurements until calibration is reviewed.");
    addAction("tag_tool_for_review", "Tag the tool and notify supervision or quality for calibration follow-up.");
  }
  if (toolItem.toolHealth.defectRiskBand !== "low") {
    addAction("verify_with_alternate_tool", "Recheck the next measurement with an in-calibration alternate tool.");
    addAction("notify_supervisor", "Notify supervision before continuing if results remain unstable.");
  }
  if (toolItem.sample?.recordId) {
    addAction("review_last_record", "Review the latest affected record before continuing work.");
  }

  return Array.from(actionMap.values()).slice(0, 4);
}

function buildRemediationReasonSummary(toolItem) {
  const reasons = [];
  if (Number(toolItem.overdueMeasurementCount || 0) > 0) {
    reasons.push(`${toolItem.overdueMeasurementCount} measurements were captured after the calibration due date`);
  }
  if (toolItem.ootRateDelta !== null && Number(toolItem.ootRateDelta) > 0) {
    reasons.push(`OOT rate increased by ${Math.round(Number(toolItem.ootRateDelta) * 100)} points after the due date`);
  }
  if (Number(toolItem.reworkCount || 0) > 0) {
    reasons.push(`${toolItem.reworkCount} rework events were linked to this tool`);
  }
  if (reasons.length === 0) {
    reasons.push("Tool health needs confirmation before additional measurements are taken");
  }
  return reasons.join("; ");
}

function buildCalibrationRemediationView(toolPerformance, riskPreview) {
  const eventByToolId = new Map(
    (Array.isArray(riskPreview?.events) ? riskPreview.events : [])
      .map((event) => [String(event?.subject?.toolId || ""), event])
      .filter(([toolId]) => toolId)
  );

  const items = toolPerformance
    .filter((item) => item.toolHealth.calibrationState !== "in_calibration" || item.toolHealth.defectRiskBand !== "low")
    .map((item) => {
      const linkedRiskEvent = eventByToolId.get(String(item.toolId));
      return {
        toolId: item.toolId,
        toolName: item.toolName,
        toolItNum: item.toolItNum,
        workCenterId: item.workCenterId,
        calibrationState: item.toolHealth.calibrationState,
        defectRiskBand: item.toolHealth.defectRiskBand,
        impactScore: item.toolHealth.impactScore,
        actionPriority: item.toolHealth.defectRiskBand === "high" ? "urgent" : "review",
        reasonSummary: buildRemediationReasonSummary(item),
        recommendedActions: buildOperatorSafeActions(item),
        reference: {
          jobId: item.sample?.jobId || null,
          partId: item.sample?.partId || null,
          lot: item.sample?.lot || null,
          recordId: item.sample?.recordId || null,
          pieceId: item.sample?.pieceId || null
        },
        linkedRiskEvent: linkedRiskEvent
          ? {
              dedupeKey: linkedRiskEvent.dedupeKey,
              severity: linkedRiskEvent?.rule?.severity || "medium"
            }
          : null
      };
    })
    .sort((left, right) => {
      const priorityScore = { urgent: 2, review: 1 };
      return (
        (priorityScore[right.actionPriority] || 0) - (priorityScore[left.actionPriority] || 0)
        || right.impactScore - left.impactScore
        || right.toolId - left.toolId
      );
    });

  return {
    contractId: MEASUREMENT_SYSTEM_CONTRACT_ID,
    viewId: OPERATOR_REMEDIATION_VIEW_ID,
    summary: {
      itemCount: items.length,
      urgentCount: items.filter((item) => item.actionPriority === "urgent").length,
      overdueToolCount: items.filter((item) => item.calibrationState === "overdue").length
    },
    restrictions: [
      "This view does not recalibrate tools or close risk events.",
      "Operators can pause tool use, verify with an alternate tool, and notify supervision or quality."
    ],
    items
  };
}

async function buildCalibrationImpactAnalytics({
  dateFrom = null,
  dateTo = null,
  limit = DEFAULT_LIMIT
} = {}) {
  const normalizedDateFrom = toOptionalIso(dateFrom, "date_from");
  const normalizedDateTo = toOptionalIso(dateTo, "date_to");
  const machinePerformance = await loadMachinePerformance({
    dateFrom: normalizedDateFrom,
    dateTo: normalizedDateTo
  });
  const toolPerformance = await loadToolPerformance({
    dateFrom: normalizedDateFrom,
    dateTo: normalizedDateTo,
    limit
  });
  const toolPerformanceWithHealth = withToolHealth(toolPerformance);
  const riskPreview = buildCalibrationRiskPreview(toolPerformanceWithHealth);
  const measurementSystemSummary = buildMeasurementSystemSummary(toolPerformanceWithHealth, riskPreview);
  const remediationView = buildCalibrationRemediationView(toolPerformanceWithHealth, riskPreview);

  return {
    contractId: MEASUREMENT_SYSTEM_CONTRACT_ID,
    foundationContractId: CALIBRATION_IMPACT_FOUNDATION_CONTRACT_ID,
    capabilityId: "BL-100-measurement-system-calibration-impact-v1",
    window: {
      dateFrom: normalizedDateFrom,
      dateTo: normalizedDateTo
    },
    summary: summarizeMachinePerformance(machinePerformance, toolPerformance),
    measurementSystemSummary,
    machinePerformance,
    toolPerformance: toolPerformanceWithHealth,
    remediationView,
    riskIntegration: {
      contractId: "ANA-RISK-v3",
      ...riskPreview,
      persistence: { persisted: 0, updated: 0 }
    }
  };
}

export async function getCalibrationImpactAnalytics(options = {}) {
  return buildCalibrationImpactAnalytics(options);
}

export async function refreshCalibrationImpactAnalytics(options = {}) {
  const result = await buildCalibrationImpactAnalytics(options);
  const persistence = await persistRiskPreview(result.riskIntegration);
  return {
    ...result,
    riskIntegration: {
      ...result.riskIntegration,
      persistence
    }
  };
}

export async function getCalibrationImpactRemediationView(options = {}) {
  const result = await buildCalibrationImpactAnalytics(options);
  return {
    contractId: MEASUREMENT_SYSTEM_CONTRACT_ID,
    window: result.window,
    remediationView: result.remediationView
  };
}

export async function listCalibrationRiskEvents({ status = "open", limit = 100 } = {}) {
  const normalizedStatus = normalizeStatus(status);
  const safeLimit = toPositiveInt(limit, 100);
  const { rows } = await query(
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

  const { rows } = await query(
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

  return transaction(async (client) => {
    const riskRes = await client.query(
      `SELECT *
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

  const { rows } = await query(
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

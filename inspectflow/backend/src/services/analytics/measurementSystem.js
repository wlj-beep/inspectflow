import { getCalibrationImpactAnalytics } from "./calibrationImpact.js";

function rate(numerator, denominator) {
  const n = Number(numerator || 0);
  const d = Number(denominator || 0);
  if (d <= 0) return null;
  return Math.round((n / d) * 10000) / 10000;
}

function toPositiveInt(value, fallback = 100) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function toolHealthScore(tool) {
  const baseScore = 1 - ((Number(tool.ootRate || 0) * 0.6) + (Number(tool.overdueShare || 0) * 0.3) + (Math.max(0, Number(tool.ootRateDelta || 0)) * 0.1));
  const normalized = Math.max(0, Math.min(1, baseScore));
  return Math.round(normalized * 1000) / 1000;
}

function buildOperatorRemediation(tool) {
  const overdue = Number(tool.overdueMeasurementCount || 0);
  const delta = Number(tool.ootRateDelta || 0);
  if (overdue === 0 && delta <= 0) {
    return {
      toolId: tool.toolId,
      toolName: tool.toolName,
      workCenterId: tool.workCenterId,
      recommendation: "Continue normal monitoring",
      severity: "low"
    };
  }

  return {
    toolId: tool.toolId,
    toolName: tool.toolName,
    workCenterId: tool.workCenterId,
    recommendation: overdue > 0
      ? "Pause use for a calibration check and remeasure the next batch"
      : "Review the last measurement pattern and verify setup drift",
    severity: delta > 0.2 || overdue > 0 ? "high" : "medium",
    overdueMeasurementCount: overdue,
    ootRateDelta: delta
  };
}

export async function getMeasurementSystemAnalytics({
  dateFrom = null,
  dateTo = null,
  limit = null
} = {}) {
  const base = await getCalibrationImpactAnalytics({ dateFrom, dateTo, limit: toPositiveInt(limit, 1000) });
  const remediations = base.toolPerformance.map(buildOperatorRemediation);
  const healthRows = base.toolPerformance.map((tool) => ({
    toolId: tool.toolId,
    toolName: tool.toolName,
    workCenterId: tool.workCenterId,
    healthScore: toolHealthScore(tool),
    defectRate: rate(tool.ootCount, tool.measurementCount),
    overdueShare: tool.overdueShare,
    calibrationDueDate: tool.calibrationDueDate,
    lastEventAt: tool.lastEventAt
  }));
  const correlated = base.toolPerformance
    .filter((tool) => Number(tool.overdueMeasurementCount || 0) > 0 || Number(tool.ootRateDelta || 0) > 0)
    .map((tool) => ({
      toolId: tool.toolId,
      toolName: tool.toolName,
      workCenterId: tool.workCenterId,
      riskDedupeKeys: base.riskIntegration.events
        .filter((event) => String(event?.subject?.toolId || "") === String(tool.toolId))
        .map((event) => event.dedupeKey),
      healthScore: toolHealthScore(tool)
    }));

  return {
    contractId: "ANA-MSA-v1",
    capabilityId: "BL-100-msa-v1",
    window: base.window,
    summary: {
      toolCount: base.toolPerformance.length,
      flaggedToolCount: remediations.filter((item) => item.severity !== "low").length,
      correlatedToolCount: correlated.length,
      totalMeasurements: base.summary.totalMeasurements,
      totalOot: base.summary.totalOot,
      overdueMeasurements: base.summary.overdueMeasurements,
      overallOotRate: base.summary.overallOotRate
    },
    toolHealth: healthRows,
    remediations,
    correlations: correlated,
    sourceRiskIntegration: {
      contractId: base.riskIntegration.contractId,
      triggeredCount: base.riskIntegration.triggeredCount,
      eventCount: base.riskIntegration.events.length
    }
  };
}

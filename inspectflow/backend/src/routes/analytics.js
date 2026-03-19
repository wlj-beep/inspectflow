import { Router } from "express";
import { requireAnyCapability, requireCapability } from "../middleware/requireCapability.js";
import { getActorRole, getActorUserId } from "../middleware/authSession.js";
import {
  getAnalyticsMartStatus,
  rebuildAnalyticsMarts
} from "../services/analytics/martBuilder.js";
import {
  getKpiDashboard,
  listKpiDashboardDefinitions
} from "../services/analytics/kpiDashboard.js";
import {
  acknowledgeCalibrationRiskEvent,
  escalateCalibrationRiskEventToIssue,
  getCalibrationImpactAnalytics,
  listCalibrationRiskEvents,
  refreshCalibrationImpactAnalytics,
  resolveCalibrationRiskEvent
} from "../services/analytics/calibrationImpact.js";
import { resolveAnalyticsSiteScope } from "../services/analytics/siteScope.js";
import { getAnalyticsPerformanceSlo } from "../services/analytics/performanceSlo.js";

const router = Router();

const KPI_DASHBOARD_CAPABILITIES = ["submit_records", "view_jobs", "manage_jobs", "view_admin"];

router.get("/marts/status", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const siteScope = await resolveAnalyticsSiteScope({
      requestedSiteId: req.query.siteId,
      actorRole: getActorRole(req),
      actorUserId: getActorUserId(req)
    });
    const status = await getAnalyticsMartStatus({ siteId: siteScope.siteId });
    res.json({ ...status, siteScope });
  } catch (error) {
    if (error?.status && error?.code) return res.status(error.status).json({ error: error.code });
    next(error);
  }
});

router.post("/marts/rebuild", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const triggerSource = String(req.body?.triggerSource || "manual").trim() || "manual";
    const siteScope = await resolveAnalyticsSiteScope({
      requestedSiteId: req.body?.siteId || req.query?.siteId,
      actorRole: getActorRole(req),
      actorUserId: getActorUserId(req)
    });
    const result = await rebuildAnalyticsMarts({
      triggerSource,
      siteId: siteScope.siteId,
      requestedByRole: getActorRole(req) || "system",
      requestedByUserId: getActorUserId(req)
    });

    const statusCode = result.ok ? 200 : 500;
    res.status(statusCode).json({ ...result, siteScope });
  } catch (error) {
    if (error?.status && error?.code) return res.status(error.status).json({ error: error.code });
    next(error);
  }
});

router.get("/kpis/definitions", requireAnyCapability(KPI_DASHBOARD_CAPABILITIES), async (req, res, next) => {
  try {
    const definitions = listKpiDashboardDefinitions();
    res.json(definitions);
  } catch (error) {
    if (String(error?.message || "").startsWith("invalid_kpi_contracts")) {
      return res.status(500).json({ error: "invalid_kpi_contracts" });
    }
    next(error);
  }
});

router.get("/kpis/dashboard", requireAnyCapability(KPI_DASHBOARD_CAPABILITIES), async (req, res, next) => {
  try {
    const siteScope = await resolveAnalyticsSiteScope({
      requestedSiteId: req.query.siteId,
      actorRole: getActorRole(req),
      actorUserId: getActorUserId(req)
    });
    const result = await getKpiDashboard({
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      limit: req.query.limit,
      siteId: siteScope.siteId
    });
    res.json({ ...result, siteScope });
  } catch (error) {
    if (error?.status && error?.code) return res.status(error.status).json({ error: error.code });
    if (String(error?.message || "").startsWith("invalid_")) {
      return res.status(400).json({ error: error.message });
    }
    if (String(error?.message || "").startsWith("invalid_kpi_contracts")) {
      return res.status(500).json({ error: "invalid_kpi_contracts" });
    }
    next(error);
  }
});

router.get("/performance/calibration-impact", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const siteScope = await resolveAnalyticsSiteScope({
      requestedSiteId: req.query.siteId,
      actorRole: getActorRole(req),
      actorUserId: getActorUserId(req)
    });
    const result = await getCalibrationImpactAnalytics({
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      limit: req.query.limit,
      siteId: siteScope.siteId
    });
    res.json({ ...result, siteScope });
  } catch (error) {
    if (error?.status && error?.code) return res.status(error.status).json({ error: error.code });
    if (String(error?.message || "").startsWith("invalid_")) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

router.post("/performance/calibration-impact/refresh", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const siteScope = await resolveAnalyticsSiteScope({
      requestedSiteId: req.body?.siteId || req.query?.siteId,
      actorRole: getActorRole(req),
      actorUserId: getActorUserId(req)
    });
    const result = await refreshCalibrationImpactAnalytics({
      dateFrom: req.body?.dateFrom,
      dateTo: req.body?.dateTo,
      limit: req.body?.limit,
      siteId: siteScope.siteId
    });
    res.json({ ...result, siteScope });
  } catch (error) {
    if (error?.status && error?.code) return res.status(error.status).json({ error: error.code });
    if (String(error?.message || "").startsWith("invalid_")) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

router.get("/performance/slo", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const siteScope = await resolveAnalyticsSiteScope({
      requestedSiteId: req.query.siteId,
      actorRole: getActorRole(req),
      actorUserId: getActorUserId(req)
    });
    const result = await getAnalyticsPerformanceSlo({ siteId: siteScope.siteId });
    res.json({ ...result, siteScope });
  } catch (error) {
    if (error?.status && error?.code) return res.status(error.status).json({ error: error.code });
    next(error);
  }
});

router.get("/risk-events", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const rows = await listCalibrationRiskEvents({
      status: req.query.status,
      limit: req.query.limit
    });
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post("/risk-events/:id/acknowledge", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const acknowledged = await acknowledgeCalibrationRiskEvent({
      eventId: req.params.id,
      acknowledgedByRole: getActorRole(req),
      acknowledgedByUserId: getActorUserId(req),
      acknowledgementNote: req.body?.acknowledgementNote || req.body?.note || null
    });
    if (!acknowledged) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true, ...acknowledged });
  } catch (error) {
    if (String(error?.message || "") === "invalid_event_id") {
      return res.status(400).json({ error: "invalid_event_id" });
    }
    next(error);
  }
});

router.post("/risk-events/:id/escalate-issue", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const escalated = await escalateCalibrationRiskEventToIssue({
      eventId: req.params.id,
      submittedByRole: getActorRole(req),
      submittedByUserId: getActorUserId(req),
      detailsOverride: req.body?.details || null
    });
    if (!escalated) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true, ...escalated });
  } catch (error) {
    if (String(error?.message || "") === "invalid_event_id") {
      return res.status(400).json({ error: "invalid_event_id" });
    }
    if (String(error?.message || "") === "submitted_by_user_required") {
      return res.status(400).json({ error: "submitted_by_user_required" });
    }
    next(error);
  }
});

router.post("/risk-events/:id/resolve", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const resolved = await resolveCalibrationRiskEvent({
      eventId: req.params.id,
      resolvedByRole: getActorRole(req),
      resolvedByUserId: getActorUserId(req),
      resolutionNote: req.body?.resolutionNote || req.body?.note || null
    });
    if (!resolved) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true, ...resolved });
  } catch (error) {
    if (String(error?.message || "") === "invalid_event_id") {
      return res.status(400).json({ error: "invalid_event_id" });
    }
    next(error);
  }
});

export default router;

import { Router } from "express";
import { requireCapability } from "../middleware/requireCapability.js";
import {
  getDataLifecycleSummary,
  getIntegrationMonitoringSummary,
  getIntegrationRunHistory,
  getTechnicalOpsBackupSummary,
  getTechnicalOpsEventSummary,
  getTechnicalOpsHealth,
  getTechnicalOpsStorageSummary,
  getTechnicalOpsSummary,
  updateLifecycleRetentionPolicy
} from "../services/ops/technicalOps.js";

const router = Router();

router.get("/summary", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const payload = await getTechnicalOpsSummary();
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.get("/health", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const payload = await getTechnicalOpsHealth();
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.get("/storage", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const payload = await getTechnicalOpsStorageSummary();
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.get("/backups", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const payload = await getTechnicalOpsBackupSummary();
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.get("/events", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const payload = await getTechnicalOpsEventSummary();
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.get("/integrations/monitoring", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const payload = await getIntegrationMonitoringSummary({
      limit: req.query.limit
    });
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.get("/integrations/:id/runs", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const payload = await getIntegrationRunHistory(req.params.id, {
      limit: req.query.limit
    });
    if (!payload) return res.status(404).json({ error: "not_found" });
    res.json(payload);
  } catch (error) {
    if (String(error?.message || "") === "invalid_integration_id") {
      return res.status(400).json({ error: "invalid_integration_id" });
    }
    next(error);
  }
});

router.get("/lifecycle/summary", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const payload = await getDataLifecycleSummary();
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.post("/lifecycle/retention", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const payload = await updateLifecycleRetentionPolicy(req.body || {});
    res.json({
      ok: true,
      policy: payload
    });
  } catch (error) {
    if (String(error?.message || "").startsWith("invalid_")) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

export default router;

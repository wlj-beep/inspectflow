import { Router } from "express";
import { requireCapability } from "../middleware/requireCapability.js";
import { getPlatformEntitlements } from "../services/platform/entitlements.js";
import { getCustomerProofCenterSummary } from "../services/platform/customerProofCenter.js";

const router = Router();

router.get("/summary", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const entitlements = await getPlatformEntitlements();
    const summary = await getCustomerProofCenterSummary({
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      siteId: req.query.siteId ?? req.query.site_id ?? req.header("x-site-id"),
      limit: req.query.limit,
      entitlements
    });
    res.json(summary);
  } catch (error) {
    if (String(error?.message || "").startsWith("invalid_")) {
      return res.status(400).json({ error: error.message });
    }
    if (String(error?.message || "") === "multisite_not_enabled") {
      return res.status(403).json({ error: "multisite_not_enabled" });
    }
    next(error);
  }
});

router.get("/export", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const entitlements = await getPlatformEntitlements();
    const summary = await getCustomerProofCenterSummary({
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      siteId: req.query.siteId ?? req.query.site_id ?? req.header("x-site-id"),
      limit: req.query.limit,
      entitlements
    });
    const safeSiteScope = String(summary.siteScope || "default").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
    res
      .type("text/plain; charset=utf-8")
      .set("Content-Disposition", `attachment; filename="inspectflow-proof-pack-${safeSiteScope}.txt"`)
      .send(summary.shareableText);
  } catch (error) {
    if (String(error?.message || "").startsWith("invalid_")) {
      return res.status(400).json({ error: error.message });
    }
    if (String(error?.message || "") === "multisite_not_enabled") {
      return res.status(403).json({ error: "multisite_not_enabled" });
    }
    next(error);
  }
});

export default router;

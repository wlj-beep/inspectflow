import { Router } from "express";
import { requireCapability } from "../middleware/requireCapability.js";
import { getPlatformEntitlements } from "../services/platform/entitlements.js";
import { buildEcosystemCompatibilitySuite } from "../services/integration/ecosystemCompatibility.js";

const router = Router();

router.get("/compatibility", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const entitlements = await getPlatformEntitlements();
    const compatibility = buildEcosystemCompatibilitySuite({
      entitlements,
      connectorPolicy: req.query.connectorPolicy ? JSON.parse(String(req.query.connectorPolicy)) : undefined
    });
    res.json(compatibility);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return res.status(400).json({ error: "invalid_connector_policy" });
    }
    next(error);
  }
});

export default router;

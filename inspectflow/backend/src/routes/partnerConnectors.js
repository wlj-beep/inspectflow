import { Router } from "express";
import { requireCapability } from "../middleware/requireCapability.js";
import { getActorRole, getActorUserId } from "../middleware/authSession.js";
import {
  isConnectorIdValid,
  listPartnerConnectors,
  registerPartnerConnector,
  validatePartnerConnectorManifest
} from "../services/integration/partnerConnectorKit.js";

const router = Router();

function ensureAdmin(req, res) {
  const role = getActorRole(req);
  if (role !== "Admin") {
    res.status(403).json({ error: "forbidden" });
    return false;
  }
  return true;
}

function actorFromRequest(req) {
  return {
    userId: getActorUserId(req),
    role: getActorRole(req)
  };
}

router.post("/validate", requireCapability("view_admin"), async (req, res, next) => {
  try {
    if (!ensureAdmin(req, res)) return;
    const result = await validatePartnerConnectorManifest(req.body || {});
    res.json({
      contractId: result.contractId,
      validationStatus: result.validationStatus,
      findings: result.findings
    });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireCapability("view_admin"), async (req, res, next) => {
  try {
    if (!ensureAdmin(req, res)) return;
    const connectorId = String(req.body?.connectorId || req.body?.id || "").trim();
    if (connectorId && !isConnectorIdValid(connectorId)) {
      return res.status(400).json({ error: "invalid_connector_id" });
    }

    const result = await registerPartnerConnector({
      manifest: req.body || {},
      actor: actorFromRequest(req)
    });

    if (result.statusCode === 400) {
      return res.status(400).json({
        contractId: result.contractId,
        validationStatus: result.validationStatus,
        findings: result.findings
      });
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/", requireCapability("view_admin"), async (req, res, next) => {
  try {
    if (!ensureAdmin(req, res)) return;
    res.json(await listPartnerConnectors());
  } catch (err) {
    next(err);
  }
});

export default router;

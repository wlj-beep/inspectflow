import { Router } from "express";
import { requireCapability } from "../middleware/requireCapability.js";
import { getActorRole, getActorUserId } from "../middleware/authSession.js";
import {
  getEdgeSyncContracts,
  getEdgeSyncSnapshot,
  isEdgeModuleEnabled,
  persistEdgeSyncRun,
  validateEdgeSyncPayload
} from "../services/ops/edgeSync.js";

const router = Router();

function ensureAdmin(req, res) {
  const role = getActorRole(req);
  if (role !== "Admin") {
    res.status(403).json({ error: "forbidden" });
    return false;
  }
  return true;
}

async function ensureEdgeEnabled(req, res) {
  const enabled = await isEdgeModuleEnabled();
  if (!enabled) {
    res.status(403).json({ error: "edge_module_disabled" });
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

router.get("/contracts", requireCapability("view_admin"), async (req, res, next) => {
  try {
    if (!ensureAdmin(req, res)) return;
    if (!(await ensureEdgeEnabled(req, res))) return;
    res.json(getEdgeSyncContracts());
  } catch (err) {
    next(err);
  }
});

router.get("/snapshot", requireCapability("view_admin"), async (req, res, next) => {
  try {
    if (!ensureAdmin(req, res)) return;
    if (!(await ensureEdgeEnabled(req, res))) return;
    const snapshot = await getEdgeSyncSnapshot();
    const runId = await persistEdgeSyncRun({
      payload: snapshot,
      direction: "snapshot_export",
      validationStatus: "valid",
      findings: [],
      actor: actorFromRequest(req)
    });
    res.json({ ...snapshot, runId });
  } catch (err) {
    next(err);
  }
});

router.post("/validate", requireCapability("view_admin"), async (req, res, next) => {
  try {
    if (!ensureAdmin(req, res)) return;
    if (!(await ensureEdgeEnabled(req, res))) return;

    const validation = validateEdgeSyncPayload(req.body || {});
    const runId = await persistEdgeSyncRun({
      payload: req.body || {},
      validationStatus: validation.validationStatus,
      findings: validation.findings,
      actor: actorFromRequest(req)
    });

    res.json({
      contractId: validation.contractId,
      validationStatus: validation.validationStatus,
      findings: validation.findings,
      runId
    });
  } catch (err) {
    next(err);
  }
});

export default router;

import { Router } from "express";
import { transaction } from "../db.js";
import { requireCapability } from "../middleware/requireCapability.js";
import { getActorRole, getActorUserId } from "../middleware/authSession.js";
import {
  assembleFaiPackageSummary,
  createFaiPackage,
  finalizeFaiPackage,
  getFaiPackage,
  listFaiPackages,
  signoffFaiCharacteristic
} from "../services/quality/faiPackages.js";

const router = Router();

function parsePositiveInteger(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function resolveActor(req, suppliedUserId, { required = false } = {}) {
  const actorUserId = getActorUserId(req);
  const supplied = parsePositiveInteger(suppliedUserId);
  const effectiveUserId = actorUserId || supplied;
  if (actorUserId && supplied && supplied !== actorUserId) {
    return { error: "auth_user_mismatch" };
  }
  if (required && !effectiveUserId) {
    return { error: "required_fields_missing" };
  }
  return {
    actorRole: getActorRole(req),
    actorUserId: effectiveUserId || null
  };
}

router.get("/fai-packages", requireCapability("view_records"), async (req, res, next) => {
  try {
    const packages = await listFaiPackages({
      partId: req.query.partId,
      lot: req.query.lot,
      status: req.query.status,
      jobId: req.query.jobId,
      recordId: req.query.recordId ? parsePositiveInteger(req.query.recordId) : undefined
    });
    res.json({ count: packages.length, packages });
  } catch (err) {
    next(err);
  }
});

router.post("/fai-packages", requireCapability("view_records"), async (req, res, next) => {
  try {
    const actor = resolveActor(req, req.body?.userId, { required: false });
    if (actor.error === "auth_user_mismatch") {
      return res.status(403).json({ error: actor.error });
    }

    const created = await transaction((client) => createFaiPackage({
      partId: req.body?.partId,
      lot: req.body?.lot,
      operationId: req.body?.operationId,
      jobId: req.body?.jobId,
      recordId: req.body?.recordId,
      profileId: req.body?.profileId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole
    }, client));

    if (created?.error === "unknown_profile") return res.status(400).json({ error: "unknown_profile" });
    if (created?.error === "package_scope_required") return res.status(400).json({ error: "package_scope_required" });
    if (created?.error === "ambiguous_package_scope") return res.status(400).json({ error: "ambiguous_package_scope" });
    if (created?.error === "part_lot_required") return res.status(400).json({ error: "part_lot_required" });
    if (created?.error === "invalid_operation_id") return res.status(400).json({ error: "invalid_operation_id" });
    if (created?.error === "part_not_found") return res.status(404).json({ error: "part_not_found" });
    if (created?.error === "operation_not_found") return res.status(404).json({ error: "operation_not_found" });
    if (created?.error === "job_not_found") return res.status(404).json({ error: "job_not_found" });
    if (created?.error === "record_not_found") return res.status(404).json({ error: "record_not_found" });
    if (created?.error === "no_characteristics_in_scope") return res.status(409).json({ error: "no_characteristics_in_scope" });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.get("/fai-packages/:id", requireCapability("view_records"), async (req, res, next) => {
  try {
    const packageId = parsePositiveInteger(req.params.id);
    if (!packageId) return res.status(400).json({ error: "invalid_package_id" });
    const detail = await getFaiPackage(packageId);
    if (!detail) return res.status(404).json({ error: "not_found" });
    res.json(detail);
  } catch (err) {
    next(err);
  }
});

router.get("/fai-packages/:id/summary", requireCapability("view_records"), async (req, res, next) => {
  try {
    const packageId = parsePositiveInteger(req.params.id);
    if (!packageId) return res.status(400).json({ error: "invalid_package_id" });
    const summary = await assembleFaiPackageSummary(packageId, req.query.profile || req.query.profileId);
    if (!summary) return res.status(404).json({ error: "not_found" });
    if (summary?.error === "unknown_profile") return res.status(400).json({ error: "unknown_profile" });
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

router.post("/fai-packages/:id/signoffs", requireCapability("edit_records"), async (req, res, next) => {
  try {
    const packageId = parsePositiveInteger(req.params.id);
    if (!packageId) return res.status(400).json({ error: "invalid_package_id" });

    const actor = resolveActor(req, req.body?.userId, { required: true });
    if (actor.error === "auth_user_mismatch") return res.status(403).json({ error: actor.error });
    if (actor.error === "required_fields_missing") return res.status(400).json({ error: actor.error });

    const result = await transaction((client) => signoffFaiCharacteristic({
      packageId,
      dimensionId: req.body?.dimensionId,
      disposition: req.body?.disposition,
      note: req.body?.note,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole
    }, client));

    if (result?.error === "required_fields_missing") return res.status(400).json({ error: "required_fields_missing" });
    if (result?.error === "invalid_disposition") return res.status(400).json({ error: "invalid_disposition" });
    if (result?.error === "user_not_found") return res.status(400).json({ error: "user_not_found" });
    if (result?.error === "dimension_not_in_scope") return res.status(404).json({ error: "dimension_not_in_scope" });
    if (result?.error === "package_finalized") return res.status(409).json({ error: "package_finalized" });
    if (result?.error === "not_found") return res.status(404).json({ error: "not_found" });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/fai-packages/:id/finalize", requireCapability("edit_records"), async (req, res, next) => {
  try {
    const packageId = parsePositiveInteger(req.params.id);
    if (!packageId) return res.status(400).json({ error: "invalid_package_id" });

    const actor = resolveActor(req, req.body?.userId, { required: true });
    if (actor.error === "auth_user_mismatch") return res.status(403).json({ error: actor.error });
    if (actor.error === "required_fields_missing") return res.status(400).json({ error: actor.error });

    const result = await transaction((client) => finalizeFaiPackage({
      packageId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole
    }, client));

    if (result?.error === "required_fields_missing") return res.status(400).json({ error: "required_fields_missing" });
    if (result?.error === "user_not_found") return res.status(400).json({ error: "user_not_found" });
    if (result?.error === "package_not_ready") {
      return res.status(409).json({ error: "package_not_ready", readiness: result.readiness });
    }
    if (result?.error === "package_finalized") return res.status(409).json({ error: "package_finalized" });
    if (result?.error === "not_found") return res.status(404).json({ error: "not_found" });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;

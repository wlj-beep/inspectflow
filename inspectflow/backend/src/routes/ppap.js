import { Router } from "express";
import { transaction } from "../db.js";
import { getActorRole, getActorUserId } from "../middleware/authSession.js";
import {
  buildPpapSummary,
  buildPswPayload,
  ensurePpapSchema,
  createPpapPackage,
  getPpapPackage,
  listPpapPackages,
  promotePpapPackageToReview,
  recordPpapCustomerApproval,
  submitPpapPackage,
  updatePpapElement,
  updatePpapPackage
} from "../services/quality/ppap/index.js";

const router = Router();
const PPAP_ROLES = new Set(["Quality", "Supervisor", "Admin"]);

function parsePositiveInteger(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function requirePpapRole(req, res, next) {
  const role = getActorRole(req);
  if (!role) return res.status(401).json({ error: "unauthenticated" });
  if (!PPAP_ROLES.has(role)) return res.status(403).json({ error: "forbidden" });
  return next();
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

router.use(requirePpapRole);

router.use(async (_req, _res, next) => {
  try {
    await ensurePpapSchema();
    next();
  } catch (err) {
    next(err);
  }
});

router.get("/ppap-packages", async (req, res, next) => {
  try {
    const packages = await listPpapPackages({
      partId: req.query.partId,
      customerName: req.query.customerName,
      status: req.query.status,
      submissionLevel: req.query.submissionLevel
    });
    if (packages?.error === "invalid_submission_level") {
      return res.status(400).json({ error: "invalid_submission_level" });
    }
    res.json({ count: packages.length, packages });
  } catch (err) {
    next(err);
  }
});

router.post("/ppap-packages", async (req, res, next) => {
  try {
    const actor = resolveActor(req, req.body?.userId, { required: false });
    if (actor.error === "auth_user_mismatch") {
      return res.status(403).json({ error: actor.error });
    }

    const created = await transaction((client) => createPpapPackage({
      partId: req.body?.partId,
      customerName: req.body?.customerName,
      submissionLevel: req.body?.submissionLevel,
      notes: req.body?.notes,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole
    }, client));

    if (created?.error === "part_id_required") return res.status(400).json({ error: "part_id_required" });
    if (created?.error === "invalid_submission_level") return res.status(400).json({ error: "invalid_submission_level" });
    if (created?.error === "part_not_found") return res.status(404).json({ error: "part_not_found" });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.get("/ppap-packages/:id", async (req, res, next) => {
  try {
    const packageId = parsePositiveInteger(req.params.id);
    if (!packageId) return res.status(400).json({ error: "invalid_package_id" });
    const includeAttachmentData = String(req.query.includeAttachmentData || "").toLowerCase() === "true";
    const bundle = await getPpapPackage(packageId, undefined, { includeAttachmentData });
    if (!bundle) return res.status(404).json({ error: "not_found" });
    res.json(bundle);
  } catch (err) {
    next(err);
  }
});

router.patch("/ppap-packages/:id", async (req, res, next) => {
  try {
    const packageId = parsePositiveInteger(req.params.id);
    if (!packageId) return res.status(400).json({ error: "invalid_package_id" });
    const updated = await transaction((client) => updatePpapPackage(packageId, {
      customerName: req.body?.customerName,
      notes: req.body?.notes,
      submissionLevel: req.body?.submissionLevel
    }, client));

    if (updated?.error === "required_fields_missing") return res.status(400).json({ error: "required_fields_missing" });
    if (updated?.error === "invalid_submission_level") return res.status(400).json({ error: "invalid_submission_level" });
    if (updated?.error === "not_found") return res.status(404).json({ error: "not_found" });
    if (updated?.error === "package_submitted") return res.status(409).json({ error: "package_submitted" });
    if (updated?.error === "package_closed") return res.status(409).json({ error: "package_closed" });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post("/ppap-packages/:id/review", async (req, res, next) => {
  try {
    const packageId = parsePositiveInteger(req.params.id);
    if (!packageId) return res.status(400).json({ error: "invalid_package_id" });
    const reviewed = await transaction((client) => promotePpapPackageToReview(packageId, client));
    if (reviewed?.error === "not_found") return res.status(404).json({ error: "not_found" });
    if (reviewed?.error === "package_submitted") return res.status(409).json({ error: "package_submitted" });
    if (reviewed?.error === "package_closed") return res.status(409).json({ error: "package_closed" });
    res.json(reviewed);
  } catch (err) {
    next(err);
  }
});

router.put("/ppap-packages/:id/elements/:elementCode", async (req, res, next) => {
  try {
    const packageId = parsePositiveInteger(req.params.id);
    if (!packageId) return res.status(400).json({ error: "invalid_package_id" });
    const updated = await transaction((client) => updatePpapElement(packageId, req.params.elementCode, {
      status: req.body?.status,
      notes: req.body?.notes,
      attachmentName: req.body?.attachmentName,
      attachmentDataBase64: req.body?.attachmentDataBase64,
      includeAttachmentData: String(req.query.includeAttachmentData || "").toLowerCase() === "true"
    }, client));

    if (updated?.error === "invalid_element_code") return res.status(400).json({ error: "invalid_element_code" });
    if (updated?.error === "invalid_element_status") return res.status(400).json({ error: "invalid_element_status" });
    if (updated?.error === "invalid_attachment_data") return res.status(400).json({ error: "invalid_attachment_data" });
    if (updated?.error === "invalid_attachment_metadata") return res.status(400).json({ error: "invalid_attachment_metadata" });
    if (updated?.error === "not_found") return res.status(404).json({ error: "not_found" });
    if (updated?.error === "package_submitted") return res.status(409).json({ error: "package_submitted" });
    if (updated?.error === "package_closed") return res.status(409).json({ error: "package_closed" });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post("/ppap-packages/:id/submit", async (req, res, next) => {
  try {
    const packageId = parsePositiveInteger(req.params.id);
    if (!packageId) return res.status(400).json({ error: "invalid_package_id" });
    const submitted = await transaction((client) => submitPpapPackage(packageId, client));
    if (submitted?.error === "not_found") return res.status(404).json({ error: "not_found" });
    if (submitted?.error === "package_already_submitted") return res.status(409).json({ error: "package_already_submitted" });
    if (submitted?.error === "package_closed") return res.status(409).json({ error: "package_closed" });
    if (submitted?.error === "package_not_ready") {
      return res.status(409).json({ error: "package_not_ready", readiness: submitted.readiness });
    }
    res.json(submitted);
  } catch (err) {
    next(err);
  }
});

router.post("/ppap-packages/:id/customer-approvals", async (req, res, next) => {
  try {
    const packageId = parsePositiveInteger(req.params.id);
    if (!packageId) return res.status(400).json({ error: "invalid_package_id" });

    const actor = resolveActor(req, req.body?.userId, { required: true });
    if (actor.error === "auth_user_mismatch") return res.status(403).json({ error: actor.error });
    if (actor.error === "required_fields_missing") return res.status(400).json({ error: actor.error });

    const result = await transaction((client) => recordPpapCustomerApproval(packageId, {
      decision: req.body?.decision,
      customerReference: req.body?.customerReference,
      notes: req.body?.notes,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole
    }, client));

    if (result?.error === "invalid_decision") return res.status(400).json({ error: "invalid_decision" });
    if (result?.error === "not_found") return res.status(404).json({ error: "not_found" });
    if (result?.error === "package_not_submitted") {
      return res.status(409).json({ error: "package_not_submitted", status: result.status });
    }
    if (result?.error === "package_closed") return res.status(409).json({ error: "package_closed" });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/ppap-packages/:id/psw", async (req, res, next) => {
  try {
    const packageId = parsePositiveInteger(req.params.id);
    if (!packageId) return res.status(400).json({ error: "invalid_package_id" });
    const includeAttachmentData = String(req.query.includeAttachmentData || "").toLowerCase() === "true";
    const payload = await transaction((client) => buildPswPayload(packageId, client, { includeAttachmentData }));
    if (!payload) return res.status(404).json({ error: "not_found" });
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.get("/ppap-packages/:id/summary", async (req, res, next) => {
  try {
    const packageId = parsePositiveInteger(req.params.id);
    if (!packageId) return res.status(400).json({ error: "invalid_package_id" });
    const includeAttachmentData = String(req.query.includeAttachmentData || "").toLowerCase() === "true";
    const summary = await transaction((client) => buildPpapSummary(packageId, client, { includeAttachmentData }));
    if (!summary) return res.status(404).json({ error: "not_found" });
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

export default router;

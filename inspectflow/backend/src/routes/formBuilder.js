/**
 * No-code inspection form builder HTTP routes.
 * BL-121 (OPS-FORMBUILDER-v1)
 * Mounted at /api/form-builder
 */

import { Router } from "express";
import { requireCapability } from "../middleware/requireCapability.js";
import { requireAuthenticated } from "../middleware/authSession.js";
import { getActorUserId, getActorRole } from "../middleware/authSession.js";
import { resolveAnalyticsSiteScope } from "../services/analytics/siteScope.js";
import {
  getFormBuilderContracts,
  listFormTemplates,
  createFormTemplate,
  getFormTemplate,
  updateFormTemplate,
  publishFormTemplate,
  archiveFormTemplate,
  previewFormTemplate,
  createSubmission,
  listSubmissions,
  getSubmission,
  getFormAuditLog
} from "../services/formBuilder/formBuilder.js";

const router = Router();

// ── Error mapping ─────────────────────────────────────────────────────────────

function mapFormError(code) {
  return {
    invalid_form_name:       [400, "invalid_form_name"],
    invalid_form_schema:     [400, "invalid_form_schema"],
    duplicate_form_name:     [409, "duplicate_form_name"],
    form_not_found:          [404, "form_not_found"],
    submission_not_found:    [404, "submission_not_found"],
    form_not_editable:       [409, "form_not_editable"],
    form_not_published:      [422, "form_not_published"],
    form_has_no_fields:      [422, "form_has_no_fields"],
    invalid_submission_data: [422, "invalid_submission_data"]
  }[String(code || "")] || [500, "server_error"];
}

function handleFormError(err, res, next) {
  if (err?.code && mapFormError(err.code)[0] !== 500) {
    const [status, errorCode] = mapFormError(err.code);
    return res.status(status).json({ error: errorCode });
  }
  if (err?.status && err?.code) {
    return res.status(err.status).json({ error: err.code });
  }
  next(err);
}

// ── Site scope helper ─────────────────────────────────────────────────────────

async function resolveSite(req) {
  const scope = await resolveAnalyticsSiteScope({
    requestedSiteId: req.body?.siteId ?? req.query?.siteId ?? null,
    actorRole: getActorRole(req),
    actorUserId: getActorUserId(req)
  });
  return scope.siteId ?? "default";
}

function parseId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /contracts — field type catalog (Admin)
router.get("/contracts", requireCapability("view_admin"), async (req, res, next) => {
  try {
    res.json(getFormBuilderContracts());
  } catch (err) { next(err); }
});

// GET /forms — list all form templates (Admin)
router.get("/forms", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const siteId = await resolveSite(req);
    const status = req.query.status || null;
    const templates = await listFormTemplates({ siteId, status });
    res.json({ contractId: "OPS-FORMBUILDER-v1", templates });
  } catch (err) { handleFormError(err, res, next); }
});

// POST /forms — create draft form (Admin)
router.post("/forms", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const siteId = await resolveSite(req);
    const template = await createFormTemplate(req.body, {
      siteId,
      actorUserId: getActorUserId(req),
      actorRole: getActorRole(req)
    });
    res.status(201).json({ contractId: "OPS-FORMBUILDER-v1", template });
  } catch (err) { handleFormError(err, res, next); }
});

// GET /forms/:id — get single form template (Admin)
router.get("/forms/:id", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid_form_id" });
    const siteId = await resolveSite(req);
    const template = await getFormTemplate(id, { siteId });
    res.json({ contractId: "OPS-FORMBUILDER-v1", template });
  } catch (err) { handleFormError(err, res, next); }
});

// PUT /forms/:id — update draft form (Admin)
router.put("/forms/:id", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid_form_id" });
    const siteId = await resolveSite(req);
    const template = await updateFormTemplate(id, req.body, {
      siteId,
      actorUserId: getActorUserId(req),
      actorRole: getActorRole(req)
    });
    res.json({ contractId: "OPS-FORMBUILDER-v1", template });
  } catch (err) { handleFormError(err, res, next); }
});

// POST /forms/:id/publish — publish a draft (Admin)
router.post("/forms/:id/publish", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid_form_id" });
    const siteId = await resolveSite(req);
    const template = await publishFormTemplate(id, {
      siteId,
      actorUserId: getActorUserId(req),
      actorRole: getActorRole(req)
    });
    res.json({ contractId: "OPS-FORMBUILDER-v1", template });
  } catch (err) { handleFormError(err, res, next); }
});

// POST /forms/:id/archive — archive a form (Admin)
router.post("/forms/:id/archive", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid_form_id" });
    const siteId = await resolveSite(req);
    const template = await archiveFormTemplate(id, {
      siteId,
      actorUserId: getActorUserId(req),
      actorRole: getActorRole(req)
    });
    res.json({ contractId: "OPS-FORMBUILDER-v1", template });
  } catch (err) { handleFormError(err, res, next); }
});

// GET /forms/:id/preview — preview descriptor (Admin)
router.get("/forms/:id/preview", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid_form_id" });
    const siteId = await resolveSite(req);
    const preview = await previewFormTemplate(id, { siteId });
    res.json(preview);
  } catch (err) { handleFormError(err, res, next); }
});

// GET /forms/:id/submissions — list submissions (Admin)
router.get("/forms/:id/submissions", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid_form_id" });
    const siteId = await resolveSite(req);
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    const result = await listSubmissions(id, { siteId, limit, offset });
    res.json({ contractId: "OPS-FORMBUILDER-v1", ...result });
  } catch (err) { handleFormError(err, res, next); }
});

// POST /forms/:id/submissions — submit a filled form (authenticated, any role)
router.post("/forms/:id/submissions", requireAuthenticated, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid_form_id" });
    const siteId = await resolveSite(req);
    const submission = await createSubmission(id, req.body, {
      siteId,
      actorUserId: getActorUserId(req),
      actorRole: getActorRole(req)
    });
    res.status(201).json({ contractId: "OPS-FORMBUILDER-v1", submission });
  } catch (err) { handleFormError(err, res, next); }
});

// GET /submissions/:id — get single submission detail (Admin)
router.get("/submissions/:id", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid_submission_id" });
    const siteId = await resolveSite(req);
    const submission = await getSubmission(id, { siteId });
    res.json({ contractId: "OPS-FORMBUILDER-v1", submission });
  } catch (err) { handleFormError(err, res, next); }
});

// GET /forms/:id/audit — audit log for a form (Admin)
router.get("/forms/:id/audit", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid_form_id" });
    const siteId = await resolveSite(req);
    const limit = Number(req.query.limit) || 50;
    const entries = await getFormAuditLog(id, { siteId, limit });
    res.json({ contractId: "OPS-FORMBUILDER-v1", entries });
  } catch (err) { handleFormError(err, res, next); }
});

export default router;

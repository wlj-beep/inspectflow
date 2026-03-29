import { Router } from "express";
import { requireCapability } from "../middleware/requireCapability.js";
import { getActorUserId, getActorRole } from "../middleware/authSession.js";
import { resolveAnalyticsSiteScope } from "../services/analytics/siteScope.js";
import {
  createReportTemplate,
  getReportExportContracts,
  getReportTemplate,
  listReportTemplates,
  previewReportTemplate,
  updateReportTemplate
} from "../services/reports/reportTemplates.js";

const router = Router();

function parsePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function pickTemplateId(req) {
  return parsePositiveInteger(req.params.id);
}

function pickTemplateIdFromBody(req) {
  return parsePositiveInteger(req.body?.templateId ?? req.body?.template_id);
}

function mapTemplateError(errorCode) {
  return {
    invalid_template_name: [400, "invalid_template_name"],
    invalid_entity_type: [400, "invalid_entity_type"],
    invalid_selected_fields: [400, "invalid_selected_fields"],
    invalid_filter_config: [400, "invalid_filter_config"],
    invalid_sort_config: [400, "invalid_sort_config"],
    invalid_export_formats: [400, "invalid_export_formats"],
    invalid_template_id: [400, "invalid_template_id"],
    template_or_entity_type_required: [400, "template_or_entity_type_required"],
    duplicate_report_template: [409, "duplicate_report_template"],
    report_template_not_found: [404, "report_template_not_found"],
    template_entity_type_mismatch: [400, "template_entity_type_mismatch"]
  }[String(errorCode || "")] || [500, "server_error"];
}

async function resolveSiteScope(req) {
  return resolveAnalyticsSiteScope({
    requestedSiteId: req.body?.siteId ?? req.body?.site_id ?? req.query?.siteId ?? req.query?.site_id ?? null,
    actorRole: getActorRole(req),
    actorUserId: getActorUserId(req)
  });
}

function templateResponse(template) {
  return {
    contractId: "PLAT-REPORT-v1",
    template,
    exportContracts: getReportExportContracts()
  };
}

router.get("/contracts", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const siteScope = await resolveSiteScope(req);
    res.json({
      ...getReportExportContracts(),
      siteScope
    });
  } catch (error) {
    if (error?.status && error?.code) return res.status(error.status).json({ error: error.code });
    next(error);
  }
});

router.get("/", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const siteScope = await resolveSiteScope(req);
    const templates = await listReportTemplates({
      siteId: siteScope.siteId,
      entityType: req.query?.entityType ?? req.query?.entity_type ?? null
    });
    res.json({
      contractId: "PLAT-REPORT-v1",
      siteScope,
      count: templates.length,
      templates
    });
  } catch (error) {
    if (error?.status && error?.code) return res.status(error.status).json({ error: error.code });
    next(error);
  }
});

router.post("/", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const siteScope = await resolveSiteScope(req);
    const created = await createReportTemplate(req.body || {}, {
      siteId: siteScope.siteId,
      actorUserId: getActorUserId(req)
    });
    if (created?.error) {
      const [status, error] = mapTemplateError(created.error);
      return res.status(status).json({ error });
    }

    res.status(201).json({
      ...templateResponse(created),
      siteScope
    });
  } catch (error) {
    if (error?.status && error?.code) return res.status(error.status).json({ error: error.code });
    next(error);
  }
});

router.get("/:id", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const siteScope = await resolveSiteScope(req);
    const templateId = pickTemplateId(req);
    if (!templateId) return res.status(400).json({ error: "invalid_template_id" });

    const template = await getReportTemplate(templateId, { siteId: siteScope.siteId });
    if (!template) return res.status(404).json({ error: "report_template_not_found" });

    res.json({
      contractId: "PLAT-REPORT-v1",
      siteScope,
      template,
      exportContracts: getReportExportContracts()
    });
  } catch (error) {
    if (error?.status && error?.code) return res.status(error.status).json({ error: error.code });
    next(error);
  }
});

router.put("/:id", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const siteScope = await resolveSiteScope(req);
    const templateId = pickTemplateId(req);
    if (!templateId) return res.status(400).json({ error: "invalid_template_id" });

    const updated = await updateReportTemplate(templateId, req.body || {}, {
      siteId: siteScope.siteId,
      actorUserId: getActorUserId(req)
    });
    if (updated?.error) {
      const [status, error] = mapTemplateError(updated.error);
      return res.status(status).json({ error });
    }

    res.json({
      ...templateResponse(updated),
      siteScope
    });
  } catch (error) {
    if (error?.status && error?.code) return res.status(error.status).json({ error: error.code });
    next(error);
  }
});

router.post("/preview", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const siteScope = await resolveSiteScope(req);
    const templateId = pickTemplateIdFromBody(req);
    const payload = {
      ...req.body,
      siteId: siteScope.siteId
    };

    if (templateId) {
      payload.templateId = templateId;
    }

    if (!payload.templateId && !payload.entityType && !payload.entity_type) {
      return res.status(400).json({ error: "template_or_entity_type_required" });
    }

    const preview = await previewReportTemplate(payload);
    if (preview?.error) {
      const [status, error] = mapTemplateError(preview.error);
      return res.status(status).json({ error });
    }

    res.json({
      ...preview,
      siteScope
    });
  } catch (error) {
    if (error?.status && error?.code) return res.status(error.status).json({ error: error.code });
    next(error);
  }
});

router.post("/:id/preview", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const siteScope = await resolveSiteScope(req);
    const templateId = pickTemplateId(req);
    if (!templateId) return res.status(400).json({ error: "invalid_template_id" });

    const preview = await previewReportTemplate({
      ...req.body,
      templateId,
      siteId: siteScope.siteId
    });
    if (preview?.error) {
      const [status, error] = mapTemplateError(preview.error);
      return res.status(status).json({ error });
    }

    res.json({
      ...preview,
      siteScope
    });
  } catch (error) {
    if (error?.status && error?.code) return res.status(error.status).json({ error: error.code });
    next(error);
  }
});

export default router;

import { Router } from "express";
import { requireCapability } from "../middleware/requireCapability.js";
import { getActorRole, getActorUserId } from "../middleware/authSession.js";
import {
  checkDocumentTrainingAccess,
  createQualityDocument,
  createSupplierQualityEvent,
  exportSupplierQualityEvent,
  listQualityDocuments,
  recordTrainingCompletion,
  releaseQualityDocument,
  transitionSupplierQualityEvent,
  upsertTrainingRequirement
} from "../services/quality/qualityWorkflows.js";

const router = Router();

function parsePositiveInteger(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

router.get("/documents", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const documents = await listQualityDocuments({
      status: req.query.status,
      kind: req.query.kind
    });
    res.json({ documents });
  } catch (error) {
    if (String(error?.message || "") === "invalid_status") {
      return res.status(400).json({ error: "invalid_status" });
    }
    next(error);
  }
});

router.post("/documents", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const document = await createQualityDocument({
      docNumber: req.body?.docNumber,
      title: req.body?.title,
      kind: req.body?.kind,
      revisionCode: req.body?.revisionCode,
      content: req.body?.content,
      changeReason: req.body?.changeReason,
      ownerUserId: req.body?.ownerUserId,
      actorUserId: getActorUserId(req),
      actorRole: getActorRole(req)
    });
    res.status(201).json({ document });
  } catch (error) {
    const message = String(error?.message || "");
    if (message.endsWith("_required")) {
      return res.status(400).json({ error: message });
    }
    next(error);
  }
});

router.post("/documents/:id/release", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const document = await releaseQualityDocument({
      documentId: req.params.id,
      actorUserId: getActorUserId(req),
      actorRole: getActorRole(req),
      releaseNote: req.body?.releaseNote || req.body?.note || null
    });
    if (!document) return res.status(404).json({ error: "not_found" });
    res.json({ document });
  } catch (error) {
    if (String(error?.message || "") === "invalid_document_id") {
      return res.status(400).json({ error: "invalid_document_id" });
    }
    next(error);
  }
});

router.post("/documents/:id/training/requirements", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const requirement = await upsertTrainingRequirement({
      documentId: req.params.id,
      role: req.body?.role,
      mode: req.body?.mode,
      active: req.body?.active,
      actorUserId: getActorUserId(req),
      actorRole: getActorRole(req)
    });
    res.status(201).json({ requirement });
  } catch (error) {
    const message = String(error?.message || "");
    if (message === "invalid_document_id") return res.status(400).json({ error: "invalid_document_id" });
    if (message === "role_required") return res.status(400).json({ error: "role_required" });
    if (message === "invalid_mode") return res.status(400).json({ error: "invalid_mode" });
    next(error);
  }
});

router.post("/documents/:id/training/completions", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const completion = await recordTrainingCompletion({
      documentId: req.params.id,
      userId: req.body?.userId,
      completedByUserId: getActorUserId(req),
      completedByRole: getActorRole(req),
      result: req.body?.result,
      note: req.body?.note,
      evidence: req.body?.evidence
    });
    res.status(201).json({ completion });
  } catch (error) {
    const message = String(error?.message || "");
    if (message === "invalid_document_id") return res.status(400).json({ error: "invalid_document_id" });
    if (message === "user_required") return res.status(400).json({ error: "user_required" });
    next(error);
  }
});

router.get("/documents/:id/training/access", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const access = await checkDocumentTrainingAccess({
      documentId: req.params.id,
      userId: req.query.userId,
      role: req.query.role
    });
    if (!access) return res.status(404).json({ error: "not_found" });
    res.json(access);
  } catch (error) {
    const message = String(error?.message || "");
    if (message === "invalid_document_id") return res.status(400).json({ error: "invalid_document_id" });
    if (message === "user_required") return res.status(400).json({ error: "user_required" });
    next(error);
  }
});

router.post("/supplier-events", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const event = await createSupplierQualityEvent({
      supplierName: req.body?.supplierName,
      details: req.body?.details,
      issueReportId: req.body?.issueReportId,
      capaEventId: req.body?.capaEventId,
      scarNumber: req.body?.scarNumber,
      responseDueAt: req.body?.responseDueAt,
      actorUserId: getActorUserId(req),
      actorRole: getActorRole(req)
    });
    res.status(201).json({ event });
  } catch (error) {
    const message = String(error?.message || "");
    if (message.endsWith("_required")) {
      return res.status(400).json({ error: message });
    }
    if (message === "invalid_response_due_at") {
      return res.status(400).json({ error: message });
    }
    next(error);
  }
});

router.post("/supplier-events/:id/transition", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const event = await transitionSupplierQualityEvent({
      eventId: req.params.id,
      toStatus: req.body?.toStatus || req.body?.status,
      note: req.body?.note,
      closureEvidence: req.body?.closureEvidence,
      actorUserId: getActorUserId(req),
      actorRole: getActorRole(req)
    });
    if (!event) return res.status(404).json({ error: "not_found" });
    res.json({ event });
  } catch (error) {
    const message = String(error?.message || "");
    if (message === "invalid_event_id") return res.status(400).json({ error: "invalid_event_id" });
    if (message === "invalid_status") return res.status(400).json({ error: "invalid_status" });
    if (message === "invalid_transition") return res.status(400).json({ error: "invalid_transition" });
    if (message === "no_status_change") return res.status(400).json({ error: "no_status_change" });
    next(error);
  }
});

router.get("/supplier-events/:id/export", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const exported = await exportSupplierQualityEvent(req.params.id);
    if (!exported) return res.status(404).json({ error: "not_found" });
    res.json(exported);
  } catch (error) {
    if (String(error?.message || "") === "invalid_event_id") {
      return res.status(400).json({ error: "invalid_event_id" });
    }
    next(error);
  }
});

router.get("/status", requireCapability("view_admin"), async (req, res) => {
  res.json({
    ok: true,
    contractId: "QUAL-DOC-v1",
    trainingContractId: "QUAL-TRAIN-v1",
    supplierContractId: "QUAL-SUPPLIER-v1"
  });
});

export default router;

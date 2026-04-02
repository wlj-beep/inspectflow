import { Router } from "express";
import { query } from "../db.js";
import { requireAnyCapability, requireCapability } from "../middleware/requireCapability.js";
import { getActorRole, getActorUserId } from "../middleware/authSession.js";
import {
  approveControlledDocumentRevision,
  createControlledDocument,
  createControlledDocumentRevision,
  getControlledDocumentDetail,
  listControlledDocumentsForCapa,
  releaseControlledDocumentRevision
} from "../services/quality/controlledDocuments.js";

const router = Router();

const VALID_CATEGORIES = [
  "part_issue",
  "tolerance_issue",
  "dimension_issue",
  "operation_mapping_issue",
  "app_functionality_issue",
  "tool_issue",
  "sampling_issue",
  "other"
];

const CAPA_STATUSES = [
  "open",
  "containment",
  "investigation",
  "corrective_action",
  "verification",
  "closed",
  "cancelled"
];

const CAPA_SEVERITIES = ["low", "medium", "high", "critical"];
const CONTROLLED_DOCUMENT_AUTHOR_ROLES = new Set(["Quality", "Supervisor", "Admin"]);
const CONTROLLED_DOCUMENT_APPROVER_ROLES = new Set(["Supervisor", "Admin"]);
const CONTROLLED_DOCUMENT_RELEASER_ROLES = new Set(["Admin"]);

const CAPA_ALLOWED_TRANSITIONS = {
  open: new Set(["containment", "cancelled"]),
  containment: new Set(["investigation", "cancelled"]),
  investigation: new Set(["corrective_action", "cancelled"]),
  corrective_action: new Set(["verification", "cancelled"]),
  verification: new Set(["closed", "corrective_action"]),
  closed: new Set(),
  cancelled: new Set()
};

const CAPA_TRANSITION_ROLE_RULES = {
  containment: new Set(["Quality", "Supervisor", "Admin"]),
  investigation: new Set(["Quality", "Supervisor", "Admin"]),
  corrective_action: new Set(["Quality", "Supervisor", "Admin"]),
  verification: new Set(["Supervisor", "Admin"]),
  closed: new Set(["Admin"]),
  cancelled: new Set(["Supervisor", "Admin"])
};

const CAPA_TRANSITION_REQUIREMENTS = {
  containment: [
    { field: "containment_plan", error: "containment_plan_required" }
  ],
  corrective_action: [
    { field: "root_cause", error: "root_cause_required" }
  ],
  verification: [
    { field: "corrective_action_plan", error: "corrective_action_plan_required" }
  ],
  closed: [
    { field: "effectiveness_notes", error: "effectiveness_notes_required" }
  ]
};

function normalizeCapaStatus(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return CAPA_STATUSES.includes(normalized) ? normalized : null;
}

function normalizeCapaSeverity(value, fallback = "medium") {
  const normalized = String(value || "").trim().toLowerCase();
  return CAPA_SEVERITIES.includes(normalized) ? normalized : fallback;
}

function resolveActingUserId(req, suppliedUserId) {
  const actorUserId = getActorUserId(req);
  const supplied = Number(suppliedUserId);
  const effective = Number.isInteger(actorUserId) ? actorUserId : supplied;
  return { actorUserId, suppliedUserId: supplied, effectiveUserId: effective };
}

function ensureCapaTransitionRole(nextStatus, actorRole) {
  const allowedRoles = CAPA_TRANSITION_ROLE_RULES[nextStatus];
  if (!allowedRoles) return null;
  if (!actorRole || !allowedRoles.has(actorRole)) return "forbidden";
  return null;
}

function ensureCapaTransitionRequirements(current, nextStatus) {
  const requirements = CAPA_TRANSITION_REQUIREMENTS[nextStatus] || [];
  for (const requirement of requirements) {
    const value = String(current?.[requirement.field] || "").trim();
    if (!value) return requirement.error;
  }
  return null;
}

function ensureRoleAllowed(allowedRoles, actorRole) {
  if (!actorRole || !allowedRoles.has(actorRole)) return "forbidden";
  return null;
}

function handleControlledDocumentError(res, error) {
  const code = String(error?.message || "");
  if (
    [
      "invalid_capa_id",
      "invalid_document_id",
      "invalid_revision_id",
      "invalid_document_type",
      "document_number_required",
      "title_required",
      "change_reason_required",
      "user_required",
      "user_not_found",
      "open_revision_exists",
      "invalid_revision_state"
    ].includes(code)
  ) {
    return res.status(400).json({ error: code });
  }
  if (["capa_not_found", "document_not_found", "revision_not_found"].includes(code)) {
    return res.status(404).json({ error: code === "capa_not_found" ? "not_found" : code });
  }
  if (error?.code === "23505") {
    return res.status(409).json({ error: "document_number_exists" });
  }
  return false;
}

router.get("/", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const { status, category } = req.query;
    const filters = [];
    const params = [];
    if (status) {
      params.push(status);
      filters.push(`ir.status=$${params.length}`);
    }
    if (category) {
      params.push(category);
      filters.push(`ir.category=$${params.length}`);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const { rows } = await query(
      `SELECT
         ir.*,
         su.name AS submitted_by_name,
         ru.name AS resolved_by_name
       FROM issue_reports ir
       JOIN users su ON su.id = ir.submitted_by_user_id
       LEFT JOIN users ru ON ru.id = ir.resolved_by_user_id
       ${where}
       ORDER BY ir.submitted_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/", requireAnyCapability(["view_operator", "submit_records", "view_admin"]), async (req, res, next) => {
  try {
    const {
      category,
      details,
      userId,
      partId,
      operationId,
      dimensionId,
      jobId,
      recordId
    } = req.body || {};

    const trimmedCategory = String(category || "").trim();
    const trimmedDetails = String(details || "").trim();
    const actorUserId = getActorUserId(req);
    const suppliedUserId = Number(userId);
    const userIdNum = Number.isInteger(actorUserId) ? actorUserId : suppliedUserId;
    if (!trimmedCategory || !trimmedDetails || !Number.isInteger(userIdNum)) {
      return res.status(400).json({ error: "required_fields_missing" });
    }
    if (Number.isInteger(actorUserId) && Number.isInteger(suppliedUserId) && suppliedUserId !== actorUserId) {
      return res.status(403).json({ error: "auth_user_mismatch" });
    }
    if (!VALID_CATEGORIES.includes(trimmedCategory)) {
      return res.status(400).json({ error: "invalid_category" });
    }
    const userRes = await query("SELECT id FROM users WHERE id=$1", [userIdNum]);
    if (!userRes.rows[0]) return res.status(400).json({ error: "user_not_found" });

    const submittedByRole = getActorRole(req);
    if (!submittedByRole) return res.status(401).json({ error: "unauthenticated" });
    const { rows } = await query(
      `INSERT INTO issue_reports (
         category, details, status,
         part_id, operation_id, dimension_id, job_id, record_id,
         submitted_by_user_id, submitted_by_role
       )
       VALUES ($1,$2,'open',$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        trimmedCategory,
        trimmedDetails,
        partId ? String(partId).trim() : null,
        operationId ? Number(operationId) : null,
        dimensionId ? Number(dimensionId) : null,
        jobId ? String(jobId).trim() : null,
        recordId ? Number(recordId) : null,
        userIdNum,
        submittedByRole
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put("/:id/complete", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId, resolutionNote } = req.body || {};
    const actorUserId = getActorUserId(req);
    const suppliedUserId = Number(userId);
    const userIdNum = Number.isInteger(actorUserId) ? actorUserId : suppliedUserId;
    if (!Number.isInteger(userIdNum)) {
      return res.status(400).json({ error: "user_required" });
    }
    if (Number.isInteger(actorUserId) && Number.isInteger(suppliedUserId) && suppliedUserId !== actorUserId) {
      return res.status(403).json({ error: "auth_user_mismatch" });
    }
    const userRes = await query("SELECT id FROM users WHERE id=$1", [userIdNum]);
    if (!userRes.rows[0]) return res.status(400).json({ error: "user_not_found" });
    const { rows } = await query(
      `UPDATE issue_reports
       SET status='completed',
           resolved_by_user_id=$1,
           resolved_at=NOW(),
           resolution_note=$2
       WHERE id=$3
       RETURNING *`,
      [userIdNum, resolutionNote ? String(resolutionNote).trim() : null, id]
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/capa", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const issueId = Number(req.params.id);
    if (!Number.isInteger(issueId) || issueId <= 0) {
      return res.status(400).json({ error: "invalid_issue_id" });
    }

    const { userId, title, severity, ownerUserId, dueAt } = req.body || {};
    const problemStatement = String(req.body?.problemStatement || req.body?.details || "").trim();
    const trimmedTitle = String(title || "").trim();
    const normalizedSeverity = normalizeCapaSeverity(severity);
    const ownerUserIdNum = ownerUserId ? Number(ownerUserId) : null;
    const dueAtIso = dueAt ? new Date(dueAt).toISOString() : null;

    if (!trimmedTitle) return res.status(400).json({ error: "title_required" });
    if (dueAt && Number.isNaN(Date.parse(dueAt))) return res.status(400).json({ error: "invalid_due_at" });
    if (ownerUserId !== undefined && ownerUserId !== null && !Number.isInteger(ownerUserIdNum)) {
      return res.status(400).json({ error: "invalid_owner_user_id" });
    }

    const { actorUserId, suppliedUserId, effectiveUserId } = resolveActingUserId(req, userId);
    if (!Number.isInteger(effectiveUserId)) return res.status(400).json({ error: "user_required" });
    if (Number.isInteger(actorUserId) && Number.isInteger(suppliedUserId) && suppliedUserId !== actorUserId) {
      return res.status(403).json({ error: "auth_user_mismatch" });
    }

    const issueRes = await query("SELECT id FROM issue_reports WHERE id=$1", [issueId]);
    if (!issueRes.rows[0]) return res.status(404).json({ error: "issue_not_found" });

    if (ownerUserIdNum) {
      const ownerRes = await query("SELECT id FROM users WHERE id=$1", [ownerUserIdNum]);
      if (!ownerRes.rows[0]) return res.status(400).json({ error: "owner_user_not_found" });
    }

    const insert = await query(
      `INSERT INTO capa_events
         (issue_report_id, status, severity, title, problem_statement, owner_user_id, due_at, created_by_user_id)
       VALUES ($1,'open',$2,$3,$4,$5,$6,$7)
       ON CONFLICT (issue_report_id) DO NOTHING
       RETURNING *`,
      [issueId, normalizedSeverity, trimmedTitle, problemStatement || null, ownerUserIdNum, dueAtIso, effectiveUserId]
    );
    if (!insert.rows[0]) return res.status(409).json({ error: "capa_already_exists" });

    const capa = insert.rows[0];
    await query(
      `INSERT INTO capa_event_transitions
         (capa_event_id, from_status, to_status, note, actor_user_id, actor_role)
       VALUES ($1, NULL, 'open', $2, $3, $4)`,
      [capa.id, "capa_created", effectiveUserId, getActorRole(req)]
    );

    res.status(201).json(capa);
  } catch (err) {
    next(err);
  }
});

router.get("/capa", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const status = req.query.status ? normalizeCapaStatus(req.query.status) : null;
    if (req.query.status && !status) return res.status(400).json({ error: "invalid_status" });
    const severity = req.query.severity ? normalizeCapaSeverity(req.query.severity, "") : null;
    if (req.query.severity && !severity) return res.status(400).json({ error: "invalid_severity" });

    const filters = [];
    const params = [];
    if (status) {
      params.push(status);
      filters.push(`ce.status=$${params.length}`);
    }
    if (severity) {
      params.push(severity);
      filters.push(`ce.severity=$${params.length}`);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const { rows } = await query(
      `SELECT ce.*, ir.category AS issue_category, ir.status AS issue_status
       FROM capa_events ce
       JOIN issue_reports ir ON ir.id = ce.issue_report_id
       ${where}
       ORDER BY ce.updated_at DESC, ce.id DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get("/capa/:capaId/documents", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const documents = await listControlledDocumentsForCapa(req.params.capaId);
    res.json({ documents });
  } catch (err) {
    if (handleControlledDocumentError(res, err)) return;
    next(err);
  }
});

router.post("/capa/:capaId/documents", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const actorRole = getActorRole(req);
    const roleError = ensureRoleAllowed(CONTROLLED_DOCUMENT_AUTHOR_ROLES, actorRole);
    if (roleError) return res.status(403).json({ error: roleError });

    const { actorUserId, suppliedUserId, effectiveUserId } = resolveActingUserId(req, req.body?.userId);
    if (!Number.isInteger(effectiveUserId)) return res.status(400).json({ error: "user_required" });
    if (Number.isInteger(actorUserId) && Number.isInteger(suppliedUserId) && suppliedUserId !== actorUserId) {
      return res.status(403).json({ error: "auth_user_mismatch" });
    }

    const document = await createControlledDocument({
      capaEventId: req.params.capaId,
      documentNumber: req.body?.documentNumber,
      documentType: req.body?.documentType,
      title: req.body?.title,
      content: req.body?.content,
      changeReason: req.body?.changeReason,
      actorUserId: effectiveUserId,
      actorRole
    });
    res.status(201).json(document);
  } catch (err) {
    if (handleControlledDocumentError(res, err)) return;
    next(err);
  }
});

router.get("/documents/:documentId", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const document = await getControlledDocumentDetail(req.params.documentId);
    if (!document) return res.status(404).json({ error: "not_found" });
    res.json(document);
  } catch (err) {
    if (handleControlledDocumentError(res, err)) return;
    next(err);
  }
});

router.post("/documents/:documentId/revisions", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const actorRole = getActorRole(req);
    const roleError = ensureRoleAllowed(CONTROLLED_DOCUMENT_AUTHOR_ROLES, actorRole);
    if (roleError) return res.status(403).json({ error: roleError });

    const { actorUserId, suppliedUserId, effectiveUserId } = resolveActingUserId(req, req.body?.userId);
    if (!Number.isInteger(effectiveUserId)) return res.status(400).json({ error: "user_required" });
    if (Number.isInteger(actorUserId) && Number.isInteger(suppliedUserId) && suppliedUserId !== actorUserId) {
      return res.status(403).json({ error: "auth_user_mismatch" });
    }

    const document = await createControlledDocumentRevision({
      documentId: req.params.documentId,
      title: req.body?.title,
      content: req.body?.content,
      changeReason: req.body?.changeReason,
      actorUserId: effectiveUserId,
      actorRole
    });
    res.status(201).json(document);
  } catch (err) {
    if (handleControlledDocumentError(res, err)) return;
    next(err);
  }
});

router.post("/documents/:documentId/revisions/:revisionId/approve", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const actorRole = getActorRole(req);
    const roleError = ensureRoleAllowed(CONTROLLED_DOCUMENT_APPROVER_ROLES, actorRole);
    if (roleError) return res.status(403).json({ error: roleError });

    const { actorUserId, suppliedUserId, effectiveUserId } = resolveActingUserId(req, req.body?.userId);
    if (!Number.isInteger(effectiveUserId)) return res.status(400).json({ error: "user_required" });
    if (Number.isInteger(actorUserId) && Number.isInteger(suppliedUserId) && suppliedUserId !== actorUserId) {
      return res.status(403).json({ error: "auth_user_mismatch" });
    }

    const document = await approveControlledDocumentRevision({
      documentId: req.params.documentId,
      revisionId: req.params.revisionId,
      actorUserId: effectiveUserId,
      actorRole,
      reason: req.body?.reason
    });
    res.json(document);
  } catch (err) {
    if (handleControlledDocumentError(res, err)) return;
    next(err);
  }
});

router.post("/documents/:documentId/revisions/:revisionId/release", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const actorRole = getActorRole(req);
    const roleError = ensureRoleAllowed(CONTROLLED_DOCUMENT_RELEASER_ROLES, actorRole);
    if (roleError) return res.status(403).json({ error: roleError });

    const { actorUserId, suppliedUserId, effectiveUserId } = resolveActingUserId(req, req.body?.userId);
    if (!Number.isInteger(effectiveUserId)) return res.status(400).json({ error: "user_required" });
    if (Number.isInteger(actorUserId) && Number.isInteger(suppliedUserId) && suppliedUserId !== actorUserId) {
      return res.status(403).json({ error: "auth_user_mismatch" });
    }

    const document = await releaseControlledDocumentRevision({
      documentId: req.params.documentId,
      revisionId: req.params.revisionId,
      actorUserId: effectiveUserId,
      actorRole,
      reason: req.body?.reason
    });
    res.json(document);
  } catch (err) {
    if (handleControlledDocumentError(res, err)) return;
    next(err);
  }
});

router.get("/capa/:capaId", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const capaId = Number(req.params.capaId);
    if (!Number.isInteger(capaId) || capaId <= 0) return res.status(400).json({ error: "invalid_capa_id" });

    const capaRes = await query(
      `SELECT ce.*, ir.category AS issue_category, ir.status AS issue_status
       FROM capa_events ce
       JOIN issue_reports ir ON ir.id = ce.issue_report_id
       WHERE ce.id=$1`,
      [capaId]
    );
    const capa = capaRes.rows[0];
    if (!capa) return res.status(404).json({ error: "not_found" });

    const [transitionRes, controlledDocuments] = await Promise.all([
      query(
        `SELECT *
         FROM capa_event_transitions
         WHERE capa_event_id=$1
         ORDER BY created_at ASC, id ASC`,
        [capaId]
      ),
      listControlledDocumentsForCapa(capaId)
    ]);

    res.json({
      ...capa,
      transitions: transitionRes.rows,
      controlledDocuments
    });
  } catch (err) {
    next(err);
  }
});

router.put("/capa/:capaId", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const capaId = Number(req.params.capaId);
    if (!Number.isInteger(capaId) || capaId <= 0) return res.status(400).json({ error: "invalid_capa_id" });

    const severity = req.body?.severity !== undefined ? normalizeCapaSeverity(req.body?.severity, "") : null;
    if (req.body?.severity !== undefined && !severity) return res.status(400).json({ error: "invalid_severity" });

    const ownerUserId = req.body?.ownerUserId;
    const ownerUserIdNum = ownerUserId === undefined || ownerUserId === null || ownerUserId === ""
      ? null
      : Number(ownerUserId);
    if (ownerUserId !== undefined && ownerUserId !== null && ownerUserId !== "" && !Number.isInteger(ownerUserIdNum)) {
      return res.status(400).json({ error: "invalid_owner_user_id" });
    }
    if (ownerUserIdNum) {
      const ownerRes = await query("SELECT id FROM users WHERE id=$1", [ownerUserIdNum]);
      if (!ownerRes.rows[0]) return res.status(400).json({ error: "owner_user_not_found" });
    }

    const dueAt = req.body?.dueAt;
    if (dueAt && Number.isNaN(Date.parse(dueAt))) return res.status(400).json({ error: "invalid_due_at" });
    if (req.body?.title !== undefined && !String(req.body?.title || "").trim()) {
      return res.status(400).json({ error: "title_required" });
    }

    const updates = [];
    const params = [];
    const setIfPresent = (field, value) => {
      if (value === undefined) return;
      params.push(value);
      updates.push(`${field}=$${params.length}`);
    };

    setIfPresent("title", req.body?.title === undefined ? undefined : String(req.body?.title || "").trim());
    setIfPresent("severity", severity || undefined);
    setIfPresent("problem_statement", req.body?.problemStatement === undefined ? undefined : String(req.body?.problemStatement || "").trim() || null);
    setIfPresent("containment_plan", req.body?.containmentPlan === undefined ? undefined : String(req.body?.containmentPlan || "").trim() || null);
    setIfPresent("root_cause", req.body?.rootCause === undefined ? undefined : String(req.body?.rootCause || "").trim() || null);
    setIfPresent("corrective_action_plan", req.body?.correctiveActionPlan === undefined ? undefined : String(req.body?.correctiveActionPlan || "").trim() || null);
    setIfPresent("effectiveness_notes", req.body?.effectivenessNotes === undefined ? undefined : String(req.body?.effectivenessNotes || "").trim() || null);
    setIfPresent("owner_user_id", ownerUserId === undefined ? undefined : ownerUserIdNum);
    setIfPresent("due_at", dueAt === undefined ? undefined : (dueAt ? new Date(dueAt).toISOString() : null));
    updates.push("updated_at=NOW()");

    if (!updates.length) return res.status(400).json({ error: "no_changes" });

    params.push(capaId);
    const { rows } = await query(
      `UPDATE capa_events
       SET ${updates.join(", ")}
       WHERE id=$${params.length}
       RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post("/capa/:capaId/transition", requireCapability("view_admin"), async (req, res, next) => {
  try {
    const capaId = Number(req.params.capaId);
    if (!Number.isInteger(capaId) || capaId <= 0) return res.status(400).json({ error: "invalid_capa_id" });

    const nextStatus = normalizeCapaStatus(req.body?.toStatus || req.body?.status);
    if (!nextStatus) return res.status(400).json({ error: "invalid_status" });
    const note = String(req.body?.note || "").trim() || null;

    const { actorUserId, suppliedUserId, effectiveUserId } = resolveActingUserId(req, req.body?.userId);
    if (!Number.isInteger(effectiveUserId)) return res.status(400).json({ error: "user_required" });
    if (Number.isInteger(actorUserId) && Number.isInteger(suppliedUserId) && suppliedUserId !== actorUserId) {
      return res.status(403).json({ error: "auth_user_mismatch" });
    }

    const currentRes = await query("SELECT * FROM capa_events WHERE id=$1", [capaId]);
    const current = currentRes.rows[0];
    if (!current) return res.status(404).json({ error: "not_found" });

    const fromStatus = normalizeCapaStatus(current.status) || "open";
    const actorRole = getActorRole(req);
    if (fromStatus === nextStatus) return res.status(400).json({ error: "no_status_change" });
    if (!CAPA_ALLOWED_TRANSITIONS[fromStatus]?.has(nextStatus)) {
      return res.status(400).json({ error: "invalid_transition" });
    }
    const roleError = ensureCapaTransitionRole(nextStatus, actorRole);
    if (roleError) return res.status(403).json({ error: roleError });
    const requirementError = ensureCapaTransitionRequirements(current, nextStatus);
    if (requirementError) return res.status(400).json({ error: requirementError });

    const isClosed = nextStatus === "closed";
    const { rows } = await query(
      `UPDATE capa_events
       SET status=$1,
           updated_at=NOW(),
           last_transition_at=NOW(),
           closed_at=CASE WHEN $1='closed' THEN NOW() ELSE NULL END,
           closed_by_user_id=CASE WHEN $1='closed' THEN $3::INTEGER ELSE NULL END
       WHERE id=$2
       RETURNING *`,
      [nextStatus, capaId, isClosed ? effectiveUserId : null]
    );
    const updated = rows[0];

    await query(
      `INSERT INTO capa_event_transitions
         (capa_event_id, from_status, to_status, note, actor_user_id, actor_role)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [capaId, fromStatus, nextStatus, note, effectiveUserId, actorRole]
    );

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;

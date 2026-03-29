import { Router } from "express";
import { query, pool } from "../db.js";
import { requireAuthenticated, getActorRole, getActorUserId } from "../middleware/authSession.js";

const router = Router();

const QUALITY_ROLES = new Set(["Quality", "Supervisor", "Admin"]);
const ADMIN_ONLY = new Set(["Admin"]);

function toPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function requireRole(req, res, allowedRoles) {
  const role = getActorRole(req);
  if (!allowedRoles.has(role)) {
    res.status(403).json({ error: "forbidden" });
    return false;
  }
  return true;
}

function renderTemplate(template, values = {}) {
  return String(template || "")
    .replaceAll("{{customer}}", String(values.customer || ""))
    .replaceAll("{{po}}", String(values.po || ""))
    .replaceAll("{{spec}}", String(values.spec || ""));
}

// BL-110 Controlled document register
router.get("/documents", requireAuthenticated, async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT d.id, d.document_number, d.title, d.category, d.status, d.current_revision_id, d.created_at, d.updated_at,
              r.revision_code AS current_revision_code
       FROM controlled_documents d
       LEFT JOIN document_revisions r ON r.id = d.current_revision_id
       ORDER BY d.updated_at DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/documents", requireAuthenticated, async (req, res, next) => {
  try {
    if (!requireRole(req, res, QUALITY_ROLES)) return;
    const documentNumber = String(req.body?.documentNumber || "").trim();
    const title = String(req.body?.title || "").trim();
    if (!documentNumber || !title) {
      return res.status(400).json({ error: "document_number_and_title_required" });
    }

    const actor = getActorUserId(req);
    const { rows } = await query(
      `INSERT INTO controlled_documents
         (document_number, title, category, status, created_by_user_id)
       VALUES ($1, $2, $3, 'draft', $4)
       RETURNING id, document_number, title, category, status, current_revision_id, created_at, updated_at`,
      [documentNumber, title, req.body?.category ? String(req.body.category).trim() : null, actor]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post("/documents/:id/revisions", requireAuthenticated, async (req, res, next) => {
  try {
    if (!requireRole(req, res, QUALITY_ROLES)) return;
    const documentId = toPositiveInt(req.params.id);
    if (!documentId) return res.status(400).json({ error: "invalid_id" });

    const revisionCode = String(req.body?.revisionCode || "").trim();
    if (!revisionCode) return res.status(400).json({ error: "revision_code_required" });

    const actor = getActorUserId(req);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rowCount } = await client.query(
        "SELECT 1 FROM controlled_documents WHERE id = $1 FOR UPDATE",
        [documentId]
      );
      if (rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "document_not_found" });
      }

      const { rows: revisionRows } = await client.query(
        `INSERT INTO document_revisions
           (document_id, revision_code, file_name, file_data_base64, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, document_id, revision_code, file_name, is_obsolete, created_at`,
        [
          documentId,
          revisionCode,
          req.body?.fileName ? String(req.body.fileName).trim() : null,
          req.body?.fileDataBase64 ? String(req.body.fileDataBase64) : null,
          actor
        ]
      );

      await client.query(
        `UPDATE controlled_documents
         SET current_revision_id = $2, status = 'pending_approval', updated_at = NOW()
         WHERE id = $1`,
        [documentId, revisionRows[0].id]
      );

      await client.query("COMMIT");
      return res.status(201).json(revisionRows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post("/documents/:id/approve", requireAuthenticated, async (req, res, next) => {
  try {
    if (!requireRole(req, res, QUALITY_ROLES)) return;
    const documentId = toPositiveInt(req.params.id);
    if (!documentId) return res.status(400).json({ error: "invalid_id" });

    const decision = String(req.body?.decision || "").trim().toLowerCase();
    if (!["approved", "rejected"].includes(decision)) {
      return res.status(400).json({ error: "invalid_decision" });
    }

    const actor = getActorUserId(req);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        "SELECT current_revision_id FROM controlled_documents WHERE id = $1 FOR UPDATE",
        [documentId]
      );
      if (rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "document_not_found" });
      }
      if (!rows[0].current_revision_id) {
        await client.query("ROLLBACK");
        return res.status(422).json({ error: "no_current_revision" });
      }

      await client.query(
        `INSERT INTO document_approvals
           (document_revision_id, approver_user_id, decision, notes)
         VALUES ($1, $2, $3, $4)`,
        [
          rows[0].current_revision_id,
          actor,
          decision,
          req.body?.notes ? String(req.body.notes).trim() : null
        ]
      );

      await client.query(
        `UPDATE controlled_documents
         SET status = $2, updated_at = NOW()
         WHERE id = $1`,
        [documentId, decision === "approved" ? "approved" : "draft"]
      );

      await client.query("COMMIT");
      res.json({ ok: true, decision });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post("/documents/:id/links", requireAuthenticated, async (req, res, next) => {
  try {
    if (!requireRole(req, res, QUALITY_ROLES)) return;
    const documentId = toPositiveInt(req.params.id);
    const operationId = toPositiveInt(req.body?.operationId);
    const dimensionId = toPositiveInt(req.body?.dimensionId);
    if (!documentId) return res.status(400).json({ error: "invalid_id" });
    if (!operationId && !dimensionId) {
      return res.status(400).json({ error: "operation_or_dimension_required" });
    }

    const actor = getActorUserId(req);
    const { rows } = await query(
      `INSERT INTO document_links
         (document_id, operation_id, dimension_id, created_by_user_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, document_id, operation_id, dimension_id, created_at`,
      [documentId, operationId, dimensionId, actor]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// BL-111 Supplier quality baseline
router.get("/suppliers", requireAuthenticated, async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, supplier_code, name, status, contact_name, contact_email, notes, created_at, updated_at
       FROM suppliers
       ORDER BY name ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/suppliers", requireAuthenticated, async (req, res, next) => {
  try {
    if (!requireRole(req, res, QUALITY_ROLES)) return;
    const supplierCode = String(req.body?.supplierCode || "").trim();
    const name = String(req.body?.name || "").trim();
    if (!supplierCode || !name) {
      return res.status(400).json({ error: "supplier_code_and_name_required" });
    }

    const { rows } = await query(
      `INSERT INTO suppliers
         (supplier_code, name, status, contact_name, contact_email, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, supplier_code, name, status, contact_name, contact_email, notes, created_at, updated_at`,
      [
        supplierCode,
        name,
        req.body?.status ? String(req.body.status).trim() : "approved",
        req.body?.contactName ? String(req.body.contactName).trim() : null,
        req.body?.contactEmail ? String(req.body.contactEmail).trim() : null,
        req.body?.notes ? String(req.body.notes).trim() : null
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post("/suppliers/:id/items", requireAuthenticated, async (req, res, next) => {
  try {
    if (!requireRole(req, res, QUALITY_ROLES)) return;
    const supplierId = toPositiveInt(req.params.id);
    const partId = String(req.body?.partId || "").trim();
    if (!supplierId || !partId) return res.status(400).json({ error: "supplier_id_and_part_id_required" });

    const { rows } = await query(
      `INSERT INTO supplier_items (supplier_id, part_id, item_code, active)
       VALUES ($1, $2, $3, true)
       RETURNING id, supplier_id, part_id, item_code, active, created_at`,
      [supplierId, partId, req.body?.itemCode ? String(req.body.itemCode).trim() : null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post("/suppliers/:id/inspections", requireAuthenticated, async (req, res, next) => {
  try {
    if (!requireRole(req, res, QUALITY_ROLES)) return;
    const supplierId = toPositiveInt(req.params.id);
    if (!supplierId) return res.status(400).json({ error: "invalid_id" });

    const received = Number(req.body?.receivedQuantity ?? -1);
    const inspected = Number(req.body?.inspectedQuantity ?? -1);
    const accepted = Number(req.body?.acceptedQuantity ?? -1);
    const rejected = Number(req.body?.rejectedQuantity ?? -1);
    if ([received, inspected, accepted, rejected].some((n) => !Number.isInteger(n) || n < 0)) {
      return res.status(400).json({ error: "invalid_quantities" });
    }

    const { rows } = await query(
      `INSERT INTO incoming_inspections
         (supplier_id, supplier_item_id, received_quantity, inspected_quantity, accepted_quantity, rejected_quantity,
          status, linked_ncr_id, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, supplier_id, supplier_item_id, received_quantity, inspected_quantity, accepted_quantity, rejected_quantity,
                 status, linked_ncr_id, inspection_date, created_at`,
      [
        supplierId,
        toPositiveInt(req.body?.supplierItemId),
        received,
        inspected,
        accepted,
        rejected,
        req.body?.status ? String(req.body.status).trim() : (rejected > 0 ? "rejected" : "accepted"),
        toPositiveInt(req.body?.linkedNcrId),
        getActorUserId(req)
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get("/suppliers/:id/scorecard", requireAuthenticated, async (req, res, next) => {
  try {
    const supplierId = toPositiveInt(req.params.id);
    if (!supplierId) return res.status(400).json({ error: "invalid_id" });

    const { rows } = await query(
      `SELECT
         COUNT(*)::int AS inspections,
         COALESCE(SUM(accepted_quantity), 0)::int AS accepted_quantity,
         COALESCE(SUM(rejected_quantity), 0)::int AS rejected_quantity,
         COUNT(*) FILTER (WHERE linked_ncr_id IS NOT NULL)::int AS ncr_count
       FROM incoming_inspections
       WHERE supplier_id = $1`,
      [supplierId]
    );

    const item = rows[0] || { inspections: 0, accepted_quantity: 0, rejected_quantity: 0, ncr_count: 0 };
    const total = Number(item.accepted_quantity) + Number(item.rejected_quantity);
    const acceptanceRate = total > 0 ? Number(((Number(item.accepted_quantity) / total) * 100).toFixed(2)) : 0;

    res.json({
      supplierId,
      inspections: Number(item.inspections),
      acceptedQuantity: Number(item.accepted_quantity),
      rejectedQuantity: Number(item.rejected_quantity),
      acceptanceRate,
      ncrCount: Number(item.ncr_count)
    });
  } catch (err) {
    next(err);
  }
});

// BL-112 Internal audit management
router.get("/internal-audits/programs", requireAuthenticated, async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, name, scope, cadence, active, created_at
       FROM audit_programs
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/internal-audits/programs", requireAuthenticated, async (req, res, next) => {
  try {
    if (!requireRole(req, res, QUALITY_ROLES)) return;
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "name_required" });

    const { rows } = await query(
      `INSERT INTO audit_programs (name, scope, cadence, active, created_by_user_id)
       VALUES ($1, $2, $3, true, $4)
       RETURNING id, name, scope, cadence, active, created_at`,
      [
        name,
        req.body?.scope ? String(req.body.scope).trim() : null,
        req.body?.cadence ? String(req.body.cadence).trim() : null,
        getActorUserId(req)
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post("/internal-audits/schedules", requireAuthenticated, async (req, res, next) => {
  try {
    if (!requireRole(req, res, QUALITY_ROLES)) return;
    const programId = toPositiveInt(req.body?.programId);
    const title = String(req.body?.title || "").trim();
    const scheduledFor = String(req.body?.scheduledFor || "").trim();
    if (!programId || !title || !scheduledFor) {
      return res.status(400).json({ error: "program_title_schedule_required" });
    }

    const { rows } = await query(
      `INSERT INTO audit_schedules (program_id, title, scheduled_for, lead_auditor_user_id, status)
       VALUES ($1, $2, $3, $4, 'scheduled')
       RETURNING id, program_id, title, scheduled_for, lead_auditor_user_id, status, created_at`,
      [programId, title, scheduledFor, toPositiveInt(req.body?.leadAuditorUserId)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post("/internal-audits/schedules/:id/checklist", requireAuthenticated, async (req, res, next) => {
  try {
    if (!requireRole(req, res, QUALITY_ROLES)) return;
    const scheduleId = toPositiveInt(req.params.id);
    const prompt = String(req.body?.prompt || "").trim();
    if (!scheduleId || !prompt) return res.status(400).json({ error: "invalid_input" });

    const { rows } = await query(
      `INSERT INTO audit_checklist_items (schedule_id, clause_ref, prompt, result, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, schedule_id, clause_ref, prompt, result, notes, created_at`,
      [
        scheduleId,
        req.body?.clauseRef ? String(req.body.clauseRef).trim() : null,
        prompt,
        req.body?.result ? String(req.body.result).trim() : null,
        req.body?.notes ? String(req.body.notes).trim() : null
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post("/internal-audits/schedules/:id/findings", requireAuthenticated, async (req, res, next) => {
  try {
    if (!requireRole(req, res, QUALITY_ROLES)) return;
    const scheduleId = toPositiveInt(req.params.id);
    const severity = String(req.body?.severity || "").trim();
    const description = String(req.body?.description || "").trim();
    if (!scheduleId || !["minor_nc", "major_nc", "observation"].includes(severity) || !description) {
      return res.status(400).json({ error: "invalid_finding" });
    }

    const { rows } = await query(
      `INSERT INTO audit_findings (schedule_id, checklist_item_id, severity, description, linked_capa_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, schedule_id, checklist_item_id, severity, description, linked_capa_id, created_at`,
      [
        scheduleId,
        toPositiveInt(req.body?.checklistItemId),
        severity,
        description,
        toPositiveInt(req.body?.linkedCapaId)
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post("/internal-audits/schedules/:id/report", requireAuthenticated, async (req, res, next) => {
  try {
    if (!requireRole(req, res, QUALITY_ROLES)) return;
    const scheduleId = toPositiveInt(req.params.id);
    if (!scheduleId) return res.status(400).json({ error: "invalid_id" });

    const { rows: scheduleRows } = await query(
      `SELECT id, title, scheduled_for, status
       FROM audit_schedules
       WHERE id = $1`,
      [scheduleId]
    );
    if (scheduleRows.length === 0) return res.status(404).json({ error: "schedule_not_found" });

    const { rows: findingRows } = await query(
      `SELECT severity, description
       FROM audit_findings
       WHERE schedule_id = $1
       ORDER BY created_at ASC`,
      [scheduleId]
    );

    const reportText = [
      "Internal Audit Report",
      `Schedule: ${scheduleRows[0].title}`,
      `Scheduled: ${scheduleRows[0].scheduled_for}`,
      `Status: ${scheduleRows[0].status}`,
      `Findings: ${findingRows.length}`,
      ...findingRows.map((item, idx) => `${idx + 1}. [${item.severity}] ${item.description}`)
    ].join("\n");

    const { rows } = await query(
      `INSERT INTO audit_reports (schedule_id, report_text, generated_by_user_id)
       VALUES ($1, $2, $3)
       RETURNING id, schedule_id, report_text, generated_at`,
      [scheduleId, reportText, getActorUserId(req)]
    );

    await query("UPDATE audit_schedules SET status='completed' WHERE id=$1", [scheduleId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// BL-113 Training and competency
router.get("/training/courses", requireAuthenticated, async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, code, title, refresh_interval_days, active, created_at
       FROM training_courses
       ORDER BY code ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/training/courses", requireAuthenticated, async (req, res, next) => {
  try {
    if (!requireRole(req, res, QUALITY_ROLES)) return;
    const code = String(req.body?.code || "").trim();
    const title = String(req.body?.title || "").trim();
    if (!code || !title) return res.status(400).json({ error: "code_and_title_required" });

    const { rows } = await query(
      `INSERT INTO training_courses (code, title, refresh_interval_days, active)
       VALUES ($1, $2, $3, true)
       RETURNING id, code, title, refresh_interval_days, active, created_at`,
      [code, title, toPositiveInt(req.body?.refreshIntervalDays)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post("/training/records", requireAuthenticated, async (req, res, next) => {
  try {
    if (!requireRole(req, res, QUALITY_ROLES)) return;
    const userId = toPositiveInt(req.body?.userId);
    const courseId = toPositiveInt(req.body?.courseId);
    const completedAt = String(req.body?.completedAt || "").trim();
    if (!userId || !courseId || !completedAt) {
      return res.status(400).json({ error: "user_course_completed_required" });
    }

    const { rows } = await query(
      `INSERT INTO training_records
         (user_id, course_id, completed_at, expires_at, certificate_ref, recorded_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, course_id, completed_at, expires_at, certificate_ref, created_at`,
      [
        userId,
        courseId,
        completedAt,
        req.body?.expiresAt ? String(req.body.expiresAt).trim() : null,
        req.body?.certificateRef ? String(req.body.certificateRef).trim() : null,
        getActorUserId(req)
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post("/training/requirements", requireAuthenticated, async (req, res, next) => {
  try {
    if (!requireRole(req, res, QUALITY_ROLES)) return;
    const operationId = toPositiveInt(req.body?.operationId);
    const courseId = toPositiveInt(req.body?.courseId);
    if (!operationId || !courseId) return res.status(400).json({ error: "operation_and_course_required" });

    const { rows } = await query(
      `INSERT INTO operation_training_requirements (operation_id, course_id, required)
       VALUES ($1, $2, true)
       ON CONFLICT (operation_id, course_id) DO UPDATE SET required=true
       RETURNING id, operation_id, course_id, required, created_at`,
      [operationId, courseId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get("/training/matrix", requireAuthenticated, async (req, res, next) => {
  try {
    const operationId = toPositiveInt(req.query.operationId);
    if (!operationId) return res.status(400).json({ error: "operation_id_required" });

    const { rows } = await query(
      `SELECT u.id AS user_id,
              u.name AS user_name,
              c.id AS course_id,
              c.code AS course_code,
              c.title AS course_title,
              tr.completed_at,
              tr.expires_at,
              CASE
                WHEN tr.id IS NULL THEN 'missing'
                WHEN tr.expires_at IS NOT NULL AND tr.expires_at < NOW() THEN 'expired'
                ELSE 'current'
              END AS status
       FROM operation_training_requirements otr
       JOIN training_courses c ON c.id = otr.course_id
       CROSS JOIN users u
       LEFT JOIN LATERAL (
         SELECT id, completed_at, expires_at
         FROM training_records
         WHERE user_id = u.id AND course_id = c.id
         ORDER BY completed_at DESC
         LIMIT 1
       ) tr ON true
       WHERE otr.operation_id = $1 AND u.active = true
       ORDER BY u.name ASC, c.code ASC`,
      [operationId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// BL-114 Certificate of conformance
router.get("/coc", requireAuthenticated, async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, coc_number, record_id, fai_package_id, customer_name, purchase_order, spec_reference,
              status, void_reason, created_at, voided_at
       FROM certificates_of_conformance
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/coc", requireAuthenticated, async (req, res, next) => {
  try {
    if (!requireRole(req, res, QUALITY_ROLES)) return;
    const template = String(req.body?.statementTemplate || "").trim() || "Conformance for {{customer}} / PO {{po}} per {{spec}}.";
    const rendered = renderTemplate(template, {
      customer: req.body?.customerName,
      po: req.body?.purchaseOrder,
      spec: req.body?.specReference
    });

    const { rows } = await query(
      `WITH serial AS (
         SELECT LPAD((COALESCE(MAX(id), 0) + 1)::text, 6, '0') AS seq
         FROM certificates_of_conformance
       )
       INSERT INTO certificates_of_conformance
         (coc_number, record_id, fai_package_id, customer_name, purchase_order, spec_reference,
          statement_template, statement_rendered, status, created_by_user_id)
       SELECT
         CONCAT('COC-', TO_CHAR(NOW(), 'YYYYMMDD'), '-', serial.seq),
         $1, $2, $3, $4, $5, $6, $7, 'issued', $8
       FROM serial
       RETURNING id, coc_number, record_id, fai_package_id, customer_name, purchase_order, spec_reference,
                 statement_template, statement_rendered, status, created_at`,
      [
        toPositiveInt(req.body?.recordId),
        toPositiveInt(req.body?.faiPackageId),
        req.body?.customerName ? String(req.body.customerName).trim() : null,
        req.body?.purchaseOrder ? String(req.body.purchaseOrder).trim() : null,
        req.body?.specReference ? String(req.body.specReference).trim() : null,
        template,
        rendered,
        getActorUserId(req)
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post("/coc/:id/void", requireAuthenticated, async (req, res, next) => {
  try {
    if (!requireRole(req, res, ADMIN_ONLY)) return;
    const id = toPositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid_id" });
    const reason = String(req.body?.reason || "").trim();
    if (!reason) return res.status(400).json({ error: "void_reason_required" });

    const { rows } = await query(
      `UPDATE certificates_of_conformance
       SET status='void', void_reason=$2, voided_at=NOW()
       WHERE id = $1
       RETURNING id, coc_number, status, void_reason, voided_at`,
      [id, reason]
    );
    if (rows.length === 0) return res.status(404).json({ error: "coc_not_found" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;

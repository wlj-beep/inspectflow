import { Router } from "express";
import { query } from "../db.js";
import { requireAnyCapability, requireCapability } from "../middleware/requireCapability.js";

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
    const userIdNum = Number(userId);
    if (!trimmedCategory || !trimmedDetails || !Number.isInteger(userIdNum)) {
      return res.status(400).json({ error: "required_fields_missing" });
    }
    if (!VALID_CATEGORIES.includes(trimmedCategory)) {
      return res.status(400).json({ error: "invalid_category" });
    }
    const userRes = await query("SELECT id FROM users WHERE id=$1", [userIdNum]);
    if (!userRes.rows[0]) return res.status(400).json({ error: "user_not_found" });

    const submittedByRole = String(req.header("x-user-role") || "");
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
    const userIdNum = Number(userId);
    if (!Number.isInteger(userIdNum)) {
      return res.status(400).json({ error: "user_required" });
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

export default router;

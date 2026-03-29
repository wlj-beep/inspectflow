import { Router } from "express";
import { query } from "../db.js";
import { requireAuthenticated, getActorRole, getActorUserId } from "../middleware/authSession.js";

const router = Router();

const QUALITY_ROLES = ["Quality", "Admin"];
const ADMIN_ROLES = ["Admin"];
const SUPERVISOR_VOID_ROLES = ["Supervisor", "Admin"];
const VALID_DISPOSITIONS = ["use_as_is", "rework", "reject", "scrap", "return", "return_to_vendor", "other", "void"];
const NCR_COLUMNS = [
  "id",
  "title",
  "description",
  "status",
  "disposition",
  "disposition_notes",
  "record_id",
  "record_value_dimension_id",
  "record_value_piece_number",
  "part_id",
  "job_id",
  "created_by_user_id",
  "dispositioned_by_user_id",
  "closed_by_user_id",
  "created_at",
  "updated_at",
  "dispositioned_at",
  "closed_at"
];
const NCR_SELECT_COLUMNS = NCR_COLUMNS.map((column) => `n.${column}`).join(", ");

function isValidDisposition(value) {
  return VALID_DISPOSITIONS.includes(String(value || "").trim());
}

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

async function emitNcrAuditEvent(client, {
  ncrId,
  eventType,
  actorUserId,
  actorRole,
  fromStatus,
  toStatus,
  notes,
  metadata
}) {
  await client.query(
    `INSERT INTO ncr_audit_log
       (ncr_id, event_type, actor_user_id, actor_role, from_status, to_status, notes, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      ncrId,
      eventType,
      actorUserId ?? null,
      actorRole ?? null,
      fromStatus ?? null,
      toStatus ?? null,
      notes ?? null,
      metadata ? JSON.stringify(metadata) : "{}"
    ]
  );
}

// POST / — Create NCR (Quality or Admin only)
router.post("/", requireAuthenticated, async (req, res, next) => {
  try {
    const actorRole = getActorRole(req);
    const actorUserId = getActorUserId(req);

    if (!QUALITY_ROLES.includes(actorRole)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const { title, description, recordId, partId, jobId, recordValueDimensionId, recordValuePieceNumber } = req.body || {};

    if (!title || String(title).trim().length === 0) {
      return res.status(400).json({ error: "title_required" });
    }

    const client = await (await import("../db.js")).pool.connect();
    try {
      await client.query("BEGIN");

      const insertResult = await client.query(
        `INSERT INTO nonconformances
           (title, description, status, record_id, record_value_dimension_id,
            record_value_piece_number, part_id, job_id, created_by_user_id)
         VALUES ($1, $2, 'open', $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          String(title).trim(),
          description ? String(description).trim() : null,
          recordId ? parsePositiveInt(recordId, null) : null,
          recordValueDimensionId ? parsePositiveInt(recordValueDimensionId, null) : null,
          recordValuePieceNumber ? parsePositiveInt(recordValuePieceNumber, null) : null,
          partId ? String(partId).trim() : null,
          jobId ? String(jobId).trim() : null,
          actorUserId
        ]
      );

      const ncr = insertResult.rows[0];

      await emitNcrAuditEvent(client, {
        ncrId: ncr.id,
        eventType: "ncr_created",
        actorUserId,
        actorRole,
        fromStatus: null,
        toStatus: "open",
        notes: null,
        metadata: {}
      });

      await client.query("COMMIT");
      return res.status(201).json(ncr);
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

// GET / — List NCRs
router.get("/", requireAuthenticated, async (req, res, next) => {
  try {
    const actorRole = getActorRole(req);
    const actorUserId = getActorUserId(req);

    const status = req.query.status ? String(req.query.status).trim() : null;
    const partId = req.query.partId ? String(req.query.partId).trim() : null;
    const jobId = req.query.jobId ? String(req.query.jobId).trim() : null;
    const page = parsePositiveInt(req.query.page, 1);
    const rawPageSize = parsePositiveInt(req.query.pageSize, 25);
    const pageSize = Math.min(rawPageSize, 100);
    const offset = (page - 1) * pageSize;

    const conditions = [];
    const params = [];

    // Role-based visibility: Operators see only NCRs for their job IDs
    if (actorRole === "Operator") {
      // Operators can only see NCRs linked to jobs they have records for
      params.push(actorUserId);
      conditions.push(`n.job_id IN (
        SELECT DISTINCT r.job_id FROM records r WHERE r.operator_user_id = $${params.length}
      )`);
    }

    if (status) {
      params.push(status);
      conditions.push(`n.status = $${params.length}`);
    }
    if (partId) {
      params.push(partId);
      conditions.push(`n.part_id = $${params.length}`);
    }
    if (jobId) {
      params.push(jobId);
      conditions.push(`n.job_id = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    params.push(pageSize);
    params.push(offset);

    const { rows } = await query(
      `SELECT ${NCR_SELECT_COLUMNS}
       FROM nonconformances n
       ${whereClause}
       ORDER BY n.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    // Count total matching rows
    const countParams = params.slice(0, params.length - 2);
    const { rows: countRows } = await query(
      `SELECT COUNT(*) AS total FROM nonconformances n ${whereClause}`,
      countParams
    );
    const total = parseInt(countRows[0].total, 10);

    return res.json({ total, page, pageSize, ncrs: rows });
  } catch (err) {
    next(err);
  }
});

// GET /dispositions — Enumerate valid disposition values for UI/API clients
router.get("/dispositions", requireAuthenticated, async (req, res) => {
  res.json({
    dispositions: VALID_DISPOSITIONS
      .filter((value) => value !== "void")
      .map((value) => ({
        value,
        label: value.replaceAll("_", " ")
      }))
  });
});

// GET /:id — Get single NCR with audit history
router.get("/:id", requireAuthenticated, async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id, null);
    if (!id) return res.status(400).json({ error: "invalid_id" });

    const { rows: ncrRows } = await query(
      `SELECT ${NCR_COLUMNS.join(", ")}
       FROM nonconformances
       WHERE id = $1`,
      [id]
    );
    if (ncrRows.length === 0) return res.status(404).json({ error: "ncr_not_found" });

    const { rows: auditRows } = await query(
      `SELECT id, ncr_id, event_type, actor_user_id, actor_role, from_status, to_status, notes, metadata, created_at FROM ncr_audit_log WHERE ncr_id = $1 ORDER BY created_at ASC`,
      [id]
    );

    return res.json({ ...ncrRows[0], auditLog: auditRows });
  } catch (err) {
    next(err);
  }
});

// POST /:id/pending-disposition — Transition open → pending_disposition (Quality or Admin)
router.post("/:id/pending-disposition", requireAuthenticated, async (req, res, next) => {
  try {
    const actorRole = getActorRole(req);
    const actorUserId = getActorUserId(req);

    if (!QUALITY_ROLES.includes(actorRole)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const id = parsePositiveInt(req.params.id, null);
    if (!id) return res.status(400).json({ error: "invalid_id" });

    const client = await (await import("../db.js")).pool.connect();
    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        `SELECT id, status
         FROM nonconformances
         WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "ncr_not_found" });
      }

      const ncr = rows[0];
      if (ncr.status !== "open") {
        await client.query("ROLLBACK");
        return res.status(422).json({ error: "invalid_ncr_transition" });
      }

      const { rows: updatedRows } = await client.query(
        `UPDATE nonconformances
         SET status = 'pending_disposition', updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id]
      );

      await emitNcrAuditEvent(client, {
        ncrId: id,
        eventType: "ncr_pending_disposition",
        actorUserId,
        actorRole,
        fromStatus: "open",
        toStatus: "pending_disposition",
        notes: null,
        metadata: {}
      });

      await client.query("COMMIT");
      return res.json(updatedRows[0]);
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

// POST /:id/disposition — Set disposition and transition to dispositioned (Quality or Admin)
router.post("/:id/disposition", requireAuthenticated, async (req, res, next) => {
  try {
    const actorRole = getActorRole(req);
    const actorUserId = getActorUserId(req);

    if (!QUALITY_ROLES.includes(actorRole)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const id = parsePositiveInt(req.params.id, null);
    if (!id) return res.status(400).json({ error: "invalid_id" });

    const { disposition, notes } = req.body || {};
    if (!disposition || !isValidDisposition(disposition) || String(disposition).trim() === "void") {
      return res.status(400).json({ error: "invalid_disposition" });
    }

    const client = await (await import("../db.js")).pool.connect();
    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        `SELECT id, status
         FROM nonconformances
         WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "ncr_not_found" });
      }

      const ncr = rows[0];
      if (ncr.status !== "pending_disposition") {
        await client.query("ROLLBACK");
        return res.status(422).json({ error: "invalid_ncr_transition" });
      }

      const { rows: updatedRows } = await client.query(
        `UPDATE nonconformances
         SET status = 'dispositioned',
             disposition = $2,
             disposition_notes = $3,
             dispositioned_by_user_id = $4,
             dispositioned_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, String(disposition).trim(), notes ? String(notes).trim() : null, actorUserId]
      );

      await emitNcrAuditEvent(client, {
        ncrId: id,
        eventType: "ncr_dispositioned",
        actorUserId,
        actorRole,
        fromStatus: "pending_disposition",
        toStatus: "dispositioned",
        notes: notes ? String(notes).trim() : null,
        metadata: { disposition: String(disposition).trim() }
      });

      await client.query("COMMIT");
      return res.json(updatedRows[0]);
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

// POST /:id/void — Supervisor/Admin void flow for active NCRs
router.post("/:id/void", requireAuthenticated, async (req, res, next) => {
  try {
    const actorRole = getActorRole(req);
    const actorUserId = getActorUserId(req);

    if (!SUPERVISOR_VOID_ROLES.includes(actorRole)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const id = parsePositiveInt(req.params.id, null);
    if (!id) return res.status(400).json({ error: "invalid_id" });

    const reason = String(req.body?.reason || "").trim();
    if (!reason) return res.status(400).json({ error: "void_reason_required" });

    const client = await (await import("../db.js")).pool.connect();
    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        `SELECT id, status
         FROM nonconformances
         WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "ncr_not_found" });
      }

      const ncr = rows[0];
      if (ncr.status === "closed") {
        await client.query("ROLLBACK");
        return res.status(422).json({ error: "invalid_ncr_transition" });
      }

      const { rows: updatedRows } = await client.query(
        `UPDATE nonconformances
         SET status = 'closed',
             disposition = 'void',
             disposition_notes = $2,
             closed_by_user_id = $3,
             closed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, reason, actorUserId]
      );

      await emitNcrAuditEvent(client, {
        ncrId: id,
        eventType: "ncr_voided",
        actorUserId,
        actorRole,
        fromStatus: ncr.status,
        toStatus: "closed",
        notes: reason,
        metadata: { disposition: "void" }
      });

      await client.query("COMMIT");
      return res.json(updatedRows[0]);
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

// POST /:id/close — Transition dispositioned → closed (Admin only)
router.post("/:id/close", requireAuthenticated, async (req, res, next) => {
  try {
    const actorRole = getActorRole(req);
    const actorUserId = getActorUserId(req);

    if (!ADMIN_ROLES.includes(actorRole)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const id = parsePositiveInt(req.params.id, null);
    if (!id) return res.status(400).json({ error: "invalid_id" });

    const client = await (await import("../db.js")).pool.connect();
    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        `SELECT id, status
         FROM nonconformances
         WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "ncr_not_found" });
      }

      const ncr = rows[0];
      if (ncr.status !== "dispositioned") {
        await client.query("ROLLBACK");
        return res.status(422).json({ error: "invalid_ncr_transition" });
      }

      const { rows: updatedRows } = await client.query(
        `UPDATE nonconformances
         SET status = 'closed',
             closed_by_user_id = $2,
             closed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, actorUserId]
      );

      await emitNcrAuditEvent(client, {
        ncrId: id,
        eventType: "ncr_closed",
        actorUserId,
        actorRole,
        fromStatus: "dispositioned",
        toStatus: "closed",
        notes: null,
        metadata: {}
      });

      await client.query("COMMIT");
      return res.json(updatedRows[0]);
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

export default router;

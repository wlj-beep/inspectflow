import { Router } from "express";
import { query, pool } from "../db.js";
import { requireAuthenticated, getActorRole, getActorUserId } from "../middleware/authSession.js";
import { normalizeIsoTimestamp } from "../services/dateValidation.js";

const router = Router();

const QUALITY_ROLES = ["Quality", "Supervisor", "Admin"];
const CAPA_STATUS = ["open", "in_progress", "effectiveness_verification", "closed"];
const CAPA_ACTION_STATUS = ["open", "in_progress", "done", "canceled"];
const ROOT_CAUSE_METHODS = ["5whys", "fishbone", "other"];

const CAPA_COLUMNS = [
  "id",
  "title",
  "problem_statement",
  "status",
  "source_ncr_id",
  "root_cause_method",
  "root_cause_details",
  "effectiveness_notes",
  "due_at",
  "created_by_user_id",
  "closed_by_user_id",
  "created_at",
  "updated_at",
  "closed_at"
];

function parsePositiveInt(value, fallback = null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function emitCapaAuditEvent(client, {
  capaId,
  eventType,
  actorUserId,
  actorRole,
  fromStatus,
  toStatus,
  notes,
  metadata
}) {
  await client.query(
    `INSERT INTO capa_audit_log
       (capa_id, event_type, actor_user_id, actor_role, from_status, to_status, notes, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      capaId,
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

router.get("/status-options", requireAuthenticated, (_req, res) => {
  res.json({
    statuses: CAPA_STATUS.map((value) => ({ value, label: value.replaceAll("_", " ") })),
    actionStatuses: CAPA_ACTION_STATUS.map((value) => ({ value, label: value.replaceAll("_", " ") })),
    rootCauseMethods: ROOT_CAUSE_METHODS.map((value) => ({ value, label: value }))
  });
});

router.get("/", requireAuthenticated, async (req, res, next) => {
  try {
    const status = String(req.query.status || "").trim();
    const sourceNcrId = parsePositiveInt(req.query.sourceNcrId, null);
    const overdueOnly = String(req.query.overdue || "").trim().toLowerCase() === "true";
    const page = parsePositiveInt(req.query.page, 1);
    const rawPageSize = parsePositiveInt(req.query.pageSize, 25);
    const pageSize = Math.min(rawPageSize, 100);
    const offset = (page - 1) * pageSize;

    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`c.status = $${params.length}`);
    }
    if (sourceNcrId) {
      params.push(sourceNcrId);
      conditions.push(`c.source_ncr_id = $${params.length}`);
    }
    if (overdueOnly) {
      conditions.push("c.due_at IS NOT NULL AND c.due_at < NOW() AND c.status <> 'closed'");
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    params.push(pageSize);
    params.push(offset);

    const { rows } = await query(
      `SELECT ${CAPA_COLUMNS.map((column) => `c.${column}`).join(", ")},
              COALESCE((SELECT COUNT(*)::int FROM capa_actions a WHERE a.capa_id = c.id AND a.status <> 'done'), 0) AS open_action_count,
              COALESCE((SELECT COUNT(*)::int FROM capa_actions a WHERE a.capa_id = c.id), 0) AS total_action_count
       FROM capa_records c
       ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countParams = params.slice(0, -2);
    const { rows: countRows } = await query(
      `SELECT COUNT(*) AS total FROM capa_records c ${whereClause}`,
      countParams
    );

    return res.json({
      total: Number.parseInt(countRows[0]?.total || "0", 10),
      page,
      pageSize,
      records: rows
    });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireAuthenticated, async (req, res, next) => {
  try {
    const actorRole = getActorRole(req);
    const actorUserId = getActorUserId(req);
    if (!QUALITY_ROLES.includes(actorRole)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ error: "title_required" });

    const rootCauseMethodRaw = String(req.body?.rootCauseMethod || "").trim();
    const rootCauseMethod = rootCauseMethodRaw ? rootCauseMethodRaw : null;
    if (rootCauseMethod && !ROOT_CAUSE_METHODS.includes(rootCauseMethod)) {
      return res.status(400).json({ error: "invalid_root_cause_method" });
    }

    const sourceNcrId = parsePositiveInt(req.body?.sourceNcrId, null);
    let dueAt = null;
    try {
      dueAt = normalizeIsoTimestamp(req.body?.dueAt, "due_at");
    } catch {
      return res.status(400).json({ error: "invalid_due_at" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO capa_records
          (title, problem_statement, status, source_ncr_id, root_cause_method, root_cause_details, due_at, created_by_user_id)
         VALUES ($1, $2, 'open', $3, $4, $5, $6, $7)
         RETURNING ${CAPA_COLUMNS.join(", ")}`,
        [
          title,
          req.body?.problemStatement ? String(req.body.problemStatement).trim() : null,
          sourceNcrId,
          rootCauseMethod,
          req.body?.rootCauseDetails ? String(req.body.rootCauseDetails).trim() : null,
          dueAt,
          actorUserId
        ]
      );

      await emitCapaAuditEvent(client, {
        capaId: rows[0].id,
        eventType: "capa_created",
        actorUserId,
        actorRole,
        fromStatus: null,
        toStatus: "open",
        notes: null,
        metadata: sourceNcrId ? { sourceNcrId } : {}
      });

      await client.query("COMMIT");
      return res.status(201).json(rows[0]);
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

router.get("/:id", requireAuthenticated, async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id, null);
    if (!id) return res.status(400).json({ error: "invalid_id" });

    const { rows: capaRows } = await query(
      `SELECT ${CAPA_COLUMNS.join(", ")} FROM capa_records WHERE id = $1`,
      [id]
    );
    if (capaRows.length === 0) return res.status(404).json({ error: "capa_not_found" });

    const { rows: actions } = await query(
      `SELECT id, capa_id, title, description, assignee_user_id, due_at, status, completed_at, created_at, updated_at
       FROM capa_actions
       WHERE capa_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    const { rows: auditLog } = await query(
      `SELECT id, capa_id, event_type, actor_user_id, actor_role, from_status, to_status, notes, metadata, created_at
       FROM capa_audit_log
       WHERE capa_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    return res.json({ ...capaRows[0], actions, auditLog });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/status", requireAuthenticated, async (req, res, next) => {
  try {
    const actorRole = getActorRole(req);
    const actorUserId = getActorUserId(req);
    if (!QUALITY_ROLES.includes(actorRole)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const id = parsePositiveInt(req.params.id, null);
    if (!id) return res.status(400).json({ error: "invalid_id" });

    const nextStatus = String(req.body?.status || "").trim();
    if (!CAPA_STATUS.includes(nextStatus)) {
      return res.status(400).json({ error: "invalid_status" });
    }

    const allowedTransitions = {
      open: ["in_progress"],
      in_progress: ["effectiveness_verification"],
      effectiveness_verification: ["closed"],
      closed: []
    };

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        `SELECT id, status
         FROM capa_records
         WHERE id = $1
         FOR UPDATE`,
        [id]
      );
      if (rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "capa_not_found" });
      }

      const currentStatus = rows[0].status;
      if (!allowedTransitions[currentStatus]?.includes(nextStatus)) {
        await client.query("ROLLBACK");
        return res.status(422).json({ error: "invalid_capa_transition" });
      }

      const closeValues = nextStatus === "closed"
        ? ", closed_by_user_id = $3, closed_at = NOW()"
        : "";
      const values = nextStatus === "closed"
        ? [id, nextStatus, actorUserId]
        : [id, nextStatus];

      const { rows: updatedRows } = await client.query(
        `UPDATE capa_records
         SET status = $2,
             updated_at = NOW()
             ${closeValues}
         WHERE id = $1
         RETURNING ${CAPA_COLUMNS.join(", ")}`,
        values
      );

      await emitCapaAuditEvent(client, {
        capaId: id,
        eventType: "capa_status_updated",
        actorUserId,
        actorRole,
        fromStatus: currentStatus,
        toStatus: nextStatus,
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

router.post("/:id/effectiveness", requireAuthenticated, async (req, res, next) => {
  try {
    const actorRole = getActorRole(req);
    const actorUserId = getActorUserId(req);
    if (!QUALITY_ROLES.includes(actorRole)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const id = parsePositiveInt(req.params.id, null);
    if (!id) return res.status(400).json({ error: "invalid_id" });

    const notes = String(req.body?.effectivenessNotes || "").trim();
    if (!notes) return res.status(400).json({ error: "effectiveness_notes_required" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        `SELECT id, status
         FROM capa_records
         WHERE id = $1
         FOR UPDATE`,
        [id]
      );
      if (rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "capa_not_found" });
      }

      if (rows[0].status !== "effectiveness_verification") {
        await client.query("ROLLBACK");
        return res.status(422).json({ error: "invalid_capa_transition" });
      }

      const { rows: updatedRows } = await client.query(
        `UPDATE capa_records
         SET effectiveness_notes = $2,
             updated_at = NOW()
         WHERE id = $1
         RETURNING ${CAPA_COLUMNS.join(", ")}`,
        [id, notes]
      );

      await emitCapaAuditEvent(client, {
        capaId: id,
        eventType: "capa_effectiveness_recorded",
        actorUserId,
        actorRole,
        fromStatus: "effectiveness_verification",
        toStatus: "effectiveness_verification",
        notes,
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

router.post("/:id/actions", requireAuthenticated, async (req, res, next) => {
  try {
    const actorRole = getActorRole(req);
    const actorUserId = getActorUserId(req);
    if (!QUALITY_ROLES.includes(actorRole)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const id = parsePositiveInt(req.params.id, null);
    if (!id) return res.status(400).json({ error: "invalid_id" });

    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ error: "action_title_required" });

    let dueAt = null;
    try {
      dueAt = normalizeIsoTimestamp(req.body?.dueAt, "due_at");
    } catch {
      return res.status(400).json({ error: "invalid_due_at" });
    }

    const assigneeUserId = parsePositiveInt(req.body?.assigneeUserId, null);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rowCount } = await client.query(
        `SELECT 1 FROM capa_records WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "capa_not_found" });
      }

      const { rows } = await client.query(
        `INSERT INTO capa_actions
          (capa_id, title, description, assignee_user_id, due_at, status)
         VALUES ($1, $2, $3, $4, $5, 'open')
         RETURNING id, capa_id, title, description, assignee_user_id, due_at, status, completed_at, created_at, updated_at`,
        [
          id,
          title,
          req.body?.description ? String(req.body.description).trim() : null,
          assigneeUserId,
          dueAt
        ]
      );

      await emitCapaAuditEvent(client, {
        capaId: id,
        eventType: "capa_action_added",
        actorUserId,
        actorRole,
        fromStatus: null,
        toStatus: null,
        notes: null,
        metadata: { actionId: rows[0].id }
      });

      await client.query("COMMIT");
      return res.status(201).json(rows[0]);
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

router.post("/:id/actions/:actionId/status", requireAuthenticated, async (req, res, next) => {
  try {
    const actorRole = getActorRole(req);
    const actorUserId = getActorUserId(req);
    if (!QUALITY_ROLES.includes(actorRole)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const id = parsePositiveInt(req.params.id, null);
    const actionId = parsePositiveInt(req.params.actionId, null);
    if (!id || !actionId) return res.status(400).json({ error: "invalid_id" });

    const nextStatus = String(req.body?.status || "").trim();
    if (!CAPA_ACTION_STATUS.includes(nextStatus)) {
      return res.status(400).json({ error: "invalid_action_status" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        `SELECT id, status
         FROM capa_actions
         WHERE id = $1 AND capa_id = $2
         FOR UPDATE`,
        [actionId, id]
      );
      if (rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "capa_action_not_found" });
      }

      const { rows: updatedRows } = await client.query(
        `UPDATE capa_actions
         SET status = $3,
             completed_at = CASE WHEN $3 = 'done' THEN NOW() ELSE NULL END,
             updated_at = NOW()
         WHERE id = $1 AND capa_id = $2
         RETURNING id, capa_id, title, description, assignee_user_id, due_at, status, completed_at, created_at, updated_at`,
        [actionId, id, nextStatus]
      );

      await emitCapaAuditEvent(client, {
        capaId: id,
        eventType: "capa_action_status_updated",
        actorUserId,
        actorRole,
        fromStatus: null,
        toStatus: null,
        notes: null,
        metadata: {
          actionId,
          from: rows[0].status,
          to: nextStatus
        }
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

import { Router } from "express";
import { query, transaction } from "../db.js";
import { getRoleCaps, requireAnyCapability, requireCapability } from "../middleware/requireCapability.js";
import { getActorRole, getActorUserId } from "../middleware/authSession.js";
import { ensurePartSetupBaselineRevision, getPartRevisionByCode } from "../revisions.js";
import {
  acknowledgeInstructionForContext,
  getActiveInstructionContext
} from "../services/instructions.js";

const router = Router();
const JOB_LOCK_COLUMNS = ["id", "status", "lock_owner_user_id", "lock_timestamp"].join(", ");

function normalizePartRevision(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return normalized || null;
}

function requestRole(req) {
  return getActorRole(req);
}

function parsePositiveInteger(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function resolveActorUserId(req, bodyUserId) {
  const fromSession = getActorUserId(req);
  if (Number.isInteger(fromSession) && fromSession > 0) return fromSession;
  return parsePositiveInteger(bodyUserId);
}

function resolveInstructionOperatorUserId(req, value) {
  const actorUserId = getActorUserId(req);
  const requestedUserId = parsePositiveInteger(value);
  if (Number.isInteger(actorUserId) && actorUserId > 0) {
    if (requestedUserId && requestedUserId !== actorUserId) {
      return { error: "auth_user_mismatch" };
    }
    return { operatorUserId: actorUserId };
  }
  return { operatorUserId: requestedUserId };
}

async function listQuantityAdjustmentsByJobId(jobId) {
  const { rows } = await query(
    `SELECT qa.id, qa.job_id, qa.before_qty, qa.after_qty, qa.reason, qa.actor_user_id, qa.actor_role, qa.created_at,
            u.name AS actor_user_name
     FROM job_quantity_adjustments qa
     LEFT JOIN users u ON u.id = qa.actor_user_id
     WHERE qa.job_id=$1
     ORDER BY qa.created_at DESC, qa.id DESC`,
    [jobId]
  );
  return rows;
}

async function validatePartRevision(client, partId, revisionCode, role) {
  await ensurePartSetupBaselineRevision(client, { partId, changedByRole: role });
  const revision = await getPartRevisionByCode(client, partId, revisionCode);
  return !!revision;
}

router.get("/", requireAnyCapability(["view_operator", "view_jobs", "manage_jobs", "view_admin"]), async (req, res, next) => {
  try {
    const { status, partId, operationId, partRevision } = req.query;
    const filters = [];
    const params = [];
    if (status) { params.push(status); filters.push(`status=$${params.length}`); }
    if (partId) { params.push(partId); filters.push(`part_id=$${params.length}`); }
    if (operationId) { params.push(operationId); filters.push(`operation_id=$${params.length}`); }
    if (partRevision) { params.push(normalizePartRevision(partRevision)); filters.push(`part_revision_code=$${params.length}`); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    // Explicit projection: list all job columns (no sensitive fields in jobs table)
    const { rows } = await query(
      `SELECT id, part_id, part_revision_code, operation_id, lot, qty, status, lock_owner_user_id, lock_timestamp FROM jobs ${where} ORDER BY id DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", requireAnyCapability(["view_operator", "view_jobs", "manage_jobs", "view_admin"]), async (req, res, next) => {
  try {
    const { id } = req.params;
    // Explicit projection: list all job columns (no sensitive fields in jobs table)
    const { rows } = await query("SELECT id, part_id, part_revision_code, operation_id, lot, qty, status, lock_owner_user_id, lock_timestamp FROM jobs WHERE id=$1", [id]);
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    const adjustments = await listQuantityAdjustmentsByJobId(id);
    res.json({
      ...rows[0],
      quantityAdjustments: adjustments
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/instructions/active", requireAnyCapability(["submit_records", "view_jobs", "manage_jobs", "view_admin"]), async (req, res, next) => {
  try {
    const { id } = req.params;
    const resolvedUser = resolveInstructionOperatorUserId(req, req.query.operatorUserId);
    if (resolvedUser.error === "auth_user_mismatch") {
      return res.status(403).json({ error: "auth_user_mismatch" });
    }

    const active = await getActiveInstructionContext(
      { query },
      {
        contextType: "job",
        contextId: id,
        operatorUserId: resolvedUser.operatorUserId
      }
    );
    if (!active) return res.status(404).json({ error: "not_found" });
    res.json(active);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/instructions/acknowledgments", requireCapability("acknowledge_instructions"), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (req.body?.role !== undefined || req.body?.actorRole !== undefined) {
      return res.status(400).json({ error: "role_field_not_allowed" });
    }
    const resolvedUser = resolveInstructionOperatorUserId(req, req.body?.operatorUserId);
    if (resolvedUser.error === "auth_user_mismatch") {
      return res.status(403).json({ error: "auth_user_mismatch" });
    }

    const requestedVersionId = req.body?.instructionVersionId == null
      ? null
      : parsePositiveInteger(req.body.instructionVersionId);
    if (req.body?.instructionVersionId != null && requestedVersionId == null) {
      return res.status(400).json({ error: "invalid_instruction_version_id" });
    }

    const acknowledged = await transaction(async (client) => acknowledgeInstructionForContext(client, {
      contextType: "job",
      contextId: id,
      operatorUserId: resolvedUser.operatorUserId,
      actorRole: requestRole(req),
      instructionVersionId: requestedVersionId
    }));

    if (acknowledged?.error === "operator_user_required") {
      return res.status(400).json({ error: "operator_user_required" });
    }
    if (acknowledged?.error === "operator_not_found") {
      return res.status(400).json({ error: "operator_not_found" });
    }
    if (acknowledged?.error === "operator_role_required") {
      return res.status(400).json({ error: "operator_role_required" });
    }
    if (acknowledged?.error === "instruction_not_published") {
      return res.status(409).json({ error: "instruction_not_published" });
    }
    if (acknowledged?.error === "instruction_version_not_active") {
      return res.status(409).json({ error: "instruction_version_not_active" });
    }
    if (acknowledged?.error === "not_found") return res.status(404).json({ error: "not_found" });

    res.status(acknowledged.created ? 201 : 200).json(acknowledged);
  } catch (err) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "instruction_already_acknowledged" });
    }
    next(err);
  }
});

router.get("/:id/quantity-adjustments", requireAnyCapability(["view_jobs", "manage_jobs", "view_records", "view_admin"]), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: jobRows } = await query("SELECT id FROM jobs WHERE id=$1", [id]);
    if (!jobRows[0]) return res.status(404).json({ error: "not_found" });
    const adjustments = await listQuantityAdjustmentsByJobId(id);
    res.json(adjustments);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/quantity-adjustments", requireCapability("manage_jobs"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { afterQty, reason, userId } = req.body || {};
    const nextQty = parsePositiveInteger(afterQty);
    const normalizedReason = String(reason || "").trim();
    const actorUserId = resolveActorUserId(req, userId);
    const actorRole = requestRole(req);

    if (!nextQty || !normalizedReason) {
      return res.status(400).json({ error: "after_qty_reason_required" });
    }
    if (!actorUserId) {
      return res.status(400).json({ error: "user_required" });
    }

    const result = await transaction(async (client) => {
      const userRes = await client.query("SELECT id FROM users WHERE id=$1", [actorUserId]);
      if (!userRes.rows[0]) return { error: "user_not_found" };

      const jobRes = await client.query("SELECT id, qty FROM jobs WHERE id=$1 FOR UPDATE", [id]);
      const job = jobRes.rows[0];
      if (!job) return { error: "not_found" };
      const beforeQty = Number(job.qty);
      if (beforeQty === nextQty) return { error: "qty_unchanged" };

      await client.query("UPDATE jobs SET qty=$1 WHERE id=$2", [nextQty, id]);
      const insertedRes = await client.query(
        `INSERT INTO job_quantity_adjustments (job_id, before_qty, after_qty, reason, actor_user_id, actor_role)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING *`,
        [id, beforeQty, nextQty, normalizedReason, actorUserId, actorRole]
      );
      return insertedRes.rows[0];
    });

    if (result?.error === "not_found") return res.status(404).json({ error: "not_found" });
    if (result?.error === "qty_unchanged") return res.status(409).json({ error: "qty_unchanged" });
    if (result?.error === "user_not_found") return res.status(400).json({ error: "user_not_found" });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/", requireCapability("manage_jobs"), async (req, res, next) => {
  try {
    const { id, partId, partRevision, partRevisionCode, revision, operationId, lot, qty, status = "open" } = req.body;
    const trimmedId = String(id || "").trim();
    const trimmedPart = String(partId || "").trim();
    const trimmedRevision = normalizePartRevision(partRevision || partRevisionCode || revision);
    const trimmedLot = String(lot || "").trim();
    const qtyNum = Number(qty);
    if (!trimmedId || !trimmedPart || !trimmedRevision || !operationId || !trimmedLot || Number.isNaN(qtyNum) || qtyNum <= 0) {
      return res.status(400).json({ error: "required_fields_missing" });
    }
    if (!["open", "closed", "draft", "incomplete"].includes(status)) {
      return res.status(400).json({ error: "invalid_status" });
    }

    const role = requestRole(req);
    const created = await transaction(async (client) => {
      const hasRevision = await validatePartRevision(client, trimmedPart, trimmedRevision, role);
      if (!hasRevision) return { error: "part_revision_not_found" };

      const opRes = await client.query(
        "SELECT id FROM operations WHERE id=$1 AND part_id=$2",
        [operationId, trimmedPart]
      );
      if (!opRes.rows[0]) {
        return { error: "operation_part_mismatch" };
      }
      const rowsRes = await client.query(
        `INSERT INTO jobs (id, part_id, part_revision_code, operation_id, lot, qty, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [trimmedId, trimmedPart, trimmedRevision, operationId, trimmedLot, qtyNum, status]
      );
      return rowsRes.rows[0];
    });

    if (created?.error === "part_revision_not_found") {
      return res.status(400).json({ error: "part_revision_not_found" });
    }
    if (created?.error === "operation_part_mismatch") {
      return res.status(400).json({ error: "operation_part_mismatch" });
    }
    res.status(201).json(created);
  } catch (err) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "already_exists" });
    }
    next(err);
  }
});

router.put("/:id", requireCapability("manage_jobs"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { partId, partRevision, partRevisionCode, revision, operationId, lot, qty, status } = req.body;
    const trimmedPart = String(partId || "").trim();
    const trimmedRevision = normalizePartRevision(partRevision || partRevisionCode || revision);
    const trimmedLot = String(lot || "").trim();
    const qtyNum = Number(qty);
    if (!trimmedPart || !trimmedRevision || !operationId || !trimmedLot || Number.isNaN(qtyNum) || qtyNum <= 0 || !status) {
      return res.status(400).json({ error: "required_fields_missing" });
    }
    if (!["open", "closed", "draft", "incomplete"].includes(status)) {
      return res.status(400).json({ error: "invalid_status" });
    }

    const role = requestRole(req);
    const updated = await transaction(async (client) => {
      const hasRevision = await validatePartRevision(client, trimmedPart, trimmedRevision, role);
      if (!hasRevision) return { error: "part_revision_not_found" };

      const opRes = await client.query(
        "SELECT id FROM operations WHERE id=$1 AND part_id=$2",
        [operationId, trimmedPart]
      );
      if (!opRes.rows[0]) {
        return { error: "operation_part_mismatch" };
      }
      const rowsRes = await client.query(
        `UPDATE jobs SET part_id=$1, part_revision_code=$2, operation_id=$3, lot=$4, qty=$5, status=$6
         WHERE id=$7 RETURNING *`,
        [trimmedPart, trimmedRevision, operationId, trimmedLot, qtyNum, status, id]
      );
      if (!rowsRes.rows[0]) return { error: "not_found" };
      return rowsRes.rows[0];
    });

    if (updated?.error === "part_revision_not_found") {
      return res.status(400).json({ error: "part_revision_not_found" });
    }
    if (updated?.error === "operation_part_mismatch") {
      return res.status(400).json({ error: "operation_part_mismatch" });
    }
    if (updated?.error === "not_found") return res.status(404).json({ error: "not_found" });
    res.json(updated);
  } catch (err) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "already_exists" });
    }
    next(err);
  }
});

router.post("/:id/lock", requireAnyCapability(["submit_records", "manage_jobs"]), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId } = req.body || {};
    const caps = await getRoleCaps(req);
    const canManage = caps.includes("manage_jobs");
    const actorUserId = getActorUserId(req);
    const requestedUserId = Number(userId);
    const lockUserId = canManage
      ? (Number.isInteger(requestedUserId) && requestedUserId > 0 ? requestedUserId : actorUserId)
      : (actorUserId || requestedUserId);
    if (!Number.isInteger(lockUserId) || lockUserId <= 0) {
      return res.status(400).json({ error: "user_required" });
    }
    if (!canManage && Number.isInteger(actorUserId) && Number.isInteger(requestedUserId) && requestedUserId !== actorUserId) {
      return res.status(403).json({ error: "auth_user_mismatch" });
    }

    const result = await transaction(async (client) => {
      const jobRes = await client.query(
        `SELECT ${JOB_LOCK_COLUMNS}
         FROM jobs
         WHERE id=$1 FOR UPDATE`,
        [id]
      );
      const job = jobRes.rows[0];
      if (!job) return { error: "not_found" };
      if (!["open", "draft"].includes(job.status)) return { error: "job_not_open" };
      if (job.lock_owner_user_id && job.lock_owner_user_id !== lockUserId) {
        return { error: "locked", lockOwnerUserId: job.lock_owner_user_id };
      }
      await client.query(
        "UPDATE jobs SET lock_owner_user_id=$1, lock_timestamp=NOW() WHERE id=$2",
        [lockUserId, id]
      );
      return { ok: true };
    });

    if (result?.error === "not_found") return res.status(404).json({ error: "not_found" });
    if (result?.error === "job_not_open") return res.status(409).json({ error: "job_not_open" });
    if (result?.error === "locked") return res.status(409).json(result);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/unlock", requireAnyCapability(["submit_records", "manage_jobs"]), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId } = req.body || {};
    const caps = await getRoleCaps(req);
    const canManage = caps.includes("manage_jobs");
    const actorUserId = getActorUserId(req);
    const requestedUserId = Number(userId);
    const unlockUserId = actorUserId || requestedUserId;

    const result = await transaction(async (client) => {
      const jobRes = await client.query(
        `SELECT ${JOB_LOCK_COLUMNS}
         FROM jobs
         WHERE id=$1 FOR UPDATE`,
        [id]
      );
      const job = jobRes.rows[0];
      if (!job) return { error: "not_found" };
      if (canManage) {
        await client.query(
          "UPDATE jobs SET lock_owner_user_id=NULL, lock_timestamp=NULL WHERE id=$1",
          [id]
        );
        return { ok: true, forced: true };
      }
      if (!Number.isInteger(unlockUserId) || unlockUserId <= 0) return { error: "user_required" };
      if (Number.isInteger(actorUserId) && Number.isInteger(requestedUserId) && requestedUserId !== actorUserId) {
        return { error: "auth_user_mismatch" };
      }
      if (!job.lock_owner_user_id) return { error: "not_locked" };
      if (job.lock_owner_user_id !== unlockUserId) return { error: "lock_mismatch" };
      await client.query(
        "UPDATE jobs SET lock_owner_user_id=NULL, lock_timestamp=NULL WHERE id=$1",
        [id]
      );
      return { ok: true };
    });

    if (result?.error === "not_found") return res.status(404).json({ error: "not_found" });
    if (result?.error === "user_required") return res.status(400).json({ error: "user_required" });
    if (result?.error === "auth_user_mismatch") return res.status(403).json({ error: "auth_user_mismatch" });
    if (result?.error === "not_locked") return res.status(409).json({ error: "not_locked" });
    if (result?.error === "lock_mismatch") return res.status(409).json({ error: "lock_mismatch" });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireCapability("manage_jobs"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await query("DELETE FROM jobs WHERE id=$1 RETURNING id", [id]);
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

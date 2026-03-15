import { Router } from "express";
import { query, transaction } from "../db.js";
import { requireAnyCapability, requireCapability } from "../middleware/requireCapability.js";
import { getActorRole } from "../middleware/authSession.js";
import {
  createPartSetupRevision,
  ensurePartSetupBaselineRevision,
  getLatestPartRevision,
  nextRevisionCode
} from "../revisions.js";

const router = Router();

function normalizeOperationNumber(value) {
  const raw = String(value ?? "").trim();
  if (!/^\d{1,3}$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 999) return null;
  return String(n).padStart(3, "0");
}

function normalizeWorkCenterCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeWorkCenterName(value) {
  return String(value || "").trim();
}

function normalizeOptionalText(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalUserId(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function parseWorkCenterId(value) {
  if (value === undefined) return { provided: false, value: null, invalid: false };
  if (value === null || value === "") return { provided: true, value: null, invalid: false };
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return { provided: true, value: null, invalid: true };
  return { provided: true, value: n, invalid: false };
}

function requestRole(req) {
  return getActorRole(req);
}

function mapWorkCenterRow(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description || null,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    assignment_count: Number(row.assignment_count || 0)
  };
}

function mapOperationRow(row) {
  return {
    id: row.id,
    part_id: row.part_id,
    op_number: row.op_number,
    label: row.label,
    work_center_id: row.work_center_id ?? null,
    work_center_code: row.work_center_code || null,
    work_center_name: row.work_center_name || null
  };
}

async function getWorkCenter(client, workCenterId) {
  if (workCenterId == null) return null;
  const res = await client.query(
    "SELECT id, code, name, description, active, created_at, updated_at FROM work_centers WHERE id=$1",
    [workCenterId]
  );
  return res.rows[0] || null;
}

function normalizeOperationSequence(sequence) {
  if (!Array.isArray(sequence) || sequence.length === 0) return null;
  const normalized = [];
  for (const item of sequence) {
    const operationId = Number(item?.operationId);
    const opNumber = normalizeOperationNumber(item?.opNumber);
    if (!Number.isInteger(operationId) || operationId <= 0 || !opNumber) return null;
    normalized.push({ operationId, opNumber });
  }
  return normalized;
}

function dedupe(array) {
  return [...new Set(array)];
}

router.get("/", requireAnyCapability(["view_operator", "view_admin", "view_records"]), async (req, res, next) => {
  try {
    const { partId } = req.query;
    const { rows } = await query(
      partId
        ? `SELECT o.id, o.part_id, o.op_number, o.label, o.work_center_id, wc.code AS work_center_code, wc.name AS work_center_name
           FROM operations o
           LEFT JOIN work_centers wc ON wc.id = o.work_center_id
           WHERE o.part_id=$1
           ORDER BY CASE WHEN o.op_number ~ '^[0-9]+$' THEN o.op_number::int ELSE NULL END ASC, o.op_number ASC`
        : `SELECT o.id, o.part_id, o.op_number, o.label, o.work_center_id, wc.code AS work_center_code, wc.name AS work_center_name
           FROM operations o
           LEFT JOIN work_centers wc ON wc.id = o.work_center_id
           ORDER BY CASE WHEN o.op_number ~ '^[0-9]+$' THEN o.op_number::int ELSE NULL END ASC, o.op_number ASC`,
      partId ? [partId] : []
    );
    res.json(rows.map(mapOperationRow));
  } catch (err) {
    next(err);
  }
});

router.get("/work-centers", requireAnyCapability(["view_operator", "view_admin", "view_records"]), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT wc.id, wc.code, wc.name, wc.description, wc.active, wc.created_at, wc.updated_at,
              COUNT(o.id)::int AS assignment_count
       FROM work_centers wc
       LEFT JOIN operations o ON o.work_center_id = wc.id
       GROUP BY wc.id
       ORDER BY wc.code ASC, wc.name ASC`,
      []
    );
    res.json(rows.map(mapWorkCenterRow));
  } catch (err) {
    next(err);
  }
});

router.post("/resequence", requireCapability("manage_parts"), async (req, res, next) => {
  try {
    const { partId, sequence, reason } = req.body || {};
    const normalizedPartId = String(partId || "").trim();
    const normalizedSequence = normalizeOperationSequence(sequence);
    const normalizedReason = normalizeOptionalText(reason) || "routing_resequence";
    if (!normalizedPartId || !normalizedSequence) {
      return res.status(400).json({ error: "part_and_sequence_required" });
    }

    const operationIds = normalizedSequence.map((item) => item.operationId);
    const opNumbers = normalizedSequence.map((item) => item.opNumber);
    if (dedupe(operationIds).length !== operationIds.length) {
      return res.status(400).json({ error: "duplicate_operation_id" });
    }
    if (dedupe(opNumbers).length !== opNumbers.length) {
      return res.status(400).json({ error: "duplicate_op_number" });
    }

    const role = requestRole(req);
    const resequenced = await transaction(async (client) => {
      const partRes = await client.query("SELECT id FROM parts WHERE id=$1", [normalizedPartId]);
      if (!partRes.rows[0]) return { error: "part_not_found" };

      const operationsRes = await client.query(
        `SELECT id, part_id, op_number, label, work_center_id
         FROM operations
         WHERE part_id=$1
           AND id = ANY($2::int[])
         FOR UPDATE`,
        [normalizedPartId, operationIds]
      );
      const existing = operationsRes.rows;
      if (existing.length !== operationIds.length) return { error: "operation_not_found_for_part" };

      const conflictRes = await client.query(
        `SELECT id, op_number
         FROM operations
         WHERE part_id=$1
           AND id <> ALL($2::int[])
           AND op_number = ANY($3::text[])
         LIMIT 1`,
        [normalizedPartId, operationIds, opNumbers]
      );
      if (conflictRes.rows[0]) {
        return { error: "op_number_conflict", conflictOpNumber: conflictRes.rows[0].op_number };
      }

      await ensurePartSetupBaselineRevision(client, { partId: normalizedPartId, changedByRole: role });

      const tempPrefix = `TMP-${Date.now()}`;
      for (const item of normalizedSequence) {
        await client.query("UPDATE operations SET op_number=$1 WHERE id=$2", [`${tempPrefix}-${item.operationId}`, item.operationId]);
      }
      for (const item of normalizedSequence) {
        await client.query("UPDATE operations SET op_number=$1 WHERE id=$2", [item.opNumber, item.operationId]);
      }

      const revisionResult = await createPartSetupRevision(client, {
        partId: normalizedPartId,
        changeSummary: `Resequenced operations (${normalizedReason})`,
        changedFields: ["operations", "operations.routing"],
        changedByRole: role
      });
      const latestRevision = await getLatestPartRevision(client, normalizedPartId);

      const updatedRes = await client.query(
        `SELECT o.id, o.part_id, o.op_number, o.label, o.work_center_id, wc.code AS work_center_code, wc.name AS work_center_name
         FROM operations o
         LEFT JOIN work_centers wc ON wc.id = o.work_center_id
         WHERE o.part_id=$1
         ORDER BY CASE WHEN o.op_number ~ '^[0-9]+$' THEN o.op_number::int ELSE NULL END ASC, o.op_number ASC`,
        [normalizedPartId]
      );

      return {
        partId: normalizedPartId,
        operations: updatedRes.rows.map(mapOperationRow),
        currentRevision: latestRevision?.revision_code || null,
        nextRevision: latestRevision?.revision_code ? nextRevisionCode(latestRevision.revision_code) : "A",
        revisionCreated: !!revisionResult?.created
      };
    });

    if (resequenced?.error === "part_not_found") return res.status(404).json({ error: "part_not_found" });
    if (resequenced?.error === "operation_not_found_for_part") {
      return res.status(400).json({ error: "operation_not_found_for_part" });
    }
    if (resequenced?.error === "op_number_conflict") {
      return res.status(409).json({ error: "op_number_conflict", opNumber: resequenced.conflictOpNumber });
    }

    res.json(resequenced);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/move", requireCapability("manage_parts"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { targetPartId, targetOpNumber, targetLabel, reason } = req.body || {};
    const normalizedTargetPartId = String(targetPartId || "").trim();
    const normalizedTargetOp = targetOpNumber === undefined
      ? null
      : normalizeOperationNumber(targetOpNumber);
    const normalizedTargetLabel = targetLabel === undefined ? null : String(targetLabel || "").trim();
    const normalizedReason = normalizeOptionalText(reason) || "routing_move";
    if (!normalizedTargetPartId) {
      return res.status(400).json({ error: "target_part_required" });
    }
    if (targetOpNumber !== undefined && !normalizedTargetOp) {
      return res.status(400).json({ error: "invalid_op_number" });
    }
    if (targetLabel !== undefined && !normalizedTargetLabel) {
      return res.status(400).json({ error: "label_required" });
    }

    const role = requestRole(req);
    const moved = await transaction(async (client) => {
      const existingRes = await client.query(
        `SELECT id, part_id, op_number, label, work_center_id
         FROM operations
         WHERE id=$1
         FOR UPDATE`,
        [id]
      );
      const existing = existingRes.rows[0];
      if (!existing) return { error: "not_found" };

      const nextPartId = normalizedTargetPartId;
      const nextOpNumber = normalizedTargetOp || existing.op_number;
      const nextLabel = normalizedTargetLabel || existing.label;
      const isRoutingChange = nextPartId !== existing.part_id || nextOpNumber !== existing.op_number;
      if (!isRoutingChange && nextLabel === existing.label) {
        const sourceRevision = await getLatestPartRevision(client, existing.part_id);
        return {
          ...mapOperationRow(existing),
          currentRevision: sourceRevision?.revision_code || null,
          nextRevision: sourceRevision?.revision_code ? nextRevisionCode(sourceRevision.revision_code) : "A",
          revisionCreated: false
        };
      }

      const targetPartRes = await client.query("SELECT id FROM parts WHERE id=$1", [nextPartId]);
      if (!targetPartRes.rows[0]) return { error: "target_part_not_found" };

      await ensurePartSetupBaselineRevision(client, { partId: existing.part_id, changedByRole: role });
      if (nextPartId !== existing.part_id) {
        await ensurePartSetupBaselineRevision(client, { partId: nextPartId, changedByRole: role });
      }

      const updatedRes = await client.query(
        `UPDATE operations
         SET part_id=$1, op_number=$2, label=$3
         WHERE id=$4
         RETURNING id, part_id, op_number, label, work_center_id`,
        [nextPartId, nextOpNumber, nextLabel, id]
      );
      const updated = updatedRes.rows[0];

      const revisionDetails = [];
      if (isRoutingChange || nextLabel !== existing.label) {
        revisionDetails.push(
          await createPartSetupRevision(client, {
            partId: existing.part_id,
            changeSummary: `Moved operation ${existing.op_number} to ${nextPartId}/${nextOpNumber} (${normalizedReason})`,
            changedFields: ["operations", "operations.routing"],
            changedByRole: role
          })
        );
      }
      if (nextPartId !== existing.part_id) {
        revisionDetails.push(
          await createPartSetupRevision(client, {
            partId: nextPartId,
            changeSummary: `Received operation ${existing.op_number} from ${existing.part_id} (${normalizedReason})`,
            changedFields: ["operations", "operations.routing"],
            changedByRole: role
          })
        );
      }

      const sourceRevision = await getLatestPartRevision(client, existing.part_id);
      const targetRevision = nextPartId === existing.part_id
        ? sourceRevision
        : await getLatestPartRevision(client, nextPartId);
      const workCenter = await getWorkCenter(client, updated.work_center_id == null ? null : Number(updated.work_center_id));

      return {
        ...mapOperationRow({
          ...updated,
          work_center_code: workCenter?.code || null,
          work_center_name: workCenter?.name || null
        }),
        sourcePartId: existing.part_id,
        targetPartId: nextPartId,
        sourceCurrentRevision: sourceRevision?.revision_code || null,
        targetCurrentRevision: targetRevision?.revision_code || null,
        revisionCreated: revisionDetails.some((entry) => !!entry?.created)
      };
    });

    if (moved?.error === "not_found") return res.status(404).json({ error: "not_found" });
    if (moved?.error === "target_part_not_found") return res.status(400).json({ error: "target_part_not_found" });
    res.json(moved);
  } catch (err) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "duplicate_operation" });
    }
    next(err);
  }
});

router.post("/work-centers", requireCapability("manage_parts"), async (req, res, next) => {
  try {
    const { code, name, description, active = true, userId, reason } = req.body || {};
    const normalizedCode = normalizeWorkCenterCode(code);
    const normalizedName = normalizeWorkCenterName(name);
    const normalizedDescription = normalizeOptionalText(description);
    const normalizedReason = normalizeOptionalText(reason) || "work_center_created";
    const actorUserId = normalizeOptionalUserId(userId);
    if (!normalizedCode || !normalizedName) {
      return res.status(400).json({ error: "work_center_code_name_required" });
    }
    if (userId !== undefined && actorUserId == null) {
      return res.status(400).json({ error: "invalid_user_id" });
    }

    const role = requestRole(req);
    const created = await transaction(async (client) => {
      if (actorUserId != null) {
        const userRes = await client.query("SELECT id FROM users WHERE id=$1", [actorUserId]);
        if (!userRes.rows[0]) return { error: "user_not_found" };
      }

      const insertRes = await client.query(
        `INSERT INTO work_centers (code, name, description, active)
         VALUES ($1,$2,$3,$4)
         RETURNING id, code, name, description, active, created_at, updated_at`,
        [normalizedCode, normalizedName, normalizedDescription, !!active]
      );
      const row = insertRes.rows[0];

      await client.query(
        `INSERT INTO work_center_audit_log
           (work_center_id, action, before_value, after_value, reason, changed_by_user_id, changed_by_role)
         VALUES ($1,'create',$2,$3,$4,$5,$6)`,
        [row.id, null, row, normalizedReason, actorUserId, role]
      );

      return row;
    });

    if (created?.error === "user_not_found") {
      return res.status(400).json({ error: "user_not_found" });
    }
    res.status(201).json({ ...created, assignment_count: 0 });
  } catch (err) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "duplicate_work_center" });
    }
    next(err);
  }
});

router.put("/work-centers/:workCenterId", requireCapability("manage_parts"), async (req, res, next) => {
  try {
    const { workCenterId } = req.params;
    const { code, name, description, active, userId, reason } = req.body || {};
    const actorUserId = normalizeOptionalUserId(userId);
    const normalizedReason = normalizeOptionalText(reason) || "work_center_updated";
    if (userId !== undefined && actorUserId == null) {
      return res.status(400).json({ error: "invalid_user_id" });
    }

    const role = requestRole(req);
    const updated = await transaction(async (client) => {
      if (actorUserId != null) {
        const userRes = await client.query("SELECT id FROM users WHERE id=$1", [actorUserId]);
        if (!userRes.rows[0]) return { error: "user_not_found" };
      }

      const existingRes = await client.query(
        `SELECT id, code, name, description, active, created_at, updated_at
         FROM work_centers
         WHERE id=$1
         FOR UPDATE`,
        [workCenterId]
      );
      const existing = existingRes.rows[0];
      if (!existing) return { error: "not_found" };

      const nextCode = code === undefined ? existing.code : normalizeWorkCenterCode(code);
      const nextName = name === undefined ? existing.name : normalizeWorkCenterName(name);
      const nextDescription = description === undefined ? existing.description : normalizeOptionalText(description);
      const nextActive = active === undefined ? existing.active : !!active;
      if (!nextCode || !nextName) return { error: "work_center_code_name_required" };

      const rowsRes = await client.query(
        `UPDATE work_centers
         SET code=$1, name=$2, description=$3, active=$4, updated_at=NOW()
         WHERE id=$5
         RETURNING id, code, name, description, active, created_at, updated_at`,
        [nextCode, nextName, nextDescription, nextActive, workCenterId]
      );
      const row = rowsRes.rows[0];

      await client.query(
        `INSERT INTO work_center_audit_log
           (work_center_id, action, before_value, after_value, reason, changed_by_user_id, changed_by_role)
         VALUES ($1,'update',$2,$3,$4,$5,$6)`,
        [row.id, existing, row, normalizedReason, actorUserId, role]
      );

      return row;
    });

    if (updated?.error === "not_found") return res.status(404).json({ error: "not_found" });
    if (updated?.error === "work_center_code_name_required") {
      return res.status(400).json({ error: "work_center_code_name_required" });
    }
    if (updated?.error === "user_not_found") return res.status(400).json({ error: "user_not_found" });

    const countRes = await query(
      "SELECT COUNT(*)::int AS assignment_count FROM operations WHERE work_center_id=$1",
      [workCenterId]
    );
    res.json({ ...updated, assignment_count: Number(countRes.rows[0]?.assignment_count || 0) });
  } catch (err) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "duplicate_work_center" });
    }
    next(err);
  }
});

router.delete("/work-centers/:workCenterId", requireCapability("manage_parts"), async (req, res, next) => {
  try {
    const { workCenterId } = req.params;
    const { userId, reason } = req.body || {};
    const actorUserId = normalizeOptionalUserId(userId);
    const normalizedReason = normalizeOptionalText(reason) || "work_center_deleted";
    if (userId !== undefined && actorUserId == null) {
      return res.status(400).json({ error: "invalid_user_id" });
    }

    const role = requestRole(req);
    const removed = await transaction(async (client) => {
      if (actorUserId != null) {
        const userRes = await client.query("SELECT id FROM users WHERE id=$1", [actorUserId]);
        if (!userRes.rows[0]) return { error: "user_not_found" };
      }

      const existingRes = await client.query(
        `SELECT id, code, name, description, active, created_at, updated_at
         FROM work_centers
         WHERE id=$1
         FOR UPDATE`,
        [workCenterId]
      );
      const existing = existingRes.rows[0];
      if (!existing) return { error: "not_found" };

      const usageRes = await client.query(
        "SELECT COUNT(*)::int AS assignment_count FROM operations WHERE work_center_id=$1",
        [workCenterId]
      );
      if (Number(usageRes.rows[0]?.assignment_count || 0) > 0) {
        return { error: "work_center_in_use" };
      }

      await client.query(
        `INSERT INTO work_center_audit_log
           (work_center_id, action, before_value, after_value, reason, changed_by_user_id, changed_by_role)
         VALUES ($1,'delete',$2,$3,$4,$5,$6)`,
        [existing.id, existing, null, normalizedReason, actorUserId, role]
      );
      await client.query("DELETE FROM work_centers WHERE id=$1", [workCenterId]);

      return { ok: true };
    });

    if (removed?.error === "not_found") return res.status(404).json({ error: "not_found" });
    if (removed?.error === "work_center_in_use") return res.status(409).json({ error: "work_center_in_use" });
    if (removed?.error === "user_not_found") return res.status(400).json({ error: "user_not_found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get("/work-centers/:workCenterId/history", requireAnyCapability(["view_operator", "view_admin", "view_records"]), async (req, res, next) => {
  try {
    const { workCenterId } = req.params;
    const { rows } = await query(
      `SELECT a.id, a.work_center_id, a.operation_id, a.action, a.before_value, a.after_value, a.reason,
              a.changed_by_user_id, u.name AS changed_by_user_name, a.changed_by_role, a.changed_at
       FROM work_center_audit_log a
       LEFT JOIN users u ON u.id = a.changed_by_user_id
       WHERE a.work_center_id=$1
       ORDER BY a.changed_at DESC, a.id DESC`,
      [workCenterId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.put("/:id/work-center", requireCapability("manage_parts"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { workCenterId, userId, reason } = req.body || {};
    const parsedWorkCenter = parseWorkCenterId(workCenterId);
    const actorUserId = normalizeOptionalUserId(userId);
    const normalizedReason = normalizeOptionalText(reason);

    if (!parsedWorkCenter.provided) {
      return res.status(400).json({ error: "work_center_id_required" });
    }
    if (parsedWorkCenter.invalid) {
      return res.status(400).json({ error: "invalid_work_center_id" });
    }
    if (!normalizedReason) {
      return res.status(400).json({ error: "reason_required" });
    }
    if (userId !== undefined && actorUserId == null) {
      return res.status(400).json({ error: "invalid_user_id" });
    }

    const role = requestRole(req);
    const updated = await transaction(async (client) => {
      if (actorUserId != null) {
        const userRes = await client.query("SELECT id FROM users WHERE id=$1", [actorUserId]);
        if (!userRes.rows[0]) return { error: "user_not_found" };
      }

      const existingRes = await client.query(
        `SELECT id, part_id, op_number, label, work_center_id
         FROM operations
         WHERE id=$1
         FOR UPDATE`,
        [id]
      );
      const existing = existingRes.rows[0];
      if (!existing) return { error: "not_found" };
      const existingWorkCenter = await getWorkCenter(client, existing.work_center_id == null ? null : Number(existing.work_center_id));

      const nextWorkCenter = await getWorkCenter(client, parsedWorkCenter.value);
      if (parsedWorkCenter.value != null && !nextWorkCenter) {
        return { error: "work_center_not_found" };
      }

      const beforeWorkCenterId = existing.work_center_id == null ? null : Number(existing.work_center_id);
      const afterWorkCenterId = parsedWorkCenter.value == null ? null : Number(parsedWorkCenter.value);
      if (beforeWorkCenterId === afterWorkCenterId) {
        const latestRevision = await getLatestPartRevision(client, existing.part_id);
        return {
          ...mapOperationRow({
            ...existing,
            work_center_code: existingWorkCenter?.code || null,
            work_center_name: existingWorkCenter?.name || null
          }),
          currentRevision: latestRevision?.revision_code || null,
          nextRevision: latestRevision?.revision_code ? nextRevisionCode(latestRevision.revision_code) : "A",
          revisionCreated: false,
          auditRecorded: false
        };
      }

      const updateRes = await client.query(
        `UPDATE operations
         SET work_center_id=$1
         WHERE id=$2
         RETURNING id, part_id, op_number, label, work_center_id`,
        [afterWorkCenterId, id]
      );
      const op = updateRes.rows[0];

      await client.query(
        `INSERT INTO operation_work_center_history
           (operation_id, part_id, before_work_center_id, after_work_center_id, changed_by_user_id, changed_by_role, reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [op.id, op.part_id, beforeWorkCenterId, afterWorkCenterId, actorUserId, role, normalizedReason]
      );

      await client.query(
        `INSERT INTO work_center_audit_log
           (work_center_id, operation_id, action, before_value, after_value, reason, changed_by_user_id, changed_by_role)
         VALUES ($1,$2,'assign',$3,$4,$5,$6,$7)`,
        [
          afterWorkCenterId || beforeWorkCenterId,
          op.id,
          { operationId: op.id, beforeWorkCenterId },
          { operationId: op.id, afterWorkCenterId },
          normalizedReason,
          actorUserId,
          role
        ]
      );

      const revisionResult = await createPartSetupRevision(client, {
        partId: op.part_id,
        changeSummary: `Assigned operation ${op.op_number} work center`,
        changedFields: ["operations", "operations.work_center"],
        changedByRole: role
      });
      const latestRevision = await getLatestPartRevision(client, op.part_id);

      return {
        ...mapOperationRow({
          ...op,
          work_center_code: nextWorkCenter?.code || null,
          work_center_name: nextWorkCenter?.name || null
        }),
        currentRevision: latestRevision?.revision_code || null,
        nextRevision: latestRevision?.revision_code ? nextRevisionCode(latestRevision.revision_code) : "A",
        revisionCreated: !!revisionResult?.created,
        auditRecorded: true
      };
    });

    if (updated?.error === "not_found") return res.status(404).json({ error: "not_found" });
    if (updated?.error === "work_center_not_found") return res.status(404).json({ error: "work_center_not_found" });
    if (updated?.error === "user_not_found") return res.status(400).json({ error: "user_not_found" });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.get("/:id/work-center-history", requireAnyCapability(["view_operator", "view_admin", "view_records"]), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await query(
      `SELECT h.id, h.operation_id, h.part_id,
              h.before_work_center_id, before_wc.code AS before_work_center_code, before_wc.name AS before_work_center_name,
              h.after_work_center_id, after_wc.code AS after_work_center_code, after_wc.name AS after_work_center_name,
              h.changed_by_user_id, u.name AS changed_by_user_name, h.changed_by_role, h.reason, h.changed_at
       FROM operation_work_center_history h
       LEFT JOIN work_centers before_wc ON before_wc.id = h.before_work_center_id
       LEFT JOIN work_centers after_wc ON after_wc.id = h.after_work_center_id
       LEFT JOIN users u ON u.id = h.changed_by_user_id
       WHERE h.operation_id=$1
       ORDER BY h.changed_at DESC, h.id DESC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/", requireCapability("manage_parts"), async (req, res, next) => {
  try {
    const { partId, opNumber, label, workCenterId } = req.body || {};
    const trimmedPart = String(partId || "").trim();
    const normalizedOp = normalizeOperationNumber(opNumber);
    const trimmedLabel = String(label || "").trim();
    const parsedWorkCenter = parseWorkCenterId(workCenterId);
    if (!trimmedPart || opNumber === undefined || opNumber === null || trimmedLabel === "") {
      return res.status(400).json({ error: "part_op_label_required" });
    }
    if (!normalizedOp) {
      return res.status(400).json({ error: "invalid_op_number" });
    }
    if (parsedWorkCenter.invalid) {
      return res.status(400).json({ error: "invalid_work_center_id" });
    }

    const role = requestRole(req);
    const created = await transaction(async (client) => {
      const partRes = await client.query("SELECT id FROM parts WHERE id=$1", [trimmedPart]);
      if (!partRes.rows[0]) return { error: "part_not_found" };

      const assigned = await getWorkCenter(client, parsedWorkCenter.value);
      if (parsedWorkCenter.value != null && !assigned) {
        return { error: "work_center_not_found" };
      }

      await ensurePartSetupBaselineRevision(client, { partId: trimmedPart, changedByRole: role });
      const opRes = await client.query(
        "INSERT INTO operations (part_id, op_number, label, work_center_id) VALUES ($1,$2,$3,$4) RETURNING *",
        [trimmedPart, normalizedOp, trimmedLabel, parsedWorkCenter.value]
      );
      const revisionResult = await createPartSetupRevision(client, {
        partId: trimmedPart,
        changeSummary: `Added operation ${normalizedOp}`,
        changedFields: ["operations"],
        changedByRole: role
      });
      const latestRevision = await getLatestPartRevision(client, trimmedPart);
      return {
        ...mapOperationRow({
          ...opRes.rows[0],
          work_center_code: assigned?.code || null,
          work_center_name: assigned?.name || null
        }),
        currentRevision: latestRevision?.revision_code || null,
        nextRevision: latestRevision?.revision_code ? nextRevisionCode(latestRevision.revision_code) : "A",
        revisionCreated: !!revisionResult?.created
      };
    });

    if (created?.error === "part_not_found") return res.status(400).json({ error: "part_not_found" });
    if (created?.error === "work_center_not_found") return res.status(400).json({ error: "work_center_not_found" });
    res.status(201).json(created);
  } catch (err) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "duplicate_operation" });
    }
    next(err);
  }
});

router.put("/:id", requireCapability("manage_parts"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { opNumber, label, workCenterId } = req.body || {};
    const normalizedOp = normalizeOperationNumber(opNumber);
    const trimmedLabel = String(label || "").trim();
    const parsedWorkCenter = parseWorkCenterId(workCenterId);
    if (opNumber === undefined || opNumber === null || trimmedLabel === "") {
      return res.status(400).json({ error: "op_label_required" });
    }
    if (!normalizedOp) {
      return res.status(400).json({ error: "invalid_op_number" });
    }
    if (parsedWorkCenter.invalid) {
      return res.status(400).json({ error: "invalid_work_center_id" });
    }

    const role = requestRole(req);
    const updated = await transaction(async (client) => {
      const existingRes = await client.query(
        "SELECT id, part_id, op_number, label, work_center_id FROM operations WHERE id=$1",
        [id]
      );
      const existing = existingRes.rows[0];
      if (!existing) return { error: "not_found" };

      const nextWorkCenterId = parsedWorkCenter.provided
        ? parsedWorkCenter.value
        : (existing.work_center_id == null ? null : Number(existing.work_center_id));
      const assigned = await getWorkCenter(client, nextWorkCenterId);
      if (nextWorkCenterId != null && !assigned) {
        return { error: "work_center_not_found" };
      }

      await ensurePartSetupBaselineRevision(client, { partId: existing.part_id, changedByRole: role });
      const rowsRes = await client.query(
        "UPDATE operations SET op_number=$1, label=$2, work_center_id=$3 WHERE id=$4 RETURNING *",
        [normalizedOp, trimmedLabel, nextWorkCenterId, id]
      );
      const revisionResult = await createPartSetupRevision(client, {
        partId: existing.part_id,
        changeSummary: `Updated operation ${existing.op_number} to ${normalizedOp}`,
        changedFields: ["operations"],
        changedByRole: role
      });
      const latestRevision = await getLatestPartRevision(client, existing.part_id);
      return {
        ...mapOperationRow({
          ...rowsRes.rows[0],
          work_center_code: assigned?.code || null,
          work_center_name: assigned?.name || null
        }),
        currentRevision: latestRevision?.revision_code || null,
        nextRevision: latestRevision?.revision_code ? nextRevisionCode(latestRevision.revision_code) : "A",
        revisionCreated: !!revisionResult?.created
      };
    });

    if (updated?.error === "not_found") return res.status(404).json({ error: "not_found" });
    if (updated?.error === "work_center_not_found") return res.status(400).json({ error: "work_center_not_found" });
    res.json(updated);
  } catch (err) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "duplicate_operation" });
    }
    next(err);
  }
});

router.delete("/:id", requireCapability("manage_parts"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const role = requestRole(req);

    const removed = await transaction(async (client) => {
      const existingRes = await client.query("SELECT id, part_id, op_number FROM operations WHERE id=$1", [id]);
      const existing = existingRes.rows[0];
      if (!existing) return { error: "not_found" };

      await ensurePartSetupBaselineRevision(client, { partId: existing.part_id, changedByRole: role });
      await client.query("DELETE FROM operations WHERE id=$1", [id]);
      const revisionResult = await createPartSetupRevision(client, {
        partId: existing.part_id,
        changeSummary: `Removed operation ${existing.op_number}`,
        changedFields: ["operations"],
        changedByRole: role
      });
      const latestRevision = await getLatestPartRevision(client, existing.part_id);
      return {
        ok: true,
        currentRevision: latestRevision?.revision_code || null,
        nextRevision: latestRevision?.revision_code ? nextRevisionCode(latestRevision.revision_code) : "A",
        revisionCreated: !!revisionResult?.created
      };
    });

    if (removed?.error === "not_found") return res.status(404).json({ error: "not_found" });
    res.json(removed);
  } catch (err) {
    next(err);
  }
});

export default router;

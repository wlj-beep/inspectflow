import { Router } from "express";
import { query, transaction } from "../db.js";
import { requireAnyCapability, requireCapability } from "../middleware/requireCapability.js";
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

function requestRole(req) {
  return String(req.header("x-user-role") || "").trim() || null;
}

router.get("/", requireAnyCapability(["view_operator", "view_admin", "view_records"]), async (req, res, next) => {
  try {
    const { partId } = req.query;
    const { rows } = await query(
      partId
        ? `SELECT * FROM operations WHERE part_id=$1
           ORDER BY CASE WHEN op_number ~ '^[0-9]+$' THEN op_number::int ELSE NULL END ASC, op_number ASC`
        : `SELECT * FROM operations
           ORDER BY CASE WHEN op_number ~ '^[0-9]+$' THEN op_number::int ELSE NULL END ASC, op_number ASC`,
      partId ? [partId] : []
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/", requireCapability("manage_parts"), async (req, res, next) => {
  try {
    const { partId, opNumber, label } = req.body;
    const trimmedPart = String(partId || "").trim();
    const normalizedOp = normalizeOperationNumber(opNumber);
    const trimmedLabel = String(label || "").trim();
    if (!trimmedPart || opNumber === undefined || opNumber === null || trimmedLabel === "") {
      return res.status(400).json({ error: "part_op_label_required" });
    }
    if (!normalizedOp) {
      return res.status(400).json({ error: "invalid_op_number" });
    }

    const role = requestRole(req);
    const created = await transaction(async (client) => {
      const partRes = await client.query("SELECT id FROM parts WHERE id=$1", [trimmedPart]);
      if (!partRes.rows[0]) return { error: "part_not_found" };

      await ensurePartSetupBaselineRevision(client, { partId: trimmedPart, changedByRole: role });
      const opRes = await client.query(
        "INSERT INTO operations (part_id, op_number, label) VALUES ($1,$2,$3) RETURNING *",
        [trimmedPart, normalizedOp, trimmedLabel]
      );
      const revisionResult = await createPartSetupRevision(client, {
        partId: trimmedPart,
        changeSummary: `Added operation ${normalizedOp}`,
        changedFields: ["operations"],
        changedByRole: role
      });
      const latestRevision = await getLatestPartRevision(client, trimmedPart);
      return {
        ...opRes.rows[0],
        currentRevision: latestRevision?.revision_code || null,
        nextRevision: latestRevision?.revision_code ? nextRevisionCode(latestRevision.revision_code) : "A",
        revisionCreated: !!revisionResult?.created
      };
    });

    if (created?.error === "part_not_found") return res.status(400).json({ error: "part_not_found" });
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
    const { opNumber, label } = req.body;
    const normalizedOp = normalizeOperationNumber(opNumber);
    const trimmedLabel = String(label || "").trim();
    if (opNumber === undefined || opNumber === null || trimmedLabel === "") {
      return res.status(400).json({ error: "op_label_required" });
    }
    if (!normalizedOp) {
      return res.status(400).json({ error: "invalid_op_number" });
    }

    const role = requestRole(req);
    const updated = await transaction(async (client) => {
      const existingRes = await client.query("SELECT id, part_id, op_number, label FROM operations WHERE id=$1", [id]);
      const existing = existingRes.rows[0];
      if (!existing) return { error: "not_found" };

      await ensurePartSetupBaselineRevision(client, { partId: existing.part_id, changedByRole: role });
      const rowsRes = await client.query(
        "UPDATE operations SET op_number=$1, label=$2 WHERE id=$3 RETURNING *",
        [normalizedOp, trimmedLabel, id]
      );
      const revisionResult = await createPartSetupRevision(client, {
        partId: existing.part_id,
        changeSummary: `Updated operation ${existing.op_number} to ${normalizedOp}`,
        changedFields: ["operations"],
        changedByRole: role
      });
      const latestRevision = await getLatestPartRevision(client, existing.part_id);
      return {
        ...rowsRes.rows[0],
        currentRevision: latestRevision?.revision_code || null,
        nextRevision: latestRevision?.revision_code ? nextRevisionCode(latestRevision.revision_code) : "A",
        revisionCreated: !!revisionResult?.created
      };
    });

    if (updated?.error === "not_found") return res.status(404).json({ error: "not_found" });
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

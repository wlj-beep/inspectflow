import { Router } from "express";
import { query } from "../db.js";
import { requireAnyCapability, requireCapability } from "../middleware/requireCapability.js";

const router = Router();

function normalizeOperationNumber(value) {
  const raw = String(value ?? "").trim();
  if (!/^\d{1,3}$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 999) return null;
  return String(n).padStart(3, "0");
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
    const { rows } = await query(
      "INSERT INTO operations (part_id, op_number, label) VALUES ($1,$2,$3) RETURNING *",
      [trimmedPart, normalizedOp, trimmedLabel]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
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
    const { rows } = await query(
      "UPDATE operations SET op_number=$1, label=$2 WHERE id=$3 RETURNING *",
      [normalizedOp, trimmedLabel, id]
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireCapability("manage_parts"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await query("DELETE FROM operations WHERE id=$1 RETURNING id", [id]);
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

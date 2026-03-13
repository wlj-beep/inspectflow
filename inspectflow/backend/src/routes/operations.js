import { Router } from "express";
import { query } from "../db.js";
import { requireAnyCapability, requireCapability } from "../middleware/requireCapability.js";

const router = Router();

router.get("/", requireAnyCapability(["view_operator", "view_admin", "view_records"]), async (req, res, next) => {
  try {
    const { partId } = req.query;
    const { rows } = await query(
      partId
        ? "SELECT * FROM operations WHERE part_id=$1 ORDER BY op_number ASC"
        : "SELECT * FROM operations ORDER BY op_number ASC",
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
    const trimmedLabel = String(label || "").trim();
    if (!trimmedPart || opNumber === undefined || opNumber === null || trimmedLabel === "") {
      return res.status(400).json({ error: "part_op_label_required" });
    }
    const { rows } = await query(
      "INSERT INTO operations (part_id, op_number, label) VALUES ($1,$2,$3) RETURNING *",
      [trimmedPart, opNumber, trimmedLabel]
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
    const trimmedLabel = String(label || "").trim();
    if (opNumber === undefined || opNumber === null || trimmedLabel === "") {
      return res.status(400).json({ error: "op_label_required" });
    }
    const { rows } = await query(
      "UPDATE operations SET op_number=$1, label=$2 WHERE id=$3 RETURNING *",
      [opNumber, trimmedLabel, id]
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

import { Router } from "express";
import { query } from "../db.js";
import { requireAnyCapability, requireCapability } from "../middleware/requireCapability.js";

const router = Router();
const VALID_LOCATION_TYPES = ["machine", "user", "job", "vendor", "out_for_calibration"];

function normalizeLocationType(value) {
  const v = String(value || "").trim().toLowerCase();
  return VALID_LOCATION_TYPES.includes(v) ? v : null;
}

router.get("/", requireAnyCapability(["view_operator", "view_admin", "view_records"]), async (req, res, next) => {
  try {
    const { rows } = await query(
      "SELECT id, name, location_type FROM tool_locations ORDER BY location_type ASC, name ASC",
      []
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/", requireCapability("manage_tools"), async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    const locationType = normalizeLocationType(req.body?.locationType ?? req.body?.location_type);
    if (!name || !locationType) {
      return res.status(400).json({ error: "name_location_type_required" });
    }
    const { rows } = await query(
      `INSERT INTO tool_locations (name, location_type)
       VALUES ($1,$2)
       RETURNING id, name, location_type`,
      [name, locationType]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err?.code === "23505") return res.status(409).json({ error: "duplicate_location" });
    next(err);
  }
});

router.put("/:id", requireCapability("manage_tools"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const existingRes = await query("SELECT id, name, location_type FROM tool_locations WHERE id=$1", [id]);
    const existing = existingRes.rows[0];
    if (!existing) return res.status(404).json({ error: "not_found" });

    const nextName = req.body?.name === undefined ? existing.name : String(req.body?.name || "").trim();
    const nextType = req.body?.locationType === undefined && req.body?.location_type === undefined
      ? existing.location_type
      : normalizeLocationType(req.body?.locationType ?? req.body?.location_type);
    if (!nextName || !nextType) {
      return res.status(400).json({ error: "name_location_type_required" });
    }

    const { rows } = await query(
      `UPDATE tool_locations
       SET name=$1, location_type=$2
       WHERE id=$3
       RETURNING id, name, location_type`,
      [nextName, nextType, id]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err?.code === "23505") return res.status(409).json({ error: "duplicate_location" });
    next(err);
  }
});

router.delete("/:id", requireCapability("manage_tools"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const refsRes = await query(
      `SELECT COUNT(*)::int AS count
       FROM tools
       WHERE current_location_id=$1 OR home_location_id=$1`,
      [id]
    );
    const count = refsRes.rows[0]?.count || 0;
    if (count > 0) return res.status(409).json({ error: "location_in_use", toolCount: count });

    const { rows } = await query("DELETE FROM tool_locations WHERE id=$1 RETURNING id", [id]);
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

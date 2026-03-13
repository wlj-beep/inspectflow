import { Router } from "express";
import { query } from "../db.js";
import { requireAnyCapability, requireCapability } from "../middleware/requireCapability.js";

const router = Router();

router.get("/", requireAnyCapability(["view_operator", "view_admin", "view_records"]), async (req, res) => {
  const { rows } = await query("SELECT * FROM tools ORDER BY name ASC", []);
  res.json(rows);
});

router.post("/", requireCapability("manage_tools"), async (req, res) => {
  const { name, type, itNum, size, active = true, visible = true } = req.body;
  const trimmedName = String(name || "").trim();
  const trimmedIt = String(itNum || "").trim();
  if (!trimmedName || !type || !trimmedIt) {
    return res.status(400).json({ error: "name_type_it_required" });
  }
  if (!["Variable", "Go/No-Go", "Attribute"].includes(type)) {
    return res.status(400).json({ error: "invalid_tool_type" });
  }
  const { rows } = await query(
    "INSERT INTO tools (name, type, it_num, size, active, visible) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
    [trimmedName, type, trimmedIt, size || null, active !== false, visible !== false]
  );
  res.status(201).json(rows[0]);
});

router.put("/:id", requireCapability("manage_tools"), async (req, res) => {
  const { id } = req.params;
  const { name, type, itNum, size, active, visible } = req.body || {};
  const existingRes = await query("SELECT * FROM tools WHERE id=$1", [id]);
  const existing = existingRes.rows[0];
  if (!existing) return res.status(404).json({ error: "not_found" });

  const next = {
    name: name === undefined ? existing.name : String(name || "").trim(),
    type: type ?? existing.type,
    itNum: itNum === undefined ? existing.it_num : String(itNum || "").trim(),
    size: size ?? existing.size,
    active: active ?? existing.active,
    visible: visible ?? existing.visible
  };
  if (!next.name || !next.type || !next.itNum) {
    return res.status(400).json({ error: "name_type_it_required" });
  }
  if (!["Variable", "Go/No-Go", "Attribute"].includes(next.type)) {
    return res.status(400).json({ error: "invalid_tool_type" });
  }

  const turningOff = (existing.active && next.active === false) || (existing.visible && next.visible === false);
  if (turningOff) {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS count
       FROM jobs j
       JOIN operations o ON o.id=j.operation_id
       JOIN dimensions d ON d.operation_id=o.id
       JOIN dimension_tools dt ON dt.dimension_id=d.id
       WHERE dt.tool_id=$1 AND j.status IN ('open','draft')`,
      [id]
    );
    const count = rows[0]?.count || 0;
    if (count > 0) {
      return res.status(409).json({ error: "tool_in_open_job", openJobCount: count });
    }
  }

  const { rows } = await query(
    "UPDATE tools SET name=$1, type=$2, it_num=$3, size=$4, active=$5, visible=$6 WHERE id=$7 RETURNING *",
    [next.name, next.type, next.itNum, next.size, next.active, next.visible, id]
  );
  res.json(rows[0]);
});

router.delete("/:id", requireCapability("manage_tools"), async (req, res) => {
  const { id } = req.params;
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count
     FROM jobs j
     JOIN operations o ON o.id=j.operation_id
     JOIN dimensions d ON d.operation_id=o.id
     JOIN dimension_tools dt ON dt.dimension_id=d.id
     WHERE dt.tool_id=$1 AND j.status IN ('open','draft')`,
    [id]
  );
  const count = rows[0]?.count || 0;
  if (count > 0) {
    return res.status(409).json({ error: "tool_in_open_job", openJobCount: count });
  }
  const { rows: updated } = await query(
    "UPDATE tools SET active=false, visible=false WHERE id=$1 RETURNING id",
    [id]
  );
  if (!updated[0]) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true, deactivated: true });
});

export default router;

import { Router } from "express";
import { query } from "../db.js";
import { requireCapability } from "../middleware/requireCapability.js";

const router = Router();

const VALID_ROLES = ["Operator", "Quality", "Supervisor", "Admin"];

router.get("/", async (req, res) => {
  const { rows } = await query("SELECT * FROM users ORDER BY name ASC", []);
  res.json(rows);
});

router.post("/", requireCapability("manage_users"), async (req, res) => {
  const { name, role, active = true } = req.body || {};
  const trimmed = String(name || "").trim();
  if (!trimmed || !role) {
    return res.status(400).json({ error: "name_and_role_required" });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: "invalid_role" });
  }
  const { rows } = await query(
    "INSERT INTO users (name, role, active) VALUES ($1,$2,$3) RETURNING *",
    [trimmed, role, active !== false]
  );
  res.status(201).json(rows[0]);
});

router.put("/:id", requireCapability("manage_users"), async (req, res) => {
  const { id } = req.params;
  const { name, role, active } = req.body || {};
  const existingRes = await query("SELECT * FROM users WHERE id=$1", [id]);
  const existing = existingRes.rows[0];
  if (!existing) return res.status(404).json({ error: "not_found" });

  const trimmed = name === undefined ? existing.name : String(name).trim();
  const nextRole = role ?? existing.role;
  const nextActive = active ?? existing.active;
  if (!trimmed || !nextRole) {
    return res.status(400).json({ error: "name_and_role_required" });
  }
  if (!VALID_ROLES.includes(nextRole)) {
    return res.status(400).json({ error: "invalid_role" });
  }
  const { rows } = await query(
    "UPDATE users SET name=$1, role=$2, active=$3 WHERE id=$4 RETURNING *",
    [trimmed, nextRole, nextActive !== false, id]
  );
  res.json(rows[0]);
});

router.delete("/:id", requireCapability("manage_users"), async (req, res) => {
  const { id } = req.params;
  const { rows } = await query("DELETE FROM users WHERE id=$1 RETURNING id", [id]);
  if (!rows[0]) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
});

export default router;

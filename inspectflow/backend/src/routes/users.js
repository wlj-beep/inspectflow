import { Router } from "express";
import { query } from "../db.js";
import { requireAnyCapability, requireCapability } from "../middleware/requireCapability.js";
import { getDefaultSeedPassword, makePasswordHash, validatePasswordStrength } from "../auth.js";
import {
  getUserSiteAccessPayload,
  setUserSiteAccess
} from "../services/platform/siteAccess.js";

const router = Router();

const VALID_ROLES = ["Operator", "Quality", "Supervisor", "Admin"];

router.get("/", requireAnyCapability(["view_operator", "view_admin"]), async (req, res) => {
  const { rows } = await query("SELECT * FROM users ORDER BY name ASC", []);
  res.json(rows);
});

router.post("/", requireCapability("manage_users"), async (req, res) => {
  const { name, role, active = true, password } = req.body || {};
  const trimmed = String(name || "").trim();
  if (!trimmed || !role) {
    return res.status(400).json({ error: "name_and_role_required" });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: "invalid_role" });
  }
  const resolvedPassword = String(password || getDefaultSeedPassword());
  const policyError = validatePasswordStrength(resolvedPassword);
  if (policyError) return res.status(400).json({ error: policyError });
  const hashed = makePasswordHash(resolvedPassword);
  const { rows } = await query(
    `WITH created AS (
       INSERT INTO users (name, role, active)
       VALUES ($1,$2,$3)
       RETURNING *
     )
     INSERT INTO auth_local_credentials (user_id, password_salt, password_hash, must_rotate_password)
     SELECT created.id, $4, $5, $6
     FROM created
     ON CONFLICT (user_id) DO UPDATE
       SET password_salt=EXCLUDED.password_salt,
           password_hash=EXCLUDED.password_hash,
           must_rotate_password=EXCLUDED.must_rotate_password,
           password_updated_at=NOW()
     RETURNING (SELECT row_to_json(created.*) FROM created) AS user`,
    [
      trimmed,
      role,
      active !== false,
      hashed.salt,
      hashed.hash,
      password ? false : true
    ]
  );
  res.status(201).json(rows[0].user);
});

router.put("/:id", requireCapability("manage_users"), async (req, res) => {
  const { id } = req.params;
  const { name, role, active, password } = req.body || {};
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
  if (password !== undefined) {
    const policyError = validatePasswordStrength(String(password));
    if (policyError) return res.status(400).json({ error: policyError });
    const hashed = makePasswordHash(String(password));
    await query(
      `INSERT INTO auth_local_credentials
         (user_id, password_salt, password_hash, failed_attempts, locked_until, must_rotate_password)
       VALUES ($1,$2,$3,0,NULL,false)
       ON CONFLICT (user_id) DO UPDATE
         SET password_salt=EXCLUDED.password_salt,
             password_hash=EXCLUDED.password_hash,
             failed_attempts=0,
             locked_until=NULL,
             must_rotate_password=false,
             password_updated_at=NOW()`,
      [id, hashed.salt, hashed.hash]
    );
  }
  const { rows } = await query(
    "UPDATE users SET name=$1, role=$2, active=$3 WHERE id=$4 RETURNING *",
    [trimmed, nextRole, nextActive !== false, id]
  );
  res.json(rows[0]);
});

router.get("/:id/sites", requireCapability("manage_users"), async (req, res) => {
  const payload = await getUserSiteAccessPayload(req.params.id);
  res.json(payload);
});

router.put("/:id/sites", requireCapability("manage_users"), async (req, res) => {
  try {
    const payload = await setUserSiteAccess(req.params.id, {
      siteIds: req.body?.siteIds,
      defaultSiteId: req.body?.defaultSiteId
    });
    res.json(payload);
  } catch (error) {
    if (error?.status && error?.code) {
      return res.status(error.status).json({ error: error.code });
    }
    throw error;
  }
});

router.delete("/:id", requireCapability("manage_users"), async (req, res) => {
  const { id } = req.params;
  const { rows } = await query("DELETE FROM users WHERE id=$1 RETURNING id", [id]);
  if (!rows[0]) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
});

export default router;

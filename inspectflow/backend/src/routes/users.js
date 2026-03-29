import { Router } from "express";
import { query } from "../db.js";
import { requireAnyCapability, requireCapability } from "../middleware/requireCapability.js";
import { getDefaultSeedPassword, makePasswordHash, validatePasswordStrength } from "../auth.js";
import { authRequestContext } from "../services/platform/authContracts.js";
import { emitAuthEventSafely } from "../services/platform/authEvents.js";
import {
  getUserSiteAccessPayload,
  setUserSiteAccess
} from "../services/platform/siteAccess.js";

const router = Router();

const VALID_ROLES = ["Operator", "Quality", "Supervisor", "Admin"];

async function emitUserRoleAuditEvent(req, { targetUser, previousRole, assignedRole }) {
  const eventType = assignedRole === "Admin" ? "admin_role_assigned" : "user_updated";
  await emitAuthEventSafely({
    eventType,
    userId: Number(targetUser.id),
    actorRole: req.auth?.user?.role || null,
    sessionId: req.auth?.sessionId || null,
    username: targetUser.name,
    ...authRequestContext(req),
    metadata: {
      actorUserId: Number(req.auth?.user?.id || 0) || null,
      previousRole: previousRole || null,
      assignedRole
    }
  });
}

router.get("/", requireAnyCapability(["view_operator", "view_admin"]), async (req, res) => {
  // Explicit projection: omit password-related columns and any future sensitive fields
  const { rows } = await query("SELECT id, name, role, active FROM users ORDER BY name ASC", []);
  res.json(rows);
});

router.post("/", requireCapability("manage_users"), async (req, res, next) => {
  try {
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
    await emitUserRoleAuditEvent(req, {
      targetUser: rows[0].user,
      previousRole: null,
      assignedRole: role
    });
    res.status(201).json(rows[0].user);
  } catch (err) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "duplicate_user" });
    }
    next(err);
  }
});

router.put("/:id", requireCapability("manage_users"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, role, active, password } = req.body || {};
    // Explicit projection: omit password-related columns and any future sensitive fields
    const existingRes = await query("SELECT id, name, role, active FROM users WHERE id=$1", [id]);
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
    // Explicit projection: omit password-related columns and any future sensitive fields
    const { rows } = await query(
      "UPDATE users SET name=$1, role=$2, active=$3 WHERE id=$4 RETURNING id, name, role, active",
      [trimmed, nextRole, nextActive !== false, id]
    );
    if (existing.role !== nextRole) {
      await emitUserRoleAuditEvent(req, {
        targetUser: rows[0],
        previousRole: existing.role,
        assignedRole: nextRole
      });
    }
    res.json(rows[0]);
  } catch (err) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "duplicate_user" });
    }
    next(err);
  }
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

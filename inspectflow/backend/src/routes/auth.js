import { Router } from "express";
import { query, transaction } from "../db.js";
import {
  clearSessionCookie,
  createAuthSession,
  getDefaultSeedPassword,
  makePasswordHash,
  readSessionTokenFromRequest,
  recordAuthEvent,
  revokeAuthSessionByToken,
  setSessionCookie,
  validatePasswordStrength,
  verifyPassword
} from "../auth.js";
import { requireAuthenticated } from "../middleware/authSession.js";
import {
  getPlatformEntitlements,
  updatePlatformEntitlements
} from "../services/platform/entitlements.js";

const router = Router();

const LOCKOUT_ATTEMPTS = Number(process.env.AUTH_LOCKOUT_ATTEMPTS || 5);
const LOCKOUT_MINUTES = Number(process.env.AUTH_LOCKOUT_MINUTES || 15);
const AUTH_EVENTS_LIMIT_DEFAULT = 50;
const AUTH_EVENTS_LIMIT_MAX = 200;

function normalizeUserInput(input) {
  return String(input || "").trim();
}

function parseOptionalUserId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function mapAuthUser(row) {
  return {
    id: Number(row.id),
    name: row.name,
    role: row.role
  };
}

function authRequestContext(req) {
  return {
    ipAddress: req.ip || null,
    userAgent: req.header("user-agent") || null
  };
}

async function emitAuthEvent(payload) {
  try {
    await recordAuthEvent(payload);
  } catch (err) {
    // Audit failures should not block auth lifecycle flows.
    console.error("auth_event_log_failed", err);
  }
}

async function resolveLoginUser(client, { userId, username }) {
  const normalizedName = normalizeUserInput(username);
  const parsedUserId = Number(userId);
  if (!normalizedName && !Number.isInteger(parsedUserId)) return null;
  if (Number.isInteger(parsedUserId)) {
    const byId = await client.query("SELECT id, name, role, active FROM users WHERE id=$1 LIMIT 1", [parsedUserId]);
    return byId.rows[0] || null;
  }
  const byName = await client.query("SELECT id, name, role, active FROM users WHERE name=$1 LIMIT 1", [normalizedName]);
  return byName.rows[0] || null;
}

function parseEventLimit(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return AUTH_EVENTS_LIMIT_DEFAULT;
  return Math.min(parsed, AUTH_EVENTS_LIMIT_MAX);
}

router.get("/users", async (req, res, next) => {
  try {
    const { rows } = await query(
      "SELECT id, name, role FROM users WHERE active=true ORDER BY name ASC",
      []
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { userId, username, name, password } = req.body || {};
    const loginPassword = String(password || "");
    const attemptedUsername = normalizeUserInput(username || name) || null;
    const attemptedUserId = parseOptionalUserId(userId);
    const requestContext = authRequestContext(req);

    if (!loginPassword) {
      await emitAuthEvent({
        eventType: "login_failure",
        userId: attemptedUserId,
        username: attemptedUsername,
        ...requestContext,
        metadata: { reason: "password_required" }
      });
      return res.status(400).json({ error: "password_required" });
    }

    const result = await transaction(async (client) => {
      const user = await resolveLoginUser(client, { userId, username: username || name });
      if (!user || user.active === false) {
        return {
          error: "invalid_credentials",
          userId: attemptedUserId,
          username: attemptedUsername,
          reason: "user_not_found"
        };
      }

      const credRes = await client.query(
        `SELECT user_id, password_salt, password_hash, failed_attempts, locked_until
         FROM auth_local_credentials
         WHERE user_id=$1
         LIMIT 1`,
        [user.id]
      );
      const cred = credRes.rows[0];
      if (!cred) {
        return {
          error: "invalid_credentials",
          userId: Number(user.id),
          username: user.name,
          reason: "credential_not_found"
        };
      }

      if (cred.locked_until && new Date(cred.locked_until).getTime() > Date.now()) {
        return {
          error: "account_locked",
          userId: Number(user.id),
          username: user.name,
          lockedUntil: cred.locked_until,
          reason: "already_locked"
        };
      }

      const validPassword = verifyPassword(loginPassword, cred.password_salt, cred.password_hash);
      if (!validPassword) {
        const attempts = Number(cred.failed_attempts || 0) + 1;
        const shouldLock = attempts >= LOCKOUT_ATTEMPTS;
        await client.query(
          `UPDATE auth_local_credentials
           SET failed_attempts=$2,
               locked_until=CASE WHEN $3::boolean THEN NOW() + ($4::text || ' minutes')::interval ELSE locked_until END
           WHERE user_id=$1`,
          [user.id, attempts, shouldLock, LOCKOUT_MINUTES]
        );
        if (shouldLock) {
          return {
            error: "account_locked",
            userId: Number(user.id),
            username: user.name,
            reason: "failed_attempts_exceeded",
            failedAttempts: attempts
          };
        }
        return {
          error: "invalid_credentials",
          userId: Number(user.id),
          username: user.name,
          reason: "password_mismatch",
          failedAttempts: attempts
        };
      }

      await client.query(
        `UPDATE auth_local_credentials
         SET failed_attempts=0,
             locked_until=NULL
         WHERE user_id=$1`,
        [user.id]
      );

      return { user };
    });

    if (result?.error === "invalid_credentials") {
      await emitAuthEvent({
        eventType: "login_failure",
        userId: result.userId,
        username: result.username,
        ...requestContext,
        metadata: {
          reason: result.reason,
          failedAttempts: result.failedAttempts || null
        }
      });
      return res.status(401).json({ error: "invalid_credentials" });
    }

    if (result?.error === "account_locked") {
      await emitAuthEvent({
        eventType: "login_locked",
        userId: result.userId,
        username: result.username,
        ...requestContext,
        metadata: {
          reason: result.reason,
          failedAttempts: result.failedAttempts || null,
          lockedUntil: result.lockedUntil || null
        }
      });
      return res.status(423).json({ error: "account_locked", lockedUntil: result.lockedUntil || null });
    }

    const session = await createAuthSession({
      userId: result.user.id,
      ...requestContext
    });
    setSessionCookie(res, session.token, session.expiresAt);

    await emitAuthEvent({
      eventType: "login_success",
      userId: result.user.id,
      actorRole: result.user.role,
      username: result.user.name,
      sessionId: session.sessionId,
      ...requestContext,
      metadata: { source: "local_auth" }
    });

    res.json({
      ok: true,
      user: mapAuthUser(result.user),
      expiresAt: session.expiresAt.toISOString(),
      entitlements: await getPlatformEntitlements()
    });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    const token = readSessionTokenFromRequest(req);
    const requestContext = authRequestContext(req);
    const revoked = await revokeAuthSessionByToken(token, "logout");
    clearSessionCookie(res);

    if (revoked?.sessionId) {
      await emitAuthEvent({
        eventType: "logout",
        userId: revoked.userId,
        actorRole: req.auth?.user?.role || null,
        sessionId: revoked.sessionId,
        username: req.auth?.user?.name || null,
        ...requestContext,
        metadata: { reason: "logout" }
      });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuthenticated, async (req, res, next) => {
  try {
    res.json({
      user: req.auth.user,
      expiresAt: req.auth.expiresAt,
      entitlements: await getPlatformEntitlements()
    });
  } catch (err) {
    next(err);
  }
});

router.get("/session", async (req, res, next) => {
  try {
    if (!req.auth?.user?.id) {
      return res.status(401).json({ valid: false });
    }
    return res.json({
      valid: true,
      user: req.auth.user,
      expiresAt: req.auth.expiresAt,
      entitlements: await getPlatformEntitlements()
    });
  } catch (err) {
    next(err);
  }
});

router.post("/set-password", requireAuthenticated, async (req, res, next) => {
  try {
    const { currentPassword, nextPassword } = req.body || {};
    const userId = req.auth.user.id;
    const nextPwd = String(nextPassword || "");
    const requestContext = authRequestContext(req);
    const policyError = validatePasswordStrength(nextPwd);
    if (policyError) {
      await emitAuthEvent({
        eventType: "password_change_failure",
        userId,
        actorRole: req.auth.user.role,
        username: req.auth.user.name,
        sessionId: req.auth.sessionId,
        ...requestContext,
        metadata: { reason: policyError }
      });
      return res.status(400).json({ error: policyError });
    }

    const { rows } = await query(
      "SELECT password_salt, password_hash FROM auth_local_credentials WHERE user_id=$1 LIMIT 1",
      [userId]
    );
    const cred = rows[0];
    if (!cred) {
      await emitAuthEvent({
        eventType: "password_change_failure",
        userId,
        actorRole: req.auth.user.role,
        username: req.auth.user.name,
        sessionId: req.auth.sessionId,
        ...requestContext,
        metadata: { reason: "credential_not_found" }
      });
      return res.status(404).json({ error: "credential_not_found" });
    }
    if (!verifyPassword(String(currentPassword || ""), cred.password_salt, cred.password_hash)) {
      await emitAuthEvent({
        eventType: "password_change_failure",
        userId,
        actorRole: req.auth.user.role,
        username: req.auth.user.name,
        sessionId: req.auth.sessionId,
        ...requestContext,
        metadata: { reason: "invalid_credentials" }
      });
      return res.status(401).json({ error: "invalid_credentials" });
    }

    const nextHash = makePasswordHash(nextPwd);
    await query(
      `UPDATE auth_local_credentials
       SET password_salt=$2,
           password_hash=$3,
           failed_attempts=0,
           locked_until=NULL,
           password_updated_at=NOW(),
           must_rotate_password=false
       WHERE user_id=$1`,
      [userId, nextHash.salt, nextHash.hash]
    );

    await emitAuthEvent({
      eventType: "password_changed",
      userId,
      actorRole: req.auth.user.role,
      username: req.auth.user.name,
      sessionId: req.auth.sessionId,
      ...requestContext,
      metadata: { reason: "self_service" }
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/reset-default-passwords", requireAuthenticated, async (req, res, next) => {
  try {
    if (req.auth.user.role !== "Admin") return res.status(403).json({ error: "forbidden" });
    const requestContext = authRequestContext(req);
    const defaultPassword = getDefaultSeedPassword();
    const policyError = validatePasswordStrength(defaultPassword);
    if (policyError) return res.status(400).json({ error: policyError });

    const { rows } = await query("SELECT id FROM users WHERE active=true", []);
    for (const user of rows) {
      const hashed = makePasswordHash(defaultPassword);
      await query(
        `INSERT INTO auth_local_credentials
           (user_id, password_salt, password_hash, failed_attempts, locked_until, must_rotate_password)
         VALUES ($1,$2,$3,0,NULL,true)
         ON CONFLICT (user_id) DO UPDATE
           SET password_salt=EXCLUDED.password_salt,
               password_hash=EXCLUDED.password_hash,
               failed_attempts=0,
               locked_until=NULL,
               must_rotate_password=true,
               password_updated_at=NOW()`,
        [user.id, hashed.salt, hashed.hash]
      );
    }

    await emitAuthEvent({
      eventType: "password_reset_default",
      userId: req.auth.user.id,
      actorRole: req.auth.user.role,
      username: req.auth.user.name,
      sessionId: req.auth.sessionId,
      ...requestContext,
      metadata: { userCount: rows.length }
    });

    res.json({ ok: true, userCount: rows.length });
  } catch (err) {
    next(err);
  }
});

router.get("/events", requireAuthenticated, async (req, res, next) => {
  try {
    if (req.auth.user.role !== "Admin") return res.status(403).json({ error: "forbidden" });

    const limit = parseEventLimit(req.query.limit);
    const eventType = normalizeUserInput(req.query.eventType);
    const userId = parseOptionalUserId(req.query.userId);
    const where = [];
    const params = [];

    if (eventType) {
      params.push(eventType);
      where.push(`event_type=$${params.length}`);
    }
    if (userId != null) {
      params.push(userId);
      where.push(`user_id=$${params.length}`);
    }

    params.push(limit);
    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const { rows } = await query(
      `SELECT id, event_type, user_id, actor_role, session_id, username, ip_address, user_agent, metadata, created_at
       FROM auth_event_log
       ${whereClause}
       ORDER BY created_at DESC, id DESC
       LIMIT $${params.length}`,
      params
    );

    res.json({
      contractId: "PLAT-AUTH-v1",
      count: rows.length,
      events: rows
    });
  } catch (err) {
    next(err);
  }
});

router.get("/entitlements", requireAuthenticated, async (req, res, next) => {
  try {
    const entitlements = await getPlatformEntitlements();
    res.json(entitlements);
  } catch (err) {
    next(err);
  }
});

router.put("/entitlements", requireAuthenticated, async (req, res, next) => {
  try {
    if (req.auth.user.role !== "Admin") return res.status(403).json({ error: "forbidden" });

    const updated = await updatePlatformEntitlements({
      ...(req.body || {}),
      updatedByUserId: req.auth.user.id
    });

    await emitAuthEvent({
      eventType: "entitlements_updated",
      userId: req.auth.user.id,
      actorRole: req.auth.user.role,
      username: req.auth.user.name,
      sessionId: req.auth.sessionId,
      ...authRequestContext(req),
      metadata: {
        contractId: updated.contractId,
        moduleFlags: updated.moduleFlags,
        licenseTier: updated.licenseTier,
        seatPack: updated.seatPack,
        seatSoftLimit: updated.seatSoftLimit
      }
    });

    res.json(updated);
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.code });
    next(err);
  }
});

export default router;

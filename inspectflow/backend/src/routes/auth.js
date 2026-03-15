import { Router } from "express";
import { query } from "../db.js";
import {
  clearSessionCookie,
  createAuthSession,
  getDefaultSeedPassword,
  makePasswordHash,
  readSessionTokenFromRequest,
  revokeAuthSessionByToken,
  setSessionCookie,
  validatePasswordStrength,
  verifyPassword
} from "../auth.js";
import { requireAuthenticated } from "../middleware/authSession.js";
import {
  buildAuthSessionPayload,
  loadEntitlementsWithSeatUsage,
  normalizeUserInput,
  parseOptionalUserId,
  authRequestContext,
  seatWarningAuditMetadata
} from "../services/platform/authContracts.js";
import {
  emitAuthEventSafely,
  listAuthEvents,
  parseEventLimit
} from "../services/platform/authEvents.js";
import { loginWithLocalCredentials } from "../services/platform/authLocalCredentials.js";
import {
  getPlatformEntitlements,
  updatePlatformEntitlements
} from "../services/platform/entitlements.js";

const router = Router();

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
      await emitAuthEventSafely({
        eventType: "login_failure",
        userId: attemptedUserId,
        username: attemptedUsername,
        ...requestContext,
        metadata: { reason: "password_required" }
      });
      return res.status(400).json({ error: "password_required" });
    }

    const result = await loginWithLocalCredentials({
      userId,
      username: username || name,
      password: loginPassword
    });

    if (result?.error === "invalid_credentials") {
      await emitAuthEventSafely({
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
      await emitAuthEventSafely({
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
    const sessionPayload = await buildAuthSessionPayload({
      user: result.user,
      expiresAt: session.expiresAt
    });

    await emitAuthEventSafely({
      eventType: "login_success",
      userId: result.user.id,
      actorRole: result.user.role,
      username: result.user.name,
      sessionId: session.sessionId,
      ...requestContext,
      metadata: { source: "local_auth" }
    });
    if (sessionPayload.seatUsage.softLimitWarning) {
      await emitAuthEventSafely({
        eventType: "seat_soft_limit_warning",
        userId: result.user.id,
        actorRole: result.user.role,
        username: result.user.name,
        sessionId: session.sessionId,
        ...requestContext,
        metadata: seatWarningAuditMetadata(sessionPayload.seatUsage)
      });
    }

    res.json({
      ok: true,
      ...sessionPayload
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
      await emitAuthEventSafely({
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
    res.json(await buildAuthSessionPayload({
      user: req.auth.user,
      expiresAt: req.auth.expiresAt
    }));
  } catch (err) {
    next(err);
  }
});

router.get("/session", async (req, res, next) => {
  try {
    if (!req.auth?.user?.id) {
      return res.status(401).json({ valid: false });
    }
    return res.json(await buildAuthSessionPayload({
      valid: true,
      user: req.auth.user,
      expiresAt: req.auth.expiresAt
    }));
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
      await emitAuthEventSafely({
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
      await emitAuthEventSafely({
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
      await emitAuthEventSafely({
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

    await emitAuthEventSafely({
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

    await emitAuthEventSafely({
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
    const rows = await listAuthEvents({ eventType, userId, limit });

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

    await emitAuthEventSafely({
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

router.get("/seats", requireAuthenticated, async (req, res, next) => {
  try {
    if (req.auth?.user?.role !== "Admin") {
      return res.status(403).json({ error: "forbidden" });
    }
    const { seatUsage } = await loadEntitlementsWithSeatUsage();
    res.json(seatUsage);
  } catch (err) {
    next(err);
  }
});

export default router;

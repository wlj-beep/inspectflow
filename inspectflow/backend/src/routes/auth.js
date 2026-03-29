import crypto from "node:crypto";
import { Router } from "express";
import { query, transaction } from "../db.js";
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
import { loginRateLimitMiddleware, resetLoginRateLimit } from "../middleware/loginRateLimit.js";
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
  extractSsoLoginRequest,
  getOidcSsoConfig,
  isSsoEnabled,
  resolveSsoUser
} from "../services/platform/ssoAuth.js";
import { evaluateSeatAccess } from "../services/platform/seatEnforcement.js";
import {
  evaluateModulePolicy,
  getDefaultModulePolicyProfile,
  getModulePolicyProfiles
} from "../services/platform/modulePolicy.js";
import {
  getPlatformEntitlements,
  updatePlatformEntitlements
} from "../services/platform/entitlements.js";

const router = Router();
const loginAttemptStore = new Map();
const NODE_ENV = String(process.env.NODE_ENV || "").trim().toLowerCase();
const MAX_DEFAULT_PASSWORD_RESET_USERS = 50;

function isLocalLoginEnabled() {
  const configured = String(process.env.AUTH_LOCAL_LOGIN_ENABLED || "").trim().toLowerCase();
  if (configured) return configured === "true";
  return NODE_ENV !== "production";
}

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getLoginRateLimitConfig() {
  return {
    maxAttempts: toPositiveInt(process.env.AUTH_LOGIN_RATE_LIMIT_MAX, 10),
    windowMs: toPositiveInt(process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000)
  };
}

function getLoginRateLimitKey(req, body = {}) {
  const username = normalizeUserInput(body.username || body.name) || String(body.userId || "anonymous").trim() || "anonymous";
  const forwardedFor = String(req.header("x-forwarded-for") || "").split(",")[0].trim();
  const ipAddress = forwardedFor || String(req.ip || req.socket?.remoteAddress || "unknown").trim() || "unknown";
  return `${ipAddress}:${username.toLowerCase()}`;
}

function pruneExpiredLoginAttempts(now = Date.now()) {
  for (const [key, entry] of loginAttemptStore.entries()) {
    if (!entry || entry.resetAt <= now) {
      loginAttemptStore.delete(key);
    }
  }
}

function recordLoginAttempt(req, body, { success = false } = {}) {
  pruneExpiredLoginAttempts();
  const { maxAttempts, windowMs } = getLoginRateLimitConfig();
  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0 || !Number.isInteger(windowMs) || windowMs <= 0) {
    return { limited: false, remaining: null, retryAfterSeconds: null };
  }

  const key = getLoginRateLimitKey(req, body);
  const now = Date.now();
  const current = loginAttemptStore.get(key);
  const entry = current && current.resetAt > now
    ? current
    : { count: 0, resetAt: now + windowMs };

  if (success) {
    loginAttemptStore.delete(key);
    return { limited: false, remaining: maxAttempts, retryAfterSeconds: null };
  }

  entry.count += 1;
  loginAttemptStore.set(key, entry);

  if (entry.count > maxAttempts) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return {
      limited: true,
      remaining: 0,
      retryAfterSeconds
    };
  }

  return {
    limited: false,
    remaining: Math.max(0, maxAttempts - entry.count),
    retryAfterSeconds: null
  };
}

const PASSWORD_ROTATION_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const PASSWORD_ROTATION_TOKEN_MAX_ATTEMPTS = 3;

function rotationTokenHash(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

async function issuePasswordRotationToken({ userId, username }) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = rotationTokenHash(token);
  const expiresAt = new Date(Date.now() + PASSWORD_ROTATION_TOKEN_TTL_MS);
  await query(
    `INSERT INTO password_rotation_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [Number(userId), tokenHash, expiresAt.toISOString()]
  );
  await emitAuthEventSafely({
    eventType: "password_rotation_token_issued",
    userId: Number(userId),
    username: String(username || ""),
    metadata: {}
  });
  return {
    token,
    expiresAt: expiresAt.toISOString()
  };
}

async function consumePasswordRotationToken(token) {
  const tokenHash = rotationTokenHash(String(token || ""));
  const { rows } = await query(
    `UPDATE password_rotation_tokens
     SET used_at=NOW()
     WHERE token_hash=$1
       AND used_at IS NULL
       AND expires_at > NOW()
     RETURNING user_id`,
    [tokenHash]
  );
  const row = rows[0];
  if (!row) return null;
  await emitAuthEventSafely({
    eventType: "password_rotation_token_consumed",
    userId: Number(row.user_id),
    metadata: {}
  });
  return { userId: Number(row.user_id) };
}

function normalizeDefaultPasswordResetUserIds(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return { error: "user_ids_required" };
  }
  if (value.length > MAX_DEFAULT_PASSWORD_RESET_USERS) {
    return { error: "user_ids_too_many" };
  }

  const userIds = [];
  const seen = new Set();
  for (const rawUserId of value) {
    const userId = parseOptionalUserId(rawUserId);
    if (userId == null) {
      return { error: "invalid_user_ids" };
    }
    if (seen.has(userId)) continue;
    seen.add(userId);
    userIds.push(userId);
  }

  return { userIds };
}

function resolveDeviceId(req, body = {}) {
  return normalizeUserInput(req.header("x-device-id") || body.deviceId) || null;
}

router.get("/users", requireAuthenticated, async (req, res, next) => {
  try {
    const rawPage = toPositiveInt(req.query.page, 1);
    const rawPageSize = Math.min(toPositiveInt(req.query.pageSize, 25), 100);
    const page = Math.max(1, rawPage);
    const pageSize = Math.max(1, rawPageSize);
    const offset = (page - 1) * pageSize;

    const { rows: countRows } = await query(
      "SELECT COUNT(*)::int AS total FROM users WHERE active=true",
      []
    );
    const total = countRows[0]?.total ?? 0;

    const { rows } = await query(
      "SELECT id, name FROM users WHERE active=true ORDER BY name ASC LIMIT $1 OFFSET $2",
      [pageSize, offset]
    );
    res.json({ users: rows, total, page, pageSize });
  } catch (err) {
    next(err);
  }
});

router.post("/login", loginRateLimitMiddleware, async (req, res, next) => {
  try {
    if (!isLocalLoginEnabled()) {
      return res.status(403).json({
        error: "local_login_disabled",
        detail: "Use /api/auth/sso/login (OIDC SSO mode)."
      });
    }
    const { userId, username, name, password } = req.body || {};
    const loginPassword = String(password || "");
    const attemptedUsername = normalizeUserInput(username || name) || null;
    const attemptedUserId = parseOptionalUserId(userId);
    const requestContext = authRequestContext(req);
    const rateLimitCheck = recordLoginAttempt(req, req.body || {});

    if (rateLimitCheck.limited) {
      res.set("Retry-After", String(rateLimitCheck.retryAfterSeconds || 1));
      return res.status(429).json({ error: "too_many_login_attempts" });
    }

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
      const lockedFailure = result.reason === "already_locked" || result.reason === "failed_attempts_exceeded";
      await emitAuthEventSafely({
        eventType: lockedFailure ? "login_locked" : "login_failure",
        userId: result.userId,
        username: result.username,
        ...requestContext,
        metadata: {
          reason: result.reason,
          failedAttempts: result.failedAttempts || null,
          lockedUntil: result.lockedUntil || null
        }
      });
      return res.status(401).json({ error: "invalid_credentials" });
    }

    if (result.mustRotatePassword) {
      recordLoginAttempt(req, req.body || {}, { success: true });
      resetLoginRateLimit(req);
      clearSessionCookie(res);
      const rotationToken = await issuePasswordRotationToken({
        userId: result.user.id,
        username: result.user.name
      });
      return res.status(202).json({
        ok: true,
        action: "password_rotation_required",
        rotatePath: "/api/auth/rotate-password",
        rotationToken: rotationToken.token,
        rotationTokenExpiresAt: rotationToken.expiresAt,
        mustRotatePassword: true,
        user: {
          id: result.user.id,
          name: result.user.name,
          role: result.user.role
        }
      });
    }

    const entitlements = await getPlatformEntitlements();
    const seatDecision = await evaluateSeatAccess({
      entitlements,
      userId: result.user.id,
      username: result.user.name,
      deviceId: resolveDeviceId(req, req.body || {})
    });
    if (!seatDecision.allowed) {
      await emitAuthEventSafely({
        eventType: "seat_hard_limit_block",
        userId: result.user.id,
        actorRole: result.user.role,
        username: result.user.name,
        ...requestContext,
        metadata: {
          contractId: seatDecision.contractId,
          mode: seatDecision.mode,
          reason: seatDecision.reason,
          hardLimit: seatDecision.hardLimit || null,
          activeUsers: seatDecision.activeUsers || null
        }
      });
      return res.status(403).json({ error: seatDecision.errorCode || "seat_access_denied" });
    }

    const session = await createAuthSession({
      userId: result.user.id,
      ...requestContext
    });
    setSessionCookie(res, session.token, session.expiresAt);
    const sessionPayload = await buildAuthSessionPayload({
      user: result.user,
      expiresAt: session.expiresAt,
      entitlements
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

    recordLoginAttempt(req, req.body || {}, { success: true });
    resetLoginRateLimit(req);

    res.json({
      ok: true,
      ...sessionPayload
    });
  } catch (err) {
    next(err);
  }
});

router.post("/rotate-password", async (req, res, next) => {
  try {
    const { rotationToken, nextPassword } = req.body || {};
    const nextPwd = String(nextPassword || "");
    const requestContext = authRequestContext(req);

    const outcome = await transaction(async (client) => {
      const tokenHash = rotationTokenHash(rotationToken);
      const tokenRes = await client.query(
        `SELECT id, user_id, failed_attempts, locked_at, used_at, expires_at
         FROM password_rotation_tokens
         WHERE token_hash=$1
         LIMIT 1
         FOR UPDATE`,
        [tokenHash]
      );
      const tokenEntry = tokenRes.rows[0];
      if (!tokenEntry) {
        return {
          status: 400,
          body: { error: "invalid_rotation_token" },
          auditEvents: [
            {
              eventType: "password_rotation_token_attempt",
              userId: null,
              username: null,
              metadata: { outcome: "failure", reason: "invalid_token" }
            }
          ]
        };
      }

      const userId = Number(tokenEntry.user_id);
      const failedAttempts = Number(tokenEntry.failed_attempts || 0);
      const lockedAt = tokenEntry.locked_at ? new Date(tokenEntry.locked_at).getTime() : null;
      const usedAt = tokenEntry.used_at ? new Date(tokenEntry.used_at).getTime() : null;
      const expiresAt = tokenEntry.expires_at ? new Date(tokenEntry.expires_at).getTime() : null;

      if (lockedAt) {
        return {
          status: 423,
          body: { error: "rotation_token_locked" },
          auditEvents: [
            {
              eventType: "password_rotation_token_attempt",
              userId,
              username: null,
              metadata: {
                outcome: "failure",
                reason: "locked",
                failedAttempts
              }
            }
          ]
        };
      }

      if (usedAt) {
        return {
          status: 400,
          body: { error: "invalid_rotation_token" },
          auditEvents: [
            {
              eventType: "password_rotation_token_attempt",
              userId,
              username: null,
              metadata: {
                outcome: "failure",
                reason: "used",
                failedAttempts
              }
            }
          ]
        };
      }

      if (expiresAt && expiresAt <= Date.now()) {
        return {
          status: 400,
          body: { error: "invalid_rotation_token" },
          auditEvents: [
            {
              eventType: "password_rotation_token_attempt",
              userId,
              username: null,
              metadata: {
                outcome: "failure",
                reason: "expired",
                failedAttempts
              }
            }
          ]
        };
      }

      const { rows: userRows } = await client.query(
        "SELECT id, name, role, active FROM users WHERE id=$1 LIMIT 1",
        [userId]
      );
      const user = userRows[0];
      if (!user || user.active === false) {
        return {
          status: 401,
          body: { error: "invalid_rotation_token" },
          auditEvents: [
            {
              eventType: "password_rotation_token_attempt",
              userId,
              username: user?.name || null,
              metadata: {
                outcome: "failure",
                reason: "user_inactive",
                failedAttempts
              }
            }
          ]
        };
      }

      const { rows: credRows } = await client.query(
        "SELECT must_rotate_password FROM auth_local_credentials WHERE user_id=$1 LIMIT 1",
        [user.id]
      );
      const cred = credRows[0];
      if (!cred) {
        return {
          status: 404,
          body: { error: "credential_not_found" },
          auditEvents: [
            {
              eventType: "password_rotation_token_attempt",
              userId: user.id,
              username: user.name,
              metadata: {
                outcome: "failure",
                reason: "credential_not_found",
                failedAttempts
              }
            }
          ]
        };
      }
      if (cred.must_rotate_password !== true) {
        return {
          status: 409,
          body: { error: "rotation_not_required" },
          auditEvents: [
            {
              eventType: "password_rotation_token_attempt",
              userId: user.id,
              username: user.name,
              metadata: {
                outcome: "failure",
                reason: "rotation_not_required",
                failedAttempts
              }
            }
          ]
        };
      }

      const policyError = validatePasswordStrength(nextPwd);
      if (policyError) {
        const nextAttempts = failedAttempts + 1;
        const shouldLock = nextAttempts >= PASSWORD_ROTATION_TOKEN_MAX_ATTEMPTS;
        const { rows: updatedRows } = await client.query(
          `UPDATE password_rotation_tokens
           SET failed_attempts=$2,
               locked_at=CASE WHEN $3::boolean AND locked_at IS NULL THEN NOW() ELSE locked_at END
           WHERE id=$1
           RETURNING failed_attempts, locked_at`,
          [tokenEntry.id, nextAttempts, shouldLock]
        );
        const updated = updatedRows[0] || tokenEntry;
        const lockedFailure = shouldLock || !!updated.locked_at;
        const auditEvents = [
          {
            eventType: "password_rotation_token_attempt",
            userId: user.id,
            username: user.name,
            metadata: {
              outcome: "failure",
              reason: "password_policy",
              policyError,
              failedAttempts: Number(updated.failed_attempts || nextAttempts),
              locked: lockedFailure
            }
          }
        ];
        if (lockedFailure) {
          auditEvents.push({
            eventType: "password_rotation_token_locked",
            userId: user.id,
            username: user.name,
            metadata: {
              reason: "max_attempts_reached",
              failedAttempts: Number(updated.failed_attempts || nextAttempts)
            }
          });
        }
        return {
          status: lockedFailure ? 423 : 400,
          body: lockedFailure ? { error: "rotation_token_locked" } : { error: policyError },
          auditEvents
        };
      }

      const consumed = await client.query(
        `UPDATE password_rotation_tokens
         SET used_at=NOW()
         WHERE id=$1
           AND used_at IS NULL
           AND locked_at IS NULL
           AND expires_at > NOW()
         RETURNING failed_attempts`,
        [tokenEntry.id]
      );
      if (!consumed.rows[0]) {
        return {
          status: 400,
          body: { error: "invalid_rotation_token" },
          auditEvents: [
            {
              eventType: "password_rotation_token_attempt",
              userId: user.id,
              username: user.name,
              metadata: {
                outcome: "failure",
                reason: "token_unavailable",
                failedAttempts
              }
            }
          ]
        };
      }

      const nextHash = makePasswordHash(nextPwd);
      await client.query(
        `UPDATE auth_local_credentials
         SET password_salt=$2,
             password_hash=$3,
             failed_attempts=0,
             locked_until=NULL,
             password_updated_at=NOW(),
             must_rotate_password=false
         WHERE user_id=$1`,
        [user.id, nextHash.salt, nextHash.hash]
      );

      return {
        status: 200,
        body: {
          user: {
            id: user.id,
            name: user.name,
            role: user.role
          }
        },
        auditEvents: [
          {
            eventType: "password_rotation_token_attempt",
            userId: user.id,
            username: user.name,
            metadata: {
              outcome: "success",
              reason: "rotation_completed",
              failedAttempts
            }
          },
          {
            eventType: "password_rotation_token_consumed",
            userId: user.id,
            username: user.name,
            metadata: {
              failedAttempts
            }
          }
        ]
      };
    });

    for (const auditEvent of outcome.auditEvents || []) {
      await emitAuthEventSafely({
        ...auditEvent,
        ...requestContext
      });
    }

    if (outcome.status !== 200) {
      return res.status(outcome.status).json(outcome.body);
    }

    const user = outcome.body.user;
    const entitlements = await getPlatformEntitlements();
    const session = await createAuthSession({
      userId: user.id,
      ...requestContext
    });
    setSessionCookie(res, session.token, session.expiresAt);
    const sessionPayload = await buildAuthSessionPayload({
      user,
      expiresAt: session.expiresAt,
      entitlements
    });

    await emitAuthEventSafely({
      eventType: "password_changed",
      userId: user.id,
      actorRole: user.role,
      username: user.name,
      sessionId: session.sessionId,
      ...requestContext,
      metadata: { reason: "must_rotate_password" }
    });

    return res.json({
      ok: true,
      ...sessionPayload
    });
  } catch (err) {
    next(err);
  }
});

router.post("/sso/login", async (req, res, next) => {
  try {
    if (!isSsoEnabled()) return res.status(404).json({ error: "sso_disabled" });

    const requestContext = authRequestContext(req);
    const ssoRequest = extractSsoLoginRequest(req, req.body || {});
    if (!ssoRequest.principal) {
      await emitAuthEventSafely({
        eventType: "login_failure",
        username: null,
        ...requestContext,
        metadata: { reason: "sso_principal_required", source: "sso" }
      });
      return res.status(400).json({ error: "sso_principal_required" });
    }

    const user = await resolveSsoUser(ssoRequest);
    if (!user || user.active === false) {
      await emitAuthEventSafely({
        eventType: "login_failure",
        username: ssoRequest.principal,
        ...requestContext,
        metadata: { reason: "invalid_sso_principal", source: "sso" }
      });
      return res.status(401).json({ error: "invalid_sso_principal" });
    }

    const entitlements = await getPlatformEntitlements();
    const seatDecision = await evaluateSeatAccess({
      entitlements,
      userId: user.id,
      username: user.name,
      deviceId: resolveDeviceId(req, req.body || {})
    });
    if (!seatDecision.allowed) {
      await emitAuthEventSafely({
        eventType: "seat_hard_limit_block",
        userId: user.id,
        actorRole: user.role,
        username: user.name,
        ...requestContext,
        metadata: {
          contractId: seatDecision.contractId,
          mode: seatDecision.mode,
          reason: seatDecision.reason,
          hardLimit: seatDecision.hardLimit || null,
          activeUsers: seatDecision.activeUsers || null
        }
      });
      return res.status(403).json({ error: seatDecision.errorCode || "seat_access_denied" });
    }

    const session = await createAuthSession({
      userId: user.id,
      ...requestContext
    });
    setSessionCookie(res, session.token, session.expiresAt);
    const sessionPayload = await buildAuthSessionPayload({
      user,
      expiresAt: session.expiresAt,
      entitlements
    });

    await emitAuthEventSafely({
      eventType: "login_success",
      userId: user.id,
      actorRole: user.role,
      username: user.name,
      sessionId: session.sessionId,
      ...requestContext,
      metadata: { source: "sso" }
    });
    if (sessionPayload.seatUsage.softLimitWarning) {
      await emitAuthEventSafely({
        eventType: "seat_soft_limit_warning",
        userId: user.id,
        actorRole: user.role,
        username: user.name,
        sessionId: session.sessionId,
        ...requestContext,
        metadata: seatWarningAuditMetadata(sessionPayload.seatUsage)
      });
    }

    return res.json({
      ok: true,
      authSource: "sso",
      ...sessionPayload
    });
  } catch (err) {
    next(err);
  }
});

router.get("/sso/config", requireAuthenticated, async (req, res, next) => {
  try {
    res.json(getOidcSsoConfig());
  } catch (err) {
    next(err);
  }
});

router.post("/logout", requireAuthenticated, async (req, res, next) => {
  try {
    const token = readSessionTokenFromRequest(req);
    const requestContext = authRequestContext(req);
    const revoked = await revokeAuthSessionByToken(token, "logout");
    clearSessionCookie(res);

    await emitAuthEventSafely({
      eventType: "logout",
      userId: req.auth.user.id,
      actorRole: req.auth.user.role,
      sessionId: req.auth.sessionId,
      username: req.auth.user.name,
      ...requestContext,
      metadata: { reason: "logout" }
    });

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
    const normalized = normalizeDefaultPasswordResetUserIds(req.body?.userIds);
    if (normalized.error === "user_ids_required") {
      return res.status(400).json({ error: "user_ids_required" });
    }
    if (normalized.error === "invalid_user_ids") {
      return res.status(400).json({ error: "invalid_user_ids" });
    }
    if (normalized.error === "user_ids_too_many") {
      return res.status(422).json({ error: "user_ids_too_many", maxUserIds: MAX_DEFAULT_PASSWORD_RESET_USERS });
    }

    const defaultPassword = getDefaultSeedPassword();
    const policyError = validatePasswordStrength(defaultPassword);
    if (policyError) return res.status(400).json({ error: policyError });

    const { rows: activeRows } = await query(
      "SELECT id FROM users WHERE active=true AND id = ANY($1::int[])",
      [normalized.userIds]
    );
    const activeUserIds = new Set(activeRows.map((row) => Number(row.id)));
    const missingUserIds = normalized.userIds.filter((userId) => !activeUserIds.has(userId));
    if (missingUserIds.length > 0) {
      return res.status(404).json({ error: "user_not_found", missingUserIds });
    }

    const resetCount = await transaction(async (client) => {
      for (const userId of normalized.userIds) {
        const hashed = makePasswordHash(defaultPassword);
        await client.query(
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
          [userId, hashed.salt, hashed.hash]
        );
      }
      return normalized.userIds.length;
    });

    for (const userId of normalized.userIds) {
      await emitAuthEventSafely({
        eventType: "password_reset_default",
        userId,
        actorRole: req.auth.user.role,
        username: req.auth.user.name,
        sessionId: req.auth.sessionId,
        ...requestContext,
        metadata: {
          resetByUserId: req.auth.user.id
        }
      });
    }

    res.json({ ok: true, userCount: resetCount });
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

router.get("/module-policy/profiles", requireAuthenticated, async (req, res, next) => {
  try {
    res.json(getModulePolicyProfiles());
  } catch (err) {
    next(err);
  }
});

router.post("/module-policy/evaluate", requireAuthenticated, async (req, res, next) => {
  try {
    if (req.auth.user.role !== "Admin") return res.status(403).json({ error: "forbidden" });
    const evaluation = evaluateModulePolicy({
      profile: req.body?.profile || req.body?.modulePolicyProfile || getDefaultModulePolicyProfile(),
      moduleFlags: req.body?.moduleFlags
    });
    res.json(evaluation);
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.code });
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
        seatSoftLimit: updated.seatSoftLimit,
        seatPolicy: updated.seatPolicy,
        modulePolicyProfile: updated.modulePolicyProfile
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

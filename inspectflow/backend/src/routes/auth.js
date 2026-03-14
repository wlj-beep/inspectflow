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

const router = Router();

const LOCKOUT_ATTEMPTS = Number(process.env.AUTH_LOCKOUT_ATTEMPTS || 5);
const LOCKOUT_MINUTES = Number(process.env.AUTH_LOCKOUT_MINUTES || 15);

function normalizeUserInput(input) {
  return String(input || "").trim();
}

function mapAuthUser(row) {
  return {
    id: Number(row.id),
    name: row.name,
    role: row.role
  };
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
    if (!loginPassword) return res.status(400).json({ error: "password_required" });

    const result = await transaction(async (client) => {
      const user = await resolveLoginUser(client, { userId, username: username || name });
      if (!user || user.active === false) return { error: "invalid_credentials" };

      const credRes = await client.query(
        `SELECT user_id, password_salt, password_hash, failed_attempts, locked_until
         FROM auth_local_credentials
         WHERE user_id=$1
         LIMIT 1`,
        [user.id]
      );
      const cred = credRes.rows[0];
      if (!cred) return { error: "invalid_credentials" };

      if (cred.locked_until && new Date(cred.locked_until).getTime() > Date.now()) {
        return { error: "account_locked", lockedUntil: cred.locked_until };
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
          return { error: "account_locked" };
        }
        return { error: "invalid_credentials" };
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
      return res.status(401).json({ error: "invalid_credentials" });
    }
    if (result?.error === "account_locked") {
      return res.status(423).json({ error: "account_locked", lockedUntil: result.lockedUntil || null });
    }

    const session = await createAuthSession({
      userId: result.user.id,
      ipAddress: req.ip || null,
      userAgent: req.header("user-agent") || null
    });
    setSessionCookie(res, session.token, session.expiresAt);

    res.json({
      ok: true,
      user: mapAuthUser(result.user),
      expiresAt: session.expiresAt.toISOString()
    });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    const token = readSessionTokenFromRequest(req);
    await revokeAuthSessionByToken(token, "logout");
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuthenticated, async (req, res) => {
  res.json({
    user: req.auth.user,
    expiresAt: req.auth.expiresAt
  });
});

router.get("/session", async (req, res) => {
  if (!req.auth?.user?.id) {
    return res.status(401).json({ valid: false });
  }
  return res.json({
    valid: true,
    user: req.auth.user,
    expiresAt: req.auth.expiresAt
  });
});

router.post("/set-password", requireAuthenticated, async (req, res, next) => {
  try {
    const { currentPassword, nextPassword } = req.body || {};
    const userId = req.auth.user.id;
    const nextPwd = String(nextPassword || "");
    const policyError = validatePasswordStrength(nextPwd);
    if (policyError) {
      return res.status(400).json({ error: policyError });
    }

    const { rows } = await query(
      "SELECT password_salt, password_hash FROM auth_local_credentials WHERE user_id=$1 LIMIT 1",
      [userId]
    );
    const cred = rows[0];
    if (!cred) return res.status(404).json({ error: "credential_not_found" });
    if (!verifyPassword(String(currentPassword || ""), cred.password_salt, cred.password_hash)) {
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

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/reset-default-passwords", requireAuthenticated, async (req, res, next) => {
  try {
    if (req.auth.user.role !== "Admin") return res.status(403).json({ error: "forbidden" });
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
    res.json({ ok: true, userCount: rows.length });
  } catch (err) {
    next(err);
  }
});

export default router;

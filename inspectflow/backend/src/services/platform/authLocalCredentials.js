import { verifyPassword } from "../../auth.js";
import { transaction } from "../../db.js";
import { normalizeUserInput } from "./authContracts.js";

const LOCKOUT_ATTEMPTS = Number(process.env.AUTH_LOCKOUT_ATTEMPTS || 5);
const LOCKOUT_MINUTES = Number(process.env.AUTH_LOCKOUT_MINUTES || 15);

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

export async function loginWithLocalCredentials({ userId, username, password }) {
  const loginPassword = String(password || "");

  return transaction(async (client) => {
    const user = await resolveLoginUser(client, { userId, username });
    if (!user || user.active === false) {
      return {
        error: "invalid_credentials",
        userId: Number.isInteger(Number(userId)) ? Number(userId) : null,
        username: normalizeUserInput(username) || null,
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
}

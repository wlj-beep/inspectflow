import crypto from "node:crypto";
import { query } from "./db.js";

export const AUTH_SESSION_COOKIE = process.env.AUTH_SESSION_COOKIE || "inspectflow_session";

const DEFAULT_SESSION_TTL_HOURS = Number(process.env.AUTH_SESSION_TTL_HOURS || 12);
const DEFAULT_PASSWORD_MIN_LENGTH = Number(process.env.AUTH_PASSWORD_MIN_LENGTH || 8);
const DEFAULT_SEED_PASSWORD = process.env.INSPECTFLOW_DEFAULT_PASSWORD || "inspectflow";
const SESSION_TOKEN_BYTES = 48;

function toPositiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function parseCookieHeader(header) {
  const out = {};
  String(header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const idx = part.indexOf("=");
      if (idx <= 0) return;
      const key = part.slice(0, idx).trim();
      const rawValue = part.slice(idx + 1).trim();
      try {
        out[key] = decodeURIComponent(rawValue);
      } catch {
        out[key] = rawValue;
      }
    });
  return out;
}

export function readSessionTokenFromRequest(req) {
  const cookies = parseCookieHeader(req?.headers?.cookie || "");
  return String(cookies[AUTH_SESSION_COOKIE] || "").trim() || null;
}

function sessionTokenHash(token) {
  const pepper = String(process.env.AUTH_TOKEN_PEPPER || "");
  return crypto.createHash("sha256").update(`${pepper}:${token}`).digest("hex");
}

export function makePasswordHash(password, salt = null) {
  const nextSalt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), nextSalt, 64).toString("hex");
  return { salt: nextSalt, hash };
}

export function verifyPassword(password, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  const candidate = makePasswordHash(password, salt).hash;
  const expected = String(expectedHash);
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function validatePasswordStrength(password) {
  const trimmed = String(password || "");
  if (trimmed.length < DEFAULT_PASSWORD_MIN_LENGTH) {
    return `password_min_length_${DEFAULT_PASSWORD_MIN_LENGTH}`;
  }
  return null;
}

export function getDefaultSeedPassword() {
  return DEFAULT_SEED_PASSWORD;
}

export function setSessionCookie(res, token, expiresAt) {
  const secure = process.env.AUTH_COOKIE_SECURE === "true";
  res.cookie(AUTH_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    expires: expiresAt
  });
}

export function clearSessionCookie(res) {
  const secure = process.env.AUTH_COOKIE_SECURE === "true";
  res.cookie(AUTH_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    expires: new Date(0)
  });
}

export async function createAuthSession({ userId, ipAddress = null, userAgent = null } = {}) {
  const token = crypto.randomBytes(SESSION_TOKEN_BYTES).toString("hex");
  const tokenHash = sessionTokenHash(token);
  const ttlHours = toPositiveInt(DEFAULT_SESSION_TTL_HOURS, 12);
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  await query(
    `INSERT INTO auth_sessions
       (user_id, session_token_hash, expires_at, ip_address, user_agent)
     VALUES ($1,$2,$3,$4,$5)`,
    [userId, tokenHash, expiresAt.toISOString(), ipAddress, userAgent]
  );
  return { token, expiresAt };
}

export async function getAuthSessionByToken(token) {
  if (!token) return null;
  const tokenHash = sessionTokenHash(token);
  const { rows } = await query(
    `SELECT
       s.id AS session_id,
       s.expires_at,
       u.id AS user_id,
       u.name AS user_name,
       u.role AS user_role,
       u.active AS user_active
     FROM auth_sessions s
     JOIN users u ON u.id=s.user_id
     WHERE s.session_token_hash=$1
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );
  const session = rows[0];
  if (!session || session.user_active === false) return null;

  await query("UPDATE auth_sessions SET last_seen_at=NOW() WHERE id=$1", [session.session_id]);
  return {
    sessionId: session.session_id,
    expiresAt: session.expires_at,
    user: {
      id: Number(session.user_id),
      name: session.user_name,
      role: session.user_role
    }
  };
}

export async function revokeAuthSessionByToken(token, reason = "logout") {
  if (!token) return false;
  const tokenHash = sessionTokenHash(token);
  const { rows } = await query(
    `UPDATE auth_sessions
     SET revoked_at=NOW(), revoked_reason=$2
     WHERE session_token_hash=$1
       AND revoked_at IS NULL
     RETURNING id`,
    [tokenHash, reason]
  );
  return !!rows[0];
}

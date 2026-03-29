import crypto from "node:crypto";
import { query } from "./db.js";
import { MODULE_FLAG_KEYS } from "./services/platform/entitlements.js";

export const AUTH_SESSION_COOKIE = process.env.AUTH_SESSION_COOKIE || "inspectflow_session";

const DEFAULT_SESSION_TTL_HOURS = Number(process.env.AUTH_SESSION_TTL_HOURS || 12);
const configuredPasswordMinLength = Number(process.env.AUTH_PASSWORD_MIN_LENGTH || 12);
const DEFAULT_PASSWORD_MIN_LENGTH = Number.isFinite(configuredPasswordMinLength) && configuredPasswordMinLength >= 12
  ? configuredPasswordMinLength
  : 12;
const DEFAULT_SEED_PASSWORD = process.env.INSPECTFLOW_DEFAULT_PASSWORD || "Inspectflow1!";
const SESSION_TOKEN_BYTES = 48;
const PASSWORD_HASH_BYTES = 64;
const FALLBACK_PASSWORD_SALT = "00000000000000000000000000000000";
const nodeEnvForPepper = String(process.env.NODE_ENV || "").trim().toLowerCase();
const REQUIRE_TOKEN_PEPPER = nodeEnvForPepper !== "test"
  || String(process.env.AUTH_REQUIRE_TOKEN_PEPPER || "").trim().toLowerCase() === "true";

function resolveCookieSameSite() {
  const raw = String(process.env.AUTH_COOKIE_SAMESITE || "lax").trim().toLowerCase();
  if (raw === "strict") return "strict";
  if (raw === "none") return "none";
  return "lax";
}

function resolveCookieDomain() {
  const domain = String(process.env.AUTH_COOKIE_DOMAIN || "").trim();
  return domain || undefined;
}

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
  if (REQUIRE_TOKEN_PEPPER && !pepper) {
    throw new Error("auth_token_pepper_required");
  }
  return crypto.createHash("sha256").update(`${pepper}:${token}`).digest("hex");
}

export function makePasswordHash(password, salt = null) {
  const nextSalt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), nextSalt, 64).toString("hex");
  return { salt: nextSalt, hash };
}

export function verifyPassword(password, salt, expectedHash) {
  const candidate = makePasswordHash(password, salt || FALLBACK_PASSWORD_SALT).hash;
  const candidateBuffer = Buffer.from(candidate, "hex");
  const expectedString = String(expectedHash || "");
  const expectedBuffer = /^[0-9a-f]+$/i.test(expectedString) && expectedString.length % 2 === 0
    ? Buffer.from(expectedString, "hex")
    : Buffer.alloc(PASSWORD_HASH_BYTES);
  const normalizedExpected = expectedBuffer.length === candidateBuffer.length
    ? expectedBuffer
    : Buffer.alloc(candidateBuffer.length);
  return crypto.timingSafeEqual(candidateBuffer, normalizedExpected);
}

export function validatePasswordStrength(password) {
  const value = String(password || "");
  if (value.length < DEFAULT_PASSWORD_MIN_LENGTH) {
    return `password_min_length_${DEFAULT_PASSWORD_MIN_LENGTH}`;
  }
  if (!/[A-Z]/.test(value)) {
    return "password_requires_uppercase";
  }
  if (!/[0-9]/.test(value)) {
    return "password_requires_number";
  }
  if (!/[^A-Za-z0-9]/.test(value)) {
    return "password_requires_special";
  }
  return null;
}

export function getDefaultSeedPassword() {
  return DEFAULT_SEED_PASSWORD;
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function sanitizeString(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return undefined;
}

function sanitizeNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sanitizeBoolean(value) {
  return value === true || value === false ? value : undefined;
}

function sanitizeStringList(value) {
  if (!Array.isArray(value)) return undefined;
  const out = [];
  const seen = new Set();
  for (const entry of value) {
    const normalized = sanitizeString(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function sanitizeModuleFlags(value) {
  if (!isPlainObject(value)) return undefined;
  const out = {};
  for (const key of MODULE_FLAG_KEYS) {
    out[key] = value[key] === true;
  }
  return out;
}

function sanitizeSeatPolicy(value) {
  if (!isPlainObject(value)) return undefined;
  const hardLimit = sanitizeNumber(value.hardLimit);
  return {
    mode: sanitizeString(value.mode) || "soft",
    enforced: value.enforced === true,
    hardLimit: Number.isInteger(hardLimit) && hardLimit >= 0 ? hardLimit : 0,
    namedUsers: sanitizeStringList(value.namedUsers) || [],
    allowedDevices: sanitizeStringList(value.allowedDevices) || []
  };
}

function sanitizeMetadataField(rule, value) {
  switch (rule) {
    case "string":
      return sanitizeString(value);
    case "number":
      return sanitizeNumber(value);
    case "boolean":
      return sanitizeBoolean(value);
    case "moduleFlags":
      return sanitizeModuleFlags(value);
    case "seatPolicy":
      return sanitizeSeatPolicy(value);
    case "stringList":
      return sanitizeStringList(value);
    default:
      return undefined;
  }
}

const AUTH_EVENT_METADATA_ALLOWLIST = {
  login_success: {
    source: "string"
  },
  login_failure: {
    reason: "string",
    failedAttempts: "number",
    lockedUntil: "string",
    source: "string"
  },
  login_locked: {
    reason: "string",
    failedAttempts: "number",
    lockedUntil: "string",
    source: "string"
  },
  logout: {
    reason: "string",
    source: "string"
  },
  password_changed: {
    reason: "string",
    source: "string"
  },
  password_change_failure: {
    reason: "string",
    source: "string"
  },
  password_reset_default: {
    resetByUserId: "number"
  },
  entitlements_updated: {
    contractId: "string",
    licenseTier: "string",
    seatPack: "number",
    seatSoftLimit: "number",
    diagnosticsOptIn: "boolean",
    seatPolicy: "seatPolicy",
    moduleFlags: "moduleFlags",
    modulePolicyProfile: "string"
  },
  seat_soft_limit_warning: {
    contractId: "string",
    entitlementContractId: "string",
    licenseTier: "string",
    seatPack: "number",
    seatSoftLimit: "number",
    seatMode: "string",
    hardSeatEnforced: "boolean",
    seatHardLimit: "number",
    activeSessions: "number",
    activeUsers: "number",
    softLimitExceeded: "boolean"
  },
  seat_hard_limit_block: {
    contractId: "string",
    mode: "string",
    reason: "string",
    hardLimit: "number",
    activeUsers: "number"
  },
  password_rotation_token_issued: {},
  password_rotation_token_attempt: {
    outcome: "string",
    reason: "string",
    failedAttempts: "number",
    locked: "boolean",
    policyError: "string"
  },
  password_rotation_token_locked: {
    reason: "string",
    failedAttempts: "number"
  },
  password_rotation_token_consumed: {
    failedAttempts: "number"
  },
  user_updated: {
    actorUserId: "number",
    previousRole: "string",
    assignedRole: "string"
  },
  admin_role_assigned: {
    actorUserId: "number",
    previousRole: "string",
    assignedRole: "string"
  }
};

export function setSessionCookie(res, token, expiresAt) {
  const sameSite = resolveCookieSameSite();
  const secure = sameSite === "none" || process.env.AUTH_COOKIE_SECURE === "true";
  const domain = resolveCookieDomain();
  res.cookie(AUTH_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite,
    secure,
    domain,
    expires: expiresAt
  });
}

export function clearSessionCookie(res) {
  const sameSite = resolveCookieSameSite();
  const secure = sameSite === "none" || process.env.AUTH_COOKIE_SECURE === "true";
  const domain = resolveCookieDomain();
  res.cookie(AUTH_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite,
    secure,
    domain,
    expires: new Date(0)
  });
}

export async function createAuthSession({ userId, ipAddress = null, userAgent = null } = {}) {
  const token = crypto.randomBytes(SESSION_TOKEN_BYTES).toString("hex");
  const tokenHash = sessionTokenHash(token);
  const ttlHours = toPositiveInt(DEFAULT_SESSION_TTL_HOURS, 12);
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  const { rows } = await query(
    `INSERT INTO auth_sessions
       (user_id, session_token_hash, expires_at, ip_address, user_agent)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id`,
    [userId, tokenHash, expiresAt.toISOString(), ipAddress, userAgent]
  );
  return {
    token,
    expiresAt,
    sessionId: Number(rows[0].id)
  };
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
     RETURNING id, user_id`,
    [tokenHash, reason]
  );
  if (!rows[0]) return null;
  return {
    sessionId: Number(rows[0].id),
    userId: Number(rows[0].user_id)
  };
}

function normalizeEventPayload(eventType, metadata) {
  if (!isPlainObject(metadata)) return {};
  const rules = AUTH_EVENT_METADATA_ALLOWLIST[String(eventType || "").trim()] || {};
  const normalized = {};

  for (const [key, rule] of Object.entries(rules)) {
    if (!Object.prototype.hasOwnProperty.call(metadata, key)) continue;
    const value = sanitizeMetadataField(rule, metadata[key]);
    if (value === undefined) continue;
    normalized[key] = value;
  }

  return normalized;
}

export async function recordAuthEvent({
  eventType,
  userId = null,
  actorRole = null,
  sessionId = null,
  username = null,
  ipAddress = null,
  userAgent = null,
  metadata = {}
} = {}) {
  const normalizedEventType = String(eventType || "").trim();
  if (!normalizedEventType) return;
  const normalizedUsername = String(username || "").trim() || null;
  await query(
    `INSERT INTO auth_event_log
       (event_type, user_id, actor_role, session_id, username, ip_address, user_agent, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    [
      normalizedEventType,
      userId == null ? null : Number(userId),
      actorRole ? String(actorRole) : null,
      sessionId == null ? null : Number(sessionId),
      normalizedUsername,
      ipAddress ? String(ipAddress) : null,
      userAgent ? String(userAgent) : null,
      JSON.stringify(normalizeEventPayload(normalizedEventType, metadata))
    ]
  );
}

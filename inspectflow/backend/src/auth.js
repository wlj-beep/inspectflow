import crypto from "node:crypto";
import { query } from "./db.js";
import { getPlatformEntitlements } from "./services/platform/entitlements.js";

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

function normalizeSeatKey(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 160);
}

function mapSeatAllocationModeToStoredSeatMode(allocationMode) {
  if (allocationMode === "named") return "named_seat";
  if (allocationMode === "device") return "device_seat";
  if (allocationMode === "concurrent") return "concurrent_seat";
  return allocationMode;
}

function mapStoredSeatModeToAllocationMode(seatMode) {
  if (seatMode === "named_seat") return "named";
  if (seatMode === "device_seat") return "device";
  if (seatMode === "concurrent_seat") return "concurrent";
  return seatMode;
}

function resolveSeatAssignmentKey({ allocationMode, userId, sessionId, deviceId, userAgent, ipAddress }) {
  if (!allocationMode) return null;
  if (allocationMode === "named") return `user:${Number(userId)}`;
  if (allocationMode === "device") {
    const source = normalizeSeatKey(deviceId || userAgent || ipAddress || userId);
    return source ? `device:${source}` : `device:${Number(userId)}`;
  }
  return `session:${Number(sessionId)}`;
}

async function countActiveSessions() {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count
     FROM auth_sessions
     WHERE revoked_at IS NULL
       AND expires_at > NOW()`,
    []
  );
  return Number(rows[0]?.count || 0);
}

async function buildSeatWarning(seatPolicy) {
  if (!seatPolicy || seatPolicy.enforcement !== "warn_only") return null;
  const warningThreshold = Number(seatPolicy.warningThreshold || 0);
  if (warningThreshold <= 0) return null;

  const activeSessionCount = await countActiveSessions();
  if (activeSessionCount < warningThreshold) return null;

  const seatPack = Number(seatPolicy.seatPack || warningThreshold);
  const remainingSeats = Math.max(0, seatPack - activeSessionCount);
  const status = activeSessionCount > seatPack ? "over_capacity" : "warning";

  return {
    contractId: seatPolicy.contractId || null,
    allocationMode: seatPolicy.allocationMode || null,
    enforcement: seatPolicy.enforcement || "warn_only",
    status,
    activeSessionCount,
    warningThreshold,
    seatPack,
    remainingSeats,
    message: status === "over_capacity"
      ? `Seat usage is above the purchased pack of ${seatPack}.`
      : `Seat usage reached the warning threshold of ${warningThreshold}.`,
    auditable: true
  };
}

async function releaseSeatAssignment(sessionId, reason = "logout") {
  if (!sessionId) return;
  await query(
    `UPDATE auth_seat_assignments
     SET status='released',
         released_at=NOW(),
         release_reason=$2
     WHERE session_id=$1
       AND status='active'`,
    [sessionId, reason]
  );
}

async function allocateSeatAssignment({
  sessionId,
  userId,
  seatPolicy,
  ipAddress = null,
  userAgent = null,
  deviceId = null
} = {}) {
  const allocationMode = seatPolicy?.allocationMode || null;
  if (!allocationMode) {
    return {
      seatMode: null,
      seatKey: null,
      seatAssignmentId: null,
      reused: false,
      activeCount: 0,
      capacity: seatPolicy?.seatPack || null,
      hardSeatEnabled: false
    };
  }

  const seatKey = resolveSeatAssignmentKey({ allocationMode, userId, sessionId, deviceId, userAgent, ipAddress });
  const storedSeatMode = mapSeatAllocationModeToStoredSeatMode(allocationMode);
  if (!seatKey) {
    return { error: "seat_key_required" };
  }

  const activeAssignmentRes = await query(
    `SELECT id, session_id
     FROM auth_seat_assignments
     WHERE seat_mode=$1 AND seat_key=$2 AND status='active'
     LIMIT 1`,
    [storedSeatMode, seatKey]
  );
  if (activeAssignmentRes.rows[0]) {
    return {
      seatMode: allocationMode,
      seatKey,
      seatAssignmentId: Number(activeAssignmentRes.rows[0].id),
      reused: true,
      activeCount: null,
      capacity: seatPolicy?.seatPack || null,
      hardSeatEnabled: true
    };
  }

  const countRes = await query(
    `SELECT COUNT(*)::int AS count
     FROM auth_seat_assignments
     WHERE seat_mode=$1 AND status='active'`,
    [storedSeatMode]
  );
  const activeCount = Number(countRes.rows[0]?.count || 0);
  const capacity = Number(seatPolicy?.seatPack || 0);
  if (capacity > 0 && activeCount >= capacity) {
    return {
      error: "seat_limit_reached",
      seatMode: allocationMode,
      seatKey,
      activeCount,
      capacity,
      hardSeatEnabled: true
    };
  }

  const insertRes = await query(
    `INSERT INTO auth_seat_assignments
       (session_id, user_id, seat_mode, seat_key, status, metadata)
     VALUES ($1,$2,$3,$4,'active',$5::jsonb)
     RETURNING id`,
    [
      sessionId,
      userId,
      storedSeatMode,
      seatKey,
      JSON.stringify({
        ipAddress,
        userAgent,
        enforcement: seatPolicy?.enforcement || null
      })
    ]
  );
  return {
    seatMode: allocationMode,
    seatKey,
    seatAssignmentId: Number(insertRes.rows[0].id),
    reused: false,
    activeCount: activeCount + 1,
    capacity,
    hardSeatEnabled: true
  };
}

async function getAuthProfile() {
  const entitlements = await getPlatformEntitlements();
  return entitlements.authProfile || {
    contractId: "PLAT-ENT-v1",
    localAccountMode: true,
    directoryEnabled: false,
    mode: "local",
    providerLabel: "Local Accounts",
    issuer: null,
    tenant: null,
    loginHint: "Local account login is active."
  };
}

export function readSessionTokenFromRequest(req) {
  const cookies = parseCookieHeader(req?.headers?.cookie || "");
  return String(cookies[AUTH_SESSION_COOKIE] || "").trim() || null;
}

function sessionTokenHash(token) {
  const pepper = String(process.env.AUTH_TOKEN_PEPPER || "");
  if (!pepper && process.env.NODE_ENV !== "test") {
    throw new Error("AUTH_TOKEN_PEPPER must be set in production");
  }
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

export async function createAuthSession({
  userId,
  ipAddress = null,
  userAgent = null,
  deviceId = null,
  seatPolicy = null
} = {}) {
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
  const sessionId = Number(rows[0].id);
  const seatAssignment = await allocateSeatAssignment({
    sessionId,
    userId,
    seatPolicy,
    ipAddress,
    userAgent,
    deviceId
  });
  if (seatAssignment?.error) {
    await query(
      `UPDATE auth_sessions
       SET revoked_at=NOW(),
           revoked_reason=$2
       WHERE id=$1`,
      [sessionId, seatAssignment.error]
    );
    return {
      error: seatAssignment.error,
      seatAssignment,
      sessionId
    };
  }
  const seatWarning = await buildSeatWarning(seatPolicy);
  return {
    token,
    expiresAt,
    sessionId,
    seatAssignment,
    seatWarning
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
  const seatAssignmentRes = await query(
    `SELECT id, seat_mode, seat_key, status, allocated_at, released_at, release_reason, metadata
     FROM auth_seat_assignments
     WHERE session_id=$1 AND status='active'
     ORDER BY allocated_at DESC, id DESC
     LIMIT 1`,
    [session.session_id]
  );
  const seatAssignment = seatAssignmentRes.rows[0]
    ? {
        id: Number(seatAssignmentRes.rows[0].id),
        seatMode: mapStoredSeatModeToAllocationMode(seatAssignmentRes.rows[0].seat_mode),
        seatKey: seatAssignmentRes.rows[0].seat_key,
        status: seatAssignmentRes.rows[0].status,
        allocatedAt: seatAssignmentRes.rows[0].allocated_at,
        releasedAt: seatAssignmentRes.rows[0].released_at,
        releaseReason: seatAssignmentRes.rows[0].release_reason,
        metadata: seatAssignmentRes.rows[0].metadata || {}
      }
    : null;
  const entitlements = await getPlatformEntitlements();
  const seatWarning = await buildSeatWarning(entitlements?.packaging?.seatPolicy || null);
  return {
    sessionId: session.session_id,
    expiresAt: session.expires_at,
    seatAssignment,
    seatWarning,
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
  await releaseSeatAssignment(Number(rows[0].id), reason);
  return {
    sessionId: Number(rows[0].id),
    userId: Number(rows[0].user_id)
  };
}

function normalizeEventPayload(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return metadata;
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
      JSON.stringify(normalizeEventPayload(metadata))
    ]
  );
}

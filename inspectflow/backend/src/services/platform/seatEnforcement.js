import { query } from "../../db.js";
import {
  DEFAULT_SEAT_POLICY,
  isModuleEnabled,
  normalizeSeatPolicy
} from "./entitlements.js";

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function toSet(values) {
  const out = new Set();
  for (const value of values || []) {
    const key = normalized(value);
    if (!key) continue;
    out.add(key);
  }
  return out;
}

function concurrentLimit(entitlements, seatPolicy) {
  if (Number(seatPolicy.hardLimit || 0) > 0) return Number(seatPolicy.hardLimit);
  const soft = Number(entitlements?.seatSoftLimit || 0);
  return soft > 0 ? soft : 1;
}

export async function evaluateSeatAccess({
  entitlements,
  userId,
  username,
  deviceId = null
} = {}) {
  const seatPolicy = normalizeSeatPolicy(entitlements?.seatPolicy, DEFAULT_SEAT_POLICY);
  const hardSeatEnforced = seatPolicy.enforced === true
    && seatPolicy.mode !== "soft"
    && isModuleEnabled(entitlements, "QUALITY_PRO");

  if (!hardSeatEnforced) {
    return {
      allowed: true,
      contractId: "COMM-SEAT-v1",
      mode: "soft",
      reason: null
    };
  }

  if (seatPolicy.mode === "named") {
    const allowedUsers = toSet(seatPolicy.namedUsers);
    if (!allowedUsers.has(normalized(username))) {
      return {
        allowed: false,
        contractId: "COMM-SEAT-v2",
        mode: "named",
        reason: "seat_user_not_entitled",
        errorCode: "seat_user_not_entitled"
      };
    }
    return { allowed: true, contractId: "COMM-SEAT-v2", mode: "named", reason: null };
  }

  if (seatPolicy.mode === "device") {
    const normalizedDeviceId = normalized(deviceId);
    if (!normalizedDeviceId) {
      return {
        allowed: false,
        contractId: "COMM-SEAT-v2",
        mode: "device",
        reason: "seat_device_id_required",
        errorCode: "seat_device_id_required"
      };
    }
    const allowedDevices = toSet(seatPolicy.allowedDevices);
    if (!allowedDevices.has(normalizedDeviceId)) {
      return {
        allowed: false,
        contractId: "COMM-SEAT-v2",
        mode: "device",
        reason: "seat_device_not_entitled",
        errorCode: "seat_device_not_entitled"
      };
    }
    return { allowed: true, contractId: "COMM-SEAT-v2", mode: "device", reason: null };
  }

  if (seatPolicy.mode === "concurrent") {
    const hardLimit = concurrentLimit(entitlements, seatPolicy);
    const { rows } = await query(
      `SELECT
         COUNT(DISTINCT user_id)::int AS active_users,
         BOOL_OR(user_id = $1) AS user_has_session
       FROM auth_sessions
       WHERE revoked_at IS NULL
         AND expires_at > NOW()`,
      [userId]
    );
    const row = rows[0] || {};
    const activeUsers = Number(row.active_users || 0);
    const userHasSession = row.user_has_session === true;
    if (!userHasSession && activeUsers >= hardLimit) {
      return {
        allowed: false,
        contractId: "COMM-SEAT-v2",
        mode: "concurrent",
        reason: "seat_concurrent_limit_reached",
        errorCode: "seat_concurrent_limit_reached",
        hardLimit,
        activeUsers
      };
    }
    return { allowed: true, contractId: "COMM-SEAT-v2", mode: "concurrent", reason: null, hardLimit };
  }

  return { allowed: true, contractId: "COMM-SEAT-v2", mode: seatPolicy.mode, reason: null };
}

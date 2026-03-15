import { query } from "../../db.js";

export const PLATFORM_ENTITLEMENT_CONTRACT_ID = "PLAT-ENT-v1";

export const DEFAULT_MODULE_FLAGS = Object.freeze({
  CORE: true,
  QUALITY_PRO: false,
  INTEGRATION_SUITE: false,
  ANALYTICS_SUITE: false,
  MULTISITE: false,
  EDGE: false
});

export const MODULE_FLAG_KEYS = Object.freeze(Object.keys(DEFAULT_MODULE_FLAGS));
export const VALID_SEAT_MODES = Object.freeze(["soft", "named", "device", "concurrent"]);
export const DEFAULT_SEAT_POLICY = Object.freeze({
  mode: "soft",
  enforced: false,
  hardLimit: 0,
  namedUsers: [],
  allowedDevices: []
});

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeModuleFlags(moduleFlags) {
  const source = asObject(moduleFlags);
  const normalized = {};
  for (const key of MODULE_FLAG_KEYS) {
    normalized[key] = source[key] === true;
  }
  return normalized;
}

function toPositiveInt(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function toNonNegativeInt(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function normalizeStringList(list, fallback = []) {
  const source = Array.isArray(list) ? list : fallback;
  const deduped = new Set();
  for (const entry of source) {
    const value = String(entry || "").trim();
    if (!value) continue;
    deduped.add(value);
  }
  return Array.from(deduped);
}

export function normalizeSeatPolicy(seatPolicy, fallback = DEFAULT_SEAT_POLICY) {
  const source = asObject(seatPolicy);
  const base = asObject(fallback);
  const modeCandidate = String(source.mode ?? base.mode ?? DEFAULT_SEAT_POLICY.mode)
    .trim()
    .toLowerCase();
  const mode = VALID_SEAT_MODES.includes(modeCandidate) ? modeCandidate : DEFAULT_SEAT_POLICY.mode;
  const enforced = source.enforced === undefined
    ? base.enforced === true
    : source.enforced === true;
  const hardLimit = toNonNegativeInt(
    source.hardLimit ?? base.hardLimit ?? DEFAULT_SEAT_POLICY.hardLimit,
    DEFAULT_SEAT_POLICY.hardLimit
  );
  if (hardLimit == null) {
    const err = new Error("invalid_seat_hard_limit");
    err.status = 400;
    err.code = "invalid_seat_hard_limit";
    throw err;
  }

  return {
    mode,
    enforced,
    hardLimit,
    namedUsers: source.namedUsers === undefined
      ? normalizeStringList(base.namedUsers, DEFAULT_SEAT_POLICY.namedUsers)
      : normalizeStringList(source.namedUsers, DEFAULT_SEAT_POLICY.namedUsers),
    allowedDevices: source.allowedDevices === undefined
      ? normalizeStringList(base.allowedDevices, DEFAULT_SEAT_POLICY.allowedDevices)
      : normalizeStringList(source.allowedDevices, DEFAULT_SEAT_POLICY.allowedDevices)
  };
}

function mapEntitlements(row) {
  const flags = normalizeModuleFlags(row?.module_flags);
  const seatPolicy = normalizeSeatPolicy(row?.seat_policy, DEFAULT_SEAT_POLICY);
  const enabledModules = MODULE_FLAG_KEYS.filter((key) => flags[key]);
  return {
    contractId: PLATFORM_ENTITLEMENT_CONTRACT_ID,
    licenseTier: row?.license_tier || "core",
    seatPack: Number(row?.seat_pack || 25),
    seatSoftLimit: Number(row?.seat_soft_limit || row?.seat_pack || 25),
    seatPolicy,
    diagnosticsOptIn: row?.diagnostics_opt_in === true,
    moduleFlags: flags,
    enabledModules,
    updatedAt: row?.updated_at || null,
    updatedByUserId: row?.updated_by_user_id == null ? null : Number(row.updated_by_user_id)
  };
}

async function ensureEntitlementsRow() {
  await query(
    `INSERT INTO platform_entitlements
       (id, contract_id, license_tier, seat_pack, seat_soft_limit, seat_policy, diagnostics_opt_in, module_flags)
     VALUES (1, $1, 'core', 25, 25, $2::jsonb, false, $3::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [
      PLATFORM_ENTITLEMENT_CONTRACT_ID,
      JSON.stringify(DEFAULT_SEAT_POLICY),
      JSON.stringify(DEFAULT_MODULE_FLAGS)
    ]
  );
}

export async function getPlatformEntitlements() {
  await ensureEntitlementsRow();
  const { rows } = await query(
    `SELECT contract_id, license_tier, seat_pack, seat_soft_limit, seat_policy, diagnostics_opt_in,
            module_flags, updated_at, updated_by_user_id
     FROM platform_entitlements
     WHERE id=1
     LIMIT 1`,
    []
  );
  return mapEntitlements(rows[0] || null);
}

export async function updatePlatformEntitlements({
  licenseTier,
  seatPack,
  seatSoftLimit,
  seatPolicy,
  diagnosticsOptIn,
  moduleFlags,
  updatedByUserId = null
} = {}) {
  await ensureEntitlementsRow();
  const current = await getPlatformEntitlements();

  const nextSeatPack = toPositiveInt(seatPack, current.seatPack);
  if (nextSeatPack == null) {
    const err = new Error("invalid_seat_pack");
    err.status = 400;
    err.code = "invalid_seat_pack";
    throw err;
  }

  const nextSeatSoftLimit = toPositiveInt(seatSoftLimit, current.seatSoftLimit);
  if (nextSeatSoftLimit == null) {
    const err = new Error("invalid_seat_soft_limit");
    err.status = 400;
    err.code = "invalid_seat_soft_limit";
    throw err;
  }

  const nextLicenseTier = String(licenseTier ?? current.licenseTier).trim() || current.licenseTier;
  const nextDiagnosticsOptIn = diagnosticsOptIn === undefined ? current.diagnosticsOptIn : diagnosticsOptIn === true;
  const nextSeatPolicy = seatPolicy === undefined
    ? current.seatPolicy
    : normalizeSeatPolicy(seatPolicy, current.seatPolicy);
  const nextModuleFlags = moduleFlags === undefined
    ? current.moduleFlags
    : normalizeModuleFlags(moduleFlags);

  await query(
    `UPDATE platform_entitlements
     SET contract_id=$1,
         license_tier=$2,
         seat_pack=$3,
         seat_soft_limit=$4,
         seat_policy=$5::jsonb,
         diagnostics_opt_in=$6,
         module_flags=$7::jsonb,
         updated_by_user_id=$8,
         updated_at=NOW()
     WHERE id=1`,
    [
      PLATFORM_ENTITLEMENT_CONTRACT_ID,
      nextLicenseTier,
      nextSeatPack,
      nextSeatSoftLimit,
      JSON.stringify(nextSeatPolicy),
      nextDiagnosticsOptIn,
      JSON.stringify(nextModuleFlags),
      updatedByUserId
    ]
  );

  return getPlatformEntitlements();
}

export function isModuleEnabled(entitlements, moduleKey) {
  const key = String(moduleKey || "").trim().toUpperCase();
  if (!MODULE_FLAG_KEYS.includes(key)) return false;
  return entitlements?.moduleFlags?.[key] === true;
}

export async function getSeatUsageSnapshot(entitlementsInput = null) {
  const entitlements = entitlementsInput || await getPlatformEntitlements();
  const seatPolicy = normalizeSeatPolicy(entitlements?.seatPolicy, DEFAULT_SEAT_POLICY);
  const { rows } = await query(
    `SELECT
       COUNT(*)::int AS active_sessions,
       COUNT(DISTINCT user_id)::int AS active_users
     FROM auth_sessions
     WHERE revoked_at IS NULL
       AND expires_at > NOW()`,
    []
  );
  const row = rows[0] || {};
  const activeSessions = Number(row.active_sessions || 0);
  const activeUsers = Number(row.active_users || 0);
  const seatPack = Number(entitlements?.seatPack || 0);
  const seatSoftLimit = Number(entitlements?.seatSoftLimit || seatPack || 0);
  const hardSeatEnforced = seatPolicy.enforced === true && seatPolicy.mode !== "soft";
  const seatHardLimit = Number(seatPolicy.hardLimit || 0);
  const softLimitWarning = seatSoftLimit > 0 && activeUsers >= seatSoftLimit;
  const softLimitExceeded = seatSoftLimit > 0 && activeUsers > seatSoftLimit;

  return {
    contractId: hardSeatEnforced ? "COMM-SEAT-v2" : "COMM-SEAT-v1",
    entitlementContractId: PLATFORM_ENTITLEMENT_CONTRACT_ID,
    licenseTier: entitlements?.licenseTier || "core",
    seatPack,
    seatSoftLimit,
    seatMode: seatPolicy.mode,
    hardSeatEnforced,
    seatHardLimit,
    activeSessions,
    activeUsers,
    softLimitWarning,
    softLimitExceeded,
    remainingSoftSeats: seatSoftLimit > 0 ? Math.max(seatSoftLimit - activeUsers, 0) : null,
    percentSoftUsed: seatSoftLimit > 0 ? Number(((activeUsers / seatSoftLimit) * 100).toFixed(1)) : null
  };
}

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

function mapEntitlements(row) {
  const flags = normalizeModuleFlags(row?.module_flags);
  const enabledModules = MODULE_FLAG_KEYS.filter((key) => flags[key]);
  return {
    contractId: PLATFORM_ENTITLEMENT_CONTRACT_ID,
    licenseTier: row?.license_tier || "core",
    seatPack: Number(row?.seat_pack || 25),
    seatSoftLimit: Number(row?.seat_soft_limit || row?.seat_pack || 25),
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
       (id, contract_id, license_tier, seat_pack, seat_soft_limit, diagnostics_opt_in, module_flags)
     VALUES (1, $1, 'core', 25, 25, false, $2::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [PLATFORM_ENTITLEMENT_CONTRACT_ID, JSON.stringify(DEFAULT_MODULE_FLAGS)]
  );
}

export async function getPlatformEntitlements() {
  await ensureEntitlementsRow();
  const { rows } = await query(
    `SELECT contract_id, license_tier, seat_pack, seat_soft_limit, diagnostics_opt_in,
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
  const nextModuleFlags = moduleFlags === undefined
    ? current.moduleFlags
    : normalizeModuleFlags(moduleFlags);

  await query(
    `UPDATE platform_entitlements
     SET contract_id=$1,
         license_tier=$2,
         seat_pack=$3,
         seat_soft_limit=$4,
         diagnostics_opt_in=$5,
         module_flags=$6::jsonb,
         updated_by_user_id=$7,
         updated_at=NOW()
     WHERE id=1`,
    [
      PLATFORM_ENTITLEMENT_CONTRACT_ID,
      nextLicenseTier,
      nextSeatPack,
      nextSeatSoftLimit,
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

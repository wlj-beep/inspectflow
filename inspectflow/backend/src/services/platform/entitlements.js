import { query } from "../../db.js";

export const PLATFORM_ENTITLEMENT_CONTRACT_ID = "PLAT-ENT-v1";
export const COMM_PACKAGING_CONTRACT_ID = "COMM-PACKAGING-v1";
export const COMM_LICENSE_CONTRACT_ID = "COMM-LICENSE-v1";
export const COMM_SEAT_CONTRACT_ID = "COMM-SEAT-v1";
export const COMM_SEAT_HARD_CONTRACT_ID = "COMM-SEAT-v2";
export const AUTH_PROFILE_CONTRACT_ID = "PLAT-AUTH-v1";

export const DEFAULT_MODULE_FLAGS = Object.freeze({
  CORE: true,
  QUALITY_PRO: false,
  INTEGRATION_SUITE: false,
  ANALYTICS_SUITE: false,
  MULTISITE: false,
  EDGE: false
});

export const MODULE_FLAG_KEYS = Object.freeze(Object.keys(DEFAULT_MODULE_FLAGS));

const MODULE_BUNDLE_DEFINITIONS = Object.freeze([
  {
    bundleId: "core_site",
    label: "Core Site",
    category: "base",
    moduleKeys: ["CORE"],
    defaultEnabled: true,
    summary: "Per-site perpetual core workflows and update rights."
  },
  {
    bundleId: "quality_pro",
    label: "Quality Pro",
    category: "expansion",
    moduleKeys: ["QUALITY_PRO"],
    defaultEnabled: false,
    summary: "Unlocks advanced quality workflows such as CAPA, controlled documents, training, and supplier quality."
  },
  {
    bundleId: "integration_suite",
    label: "Integration Suite",
    category: "expansion",
    moduleKeys: ["INTEGRATION_SUITE"],
    defaultEnabled: false,
    summary: "Adds managed ERP, MES, and metrology integration pathways."
  },
  {
    bundleId: "analytics_suite",
    label: "Analytics Suite",
    category: "expansion",
    moduleKeys: ["ANALYTICS_SUITE"],
    defaultEnabled: false,
    summary: "Adds KPI, SPC, and risk-oriented analytics surfaces."
  },
  {
    bundleId: "multisite",
    label: "Multi-site",
    category: "expansion",
    moduleKeys: ["MULTISITE"],
    defaultEnabled: false,
    summary: "Extends entitlement scope to customer sites that need partition-safe rollups."
  },
  {
    bundleId: "edge",
    label: "Edge Capture",
    category: "expansion",
    moduleKeys: ["EDGE"],
    defaultEnabled: false,
    summary: "Adds edge and offline-adjacent capture options where available."
  }
]);

const MODULE_BUNDLE_IDS = Object.freeze(MODULE_BUNDLE_DEFINITIONS.map((bundle) => bundle.bundleId));
const MODULE_BUNDLE_BY_ID = Object.freeze(
  MODULE_BUNDLE_DEFINITIONS.reduce((acc, bundle) => {
    acc[bundle.bundleId] = bundle;
    return acc;
  }, {})
);

const DIRECTORY_AUTH_MODE_DEFINITIONS = Object.freeze([
  {
    modeId: "local",
    label: "Local Accounts",
    summary: "Use the built-in username and password login flow."
  },
  {
    modeId: "ad",
    label: "Active Directory",
    summary: "Allow directory-backed sign-in while preserving local account fallback."
  },
  {
    modeId: "sso",
    label: "Single Sign-On",
    summary: "Allow an external identity provider while preserving local account fallback."
  },
  {
    modeId: "hybrid",
    label: "Hybrid Auth",
    summary: "Show both directory and local account sign-in paths."
  }
]);

const DIRECTORY_AUTH_MODE_BY_ID = Object.freeze(
  DIRECTORY_AUTH_MODE_DEFINITIONS.reduce((acc, mode) => {
    acc[mode.modeId] = mode;
    return acc;
  }, {})
);

const SEAT_POLICY_OPTION_DEFINITIONS = Object.freeze([
  {
    optionId: "soft_visibility",
    label: "Soft Visibility",
    contractId: COMM_SEAT_CONTRACT_ID,
    enforcement: "warn_only",
    allocationMode: null,
    hardSeat: false,
    previewOnly: false,
    summary: "Warn at the purchased seat count without blocking licensed users."
  },
  {
    optionId: "soft_buffer",
    label: "Soft Buffer",
    contractId: COMM_SEAT_CONTRACT_ID,
    enforcement: "warn_only",
    allocationMode: null,
    hardSeat: false,
    previewOnly: false,
    summary: "Warn before the purchased seat count so admins have time to review expansion needs."
  },
  {
    optionId: "named_seat",
    label: "Named Seats",
    contractId: COMM_SEAT_HARD_CONTRACT_ID,
    enforcement: "hard_stop",
    allocationMode: "named",
    hardSeat: true,
    previewOnly: false,
    summary: "Assign one paid seat to each named user and block overage automatically."
  },
  {
    optionId: "device_seat",
    label: "Device Seats",
    contractId: COMM_SEAT_HARD_CONTRACT_ID,
    enforcement: "hard_stop",
    allocationMode: "device",
    hardSeat: true,
    previewOnly: false,
    summary: "Assign seats to devices so a shared workstation can reuse the same licensed slot."
  },
  {
    optionId: "concurrent_seat",
    label: "Concurrent Seats",
    contractId: COMM_SEAT_HARD_CONTRACT_ID,
    enforcement: "hard_stop",
    allocationMode: "concurrent",
    hardSeat: true,
    previewOnly: false,
    summary: "Block new sessions once the purchased concurrent seat count is exhausted."
  },
  {
    optionId: "hard_cap_upgrade",
    label: "Hard Cap Upgrade",
    contractId: COMM_SEAT_HARD_CONTRACT_ID,
    enforcement: "hard_stop",
    allocationMode: "concurrent",
    hardSeat: true,
    previewOnly: true,
    summary: "Optional paid enforcement path for customers that require automatic cap blocking."
  }
]);

const SEAT_POLICY_OPTION_BY_ID = Object.freeze(
  SEAT_POLICY_OPTION_DEFINITIONS.reduce((acc, option) => {
    acc[option.optionId] = option;
    return acc;
  }, {})
);

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildDefaultEntitlements() {
  return mapPlatformEntitlements({
    contract_id: PLATFORM_ENTITLEMENT_CONTRACT_ID,
    license_tier: "core",
    seat_pack: 25,
    seat_soft_limit: 25,
    seat_policy_option_id: "soft_visibility",
    hard_seat_enabled: false,
    directory_auth_enabled: false,
    directory_auth_mode: "local",
    directory_auth_label: null,
    directory_auth_issuer: null,
    directory_auth_tenant: null,
    diagnostics_opt_in: false,
    module_flags: DEFAULT_MODULE_FLAGS,
    updated_at: null,
    updated_by_user_id: null
  });
}

function makeContractError(code, status = 400) {
  const err = new Error(code);
  err.status = status;
  err.code = code;
  return err;
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

function normalizeBundleIds(bundleIds) {
  if (bundleIds === undefined) return null;
  if (!Array.isArray(bundleIds)) throw makeContractError("invalid_packaging_bundle_ids");
  const normalized = [];
  for (const rawId of bundleIds) {
    const bundleId = String(rawId || "").trim().toLowerCase();
    if (!bundleId) continue;
    if (!MODULE_BUNDLE_IDS.includes(bundleId)) throw makeContractError("invalid_packaging_bundle_id");
    if (!normalized.includes(bundleId)) normalized.push(bundleId);
  }
  if (!normalized.includes("core_site")) normalized.unshift("core_site");
  return normalized;
}

function normalizeSeatPolicyOptionId(optionId) {
  if (optionId === undefined || optionId === null || optionId === "") return null;
  const normalized = String(optionId).trim().toLowerCase();
  if (!SEAT_POLICY_OPTION_BY_ID[normalized]) throw makeContractError("invalid_seat_policy_option");
  return normalized;
}

function buildModuleFlagsFromBundleIds(bundleIds) {
  const normalized = normalizeModuleFlags({});
  normalized.CORE = true;
  for (const bundleId of bundleIds || []) {
    const bundle = MODULE_BUNDLE_BY_ID[bundleId];
    if (!bundle) continue;
    for (const moduleKey of bundle.moduleKeys) {
      normalized[moduleKey] = true;
    }
  }
  return normalized;
}

function isHardSeatOption(optionId) {
  const option = SEAT_POLICY_OPTION_BY_ID[optionId];
  return option?.hardSeat === true;
}

function resolveSeatPolicyOptionId(seatPack, seatSoftLimit, hardSeatEnabled = false) {
  if (seatSoftLimit < seatPack) return "soft_buffer";
  if (hardSeatEnabled) return "soft_visibility";
  return "soft_visibility";
}

function resolveSeatSoftLimitForOption(optionId, seatPack, currentSeatSoftLimit) {
  if (optionId === "soft_visibility") return seatPack;
  if (optionId === "soft_buffer") {
    if (currentSeatSoftLimit > 0 && currentSeatSoftLimit < seatPack) return currentSeatSoftLimit;
    const bufferSeats = Math.max(1, Math.min(5, Math.ceil(seatPack * 0.1)));
    return Math.max(1, seatPack - bufferSeats);
  }
  return currentSeatSoftLimit;
}

function buildAuthIntegrationProfile({
  directoryAuthEnabled = false,
  directoryAuthMode = "local",
  directoryAuthLabel = null,
  directoryAuthIssuer = null,
  directoryAuthTenant = null
} = {}) {
  const mode = DIRECTORY_AUTH_MODE_BY_ID[String(directoryAuthMode || "local").toLowerCase()] ? String(directoryAuthMode || "local").toLowerCase() : "local";
  const provider = DIRECTORY_AUTH_MODE_BY_ID[mode] || DIRECTORY_AUTH_MODE_BY_ID.local;
  const label = String(directoryAuthLabel || provider.label).trim() || provider.label;
  const enabled = directoryAuthEnabled === true;
  return {
    contractId: AUTH_PROFILE_CONTRACT_ID,
    localAccountMode: true,
    directoryEnabled: enabled,
    mode: enabled ? mode : "local",
    providerLabel: enabled ? label : DIRECTORY_AUTH_MODE_BY_ID.local.label,
    issuer: enabled ? (String(directoryAuthIssuer || "").trim() || null) : null,
    tenant: enabled ? (String(directoryAuthTenant || "").trim() || null) : null,
    title: enabled ? `${label} sign-in available` : "Local accounts enabled",
    message: enabled
      ? `${label} is configured, and local accounts remain available.`
      : "Authenticate with a local account to open protected production workflows.",
    summary: enabled
      ? `${label} can coexist with local account sign-in.`
      : "Local account login is active.",
    actionLabel: enabled ? "Use local sign-in" : null,
    actionUrl: null,
    loginHint: enabled
      ? `${label} is configured, and local accounts remain available.`
      : "Local account login is active."
  };
}

function buildSeatPolicyOptions({ hardSeatEnabled = false, activeOptionId = "soft_visibility" } = {}) {
  return SEAT_POLICY_OPTION_DEFINITIONS
    .filter((option) => hardSeatEnabled || option.hardSeat === false)
    .map((option) => ({
      optionId: option.optionId,
      label: option.label,
      contractId: option.contractId,
      enforcement: option.enforcement,
      allocationMode: option.allocationMode,
      hardSeat: option.hardSeat === true,
      previewOnly: option.previewOnly === true,
      active: option.optionId === activeOptionId,
      summary: option.summary
    }));
}

function resolveActiveBundleIds(moduleFlags) {
  return MODULE_BUNDLE_DEFINITIONS
    .filter((bundle) => bundle.moduleKeys.every((moduleKey) => moduleFlags[moduleKey] === true))
    .map((bundle) => bundle.bundleId);
}

function buildSeatPolicy({ seatPack, seatSoftLimit, seatPolicyOptionId, hardSeatEnabled }) {
  const requestedOptionId = normalizeSeatPolicyOptionId(seatPolicyOptionId);
  const optionId = requestedOptionId || resolveSeatPolicyOptionId(seatPack, seatSoftLimit, hardSeatEnabled);
  const option = SEAT_POLICY_OPTION_BY_ID[optionId];
  if (!option) throw makeContractError("invalid_seat_policy_option");
  if (isHardSeatOption(optionId) && hardSeatEnabled !== true) {
    throw makeContractError("hard_seat_disabled");
  }
  const allocationMode = option.allocationMode || null;
  return {
    optionId,
    label: option.label,
    contractId: option.contractId,
    enforcement: option.enforcement,
    allocationMode,
    hardSeatEnabled: hardSeatEnabled === true,
    previewOnly: option.previewOnly === true,
    summary: option.summary,
    seatPack,
    seatSoftLimit,
    warningThreshold: seatSoftLimit,
    bufferSeats: Math.max(0, seatPack - seatSoftLimit),
    availableModes: buildSeatPolicyOptions({
      hardSeatEnabled: hardSeatEnabled === true,
      activeOptionId: optionId
    })
  };
}

function buildUpgradePrompts({ moduleFlags, seatPolicy, hardSeatEnabled }) {
  const prompts = [];
  if (moduleFlags.QUALITY_PRO !== true) {
    prompts.push({
      promptId: "upgrade_quality_pro",
      targetType: "bundle",
      targetId: "quality_pro",
      title: "Unlock Quality Pro workflows",
      detail: "Add CAPA, controlled documents, training, supplier quality, and advanced compliance tools.",
      contractMapping: {
        entitlementsContractId: PLATFORM_ENTITLEMENT_CONTRACT_ID,
        commercialContractId: COMM_LICENSE_CONTRACT_ID
      }
    });
  }
  if (moduleFlags.INTEGRATION_SUITE !== true) {
    prompts.push({
      promptId: "upgrade_integration_suite",
      targetType: "bundle",
      targetId: "integration_suite",
      title: "Add connected import bundles",
      detail: "Enable managed ERP, MES, and metrology onboarding paths without custom forks.",
      contractMapping: {
        entitlementsContractId: PLATFORM_ENTITLEMENT_CONTRACT_ID,
        commercialContractId: COMM_LICENSE_CONTRACT_ID
      }
    });
  }
  if (moduleFlags.ANALYTICS_SUITE !== true) {
    prompts.push({
      promptId: "upgrade_analytics_suite",
      targetType: "bundle",
      targetId: "analytics_suite",
      title: "Add analytics and SPC visibility",
      detail: "Expose KPI, SPC, and risk rollups for leadership and customer review workflows.",
      contractMapping: {
        entitlementsContractId: PLATFORM_ENTITLEMENT_CONTRACT_ID,
        commercialContractId: COMM_LICENSE_CONTRACT_ID
      }
    });
  }
  if (moduleFlags.MULTISITE !== true) {
    prompts.push({
      promptId: "upgrade_multisite",
      targetType: "bundle",
      targetId: "multisite",
      title: "Expand to multi-site governance",
      detail: "Add partition-safe rollups and customer site expansion support when one site is no longer enough.",
      contractMapping: {
        entitlementsContractId: PLATFORM_ENTITLEMENT_CONTRACT_ID,
        commercialContractId: COMM_LICENSE_CONTRACT_ID
      }
    });
  }
  if (moduleFlags.EDGE !== true) {
    prompts.push({
      promptId: "upgrade_edge",
      targetType: "bundle",
      targetId: "edge",
      title: "Add edge capture options",
      detail: "Introduce edge-friendly capture coverage for constrained or semi-connected environments.",
      contractMapping: {
        entitlementsContractId: PLATFORM_ENTITLEMENT_CONTRACT_ID,
        commercialContractId: COMM_LICENSE_CONTRACT_ID
      }
    });
  }
  if (hardSeatEnabled !== true) {
    prompts.push({
      promptId: "upgrade_hard_seat_policy",
      targetType: "seat_policy",
      targetId: "hard_seat_modes",
      title: "Offer enforced seat caps",
      detail: "Enable named, device, or concurrent hard-seat policies for customers that require automatic overage blocking instead of warnings.",
      contractMapping: {
        entitlementsContractId: PLATFORM_ENTITLEMENT_CONTRACT_ID,
        commercialContractId: COMM_SEAT_HARD_CONTRACT_ID
      }
    });
  }
  return prompts;
}

export function buildPackagingMetadata({
  licenseTier,
  seatPack,
  seatSoftLimit,
  seatPolicyOptionId,
  hardSeatEnabled = false,
  directoryAuthEnabled = false,
  directoryAuthMode = "local",
  directoryAuthLabel = null,
  directoryAuthIssuer = null,
  directoryAuthTenant = null,
  moduleFlags
}) {
  const activeBundleIds = resolveActiveBundleIds(moduleFlags);
  const seatPolicy = buildSeatPolicy({
    seatPack,
    seatSoftLimit,
    seatPolicyOptionId,
    hardSeatEnabled
  });
  const authProfile = buildAuthIntegrationProfile({
    directoryAuthEnabled,
    directoryAuthMode,
    directoryAuthLabel,
    directoryAuthIssuer,
    directoryAuthTenant
  });
  return {
    contractId: COMM_PACKAGING_CONTRACT_ID,
    licenseContractId: COMM_LICENSE_CONTRACT_ID,
    currentLicenseTier: licenseTier,
    hardSeatEnabled: hardSeatEnabled === true,
    activeBundleIds,
    activeBundles: activeBundleIds.map((bundleId) => ({
      bundleId,
      label: MODULE_BUNDLE_BY_ID[bundleId]?.label || bundleId,
      moduleKeys: MODULE_BUNDLE_BY_ID[bundleId]?.moduleKeys || []
    })),
    bundleCatalog: MODULE_BUNDLE_DEFINITIONS.map((bundle) => ({
      bundleId: bundle.bundleId,
      label: bundle.label,
      category: bundle.category,
      moduleKeys: bundle.moduleKeys,
      defaultEnabled: bundle.defaultEnabled === true,
      active: activeBundleIds.includes(bundle.bundleId),
      summary: bundle.summary,
      contractId: COMM_LICENSE_CONTRACT_ID
    })),
    authProfile,
    seatPolicy,
    seatPolicyOptions: buildSeatPolicyOptions({
      hardSeatEnabled: hardSeatEnabled === true,
      activeOptionId: seatPolicy.optionId
    }),
    upgradePrompts: buildUpgradePrompts({ moduleFlags, seatPolicy, hardSeatEnabled }),
    contractMapping: {
      entitlementsContractId: PLATFORM_ENTITLEMENT_CONTRACT_ID,
      licenseContractId: COMM_LICENSE_CONTRACT_ID,
      seatContractId: seatPolicy.contractId,
      auditedFields: [
        "licenseTier",
        "seatPack",
        "seatSoftLimit",
        "seatPolicyOptionId",
        "hardSeatEnabled",
        "directoryAuthEnabled",
        "directoryAuthMode",
        "moduleFlags",
        "diagnosticsOptIn"
      ]
    }
  };
}

export function summarizePackagingForAudit(packaging) {
  const source = asObject(packaging);
  return {
    contractId: source.contractId || COMM_PACKAGING_CONTRACT_ID,
    licenseContractId: source.licenseContractId || COMM_LICENSE_CONTRACT_ID,
    hardSeatEnabled: source.hardSeatEnabled === true,
    activeBundleIds: asArray(source.activeBundleIds),
    authProfile: asObject(source.authProfile),
    seatPolicy: {
      optionId: source.seatPolicy?.optionId || null,
      contractId: source.seatPolicy?.contractId || null,
      warningThreshold: source.seatPolicy?.warningThreshold ?? null,
      allocationMode: source.seatPolicy?.allocationMode || null
    },
    upgradePromptIds: asArray(source.upgradePrompts).map((prompt) => prompt?.promptId).filter(Boolean),
    contractMapping: asObject(source.contractMapping)
  };
}

export function mapPlatformEntitlements(row) {
  const flags = normalizeModuleFlags(row?.module_flags);
  const enabledModules = MODULE_FLAG_KEYS.filter((key) => flags[key]);
  const licenseTier = row?.license_tier || "core";
  const seatPack = Number(row?.seat_pack || 25);
  const seatSoftLimit = Number(row?.seat_soft_limit || row?.seat_pack || 25);
  const hardSeatEnabled = row?.hard_seat_enabled === true;
  const directoryAuthEnabled = row?.directory_auth_enabled === true;
  const directoryAuthMode = row?.directory_auth_mode || "local";
  return {
    contractId: PLATFORM_ENTITLEMENT_CONTRACT_ID,
    licenseTier,
    seatPack,
    seatSoftLimit,
    seatPolicyOptionId: row?.seat_policy_option_id || "soft_visibility",
    hardSeatEnabled,
    directoryAuthEnabled,
    directoryAuthMode,
    directoryAuthLabel: row?.directory_auth_label || null,
    directoryAuthIssuer: row?.directory_auth_issuer || null,
    directoryAuthTenant: row?.directory_auth_tenant || null,
    diagnosticsOptIn: row?.diagnostics_opt_in === true,
    moduleFlags: flags,
    enabledModules,
    authProfile: buildAuthIntegrationProfile({
      directoryAuthEnabled,
      directoryAuthMode,
      directoryAuthLabel: row?.directory_auth_label || null,
      directoryAuthIssuer: row?.directory_auth_issuer || null,
      directoryAuthTenant: row?.directory_auth_tenant || null
    }),
    packaging: buildPackagingMetadata({
      licenseTier,
      seatPack,
      seatSoftLimit,
      seatPolicyOptionId: row?.seat_policy_option_id || "soft_visibility",
      hardSeatEnabled,
      directoryAuthEnabled,
      directoryAuthMode,
      directoryAuthLabel: row?.directory_auth_label || null,
      directoryAuthIssuer: row?.directory_auth_issuer || null,
      directoryAuthTenant: row?.directory_auth_tenant || null,
      moduleFlags: flags
    }),
    updatedAt: row?.updated_at || null,
    updatedByUserId: row?.updated_by_user_id == null ? null : Number(row.updated_by_user_id)
  };
}

async function ensureEntitlementsRow() {
  await query(
    `INSERT INTO platform_entitlements
       (id, contract_id, license_tier, seat_pack, seat_soft_limit, seat_policy_option_id, hard_seat_enabled,
        directory_auth_enabled, directory_auth_mode, directory_auth_label, directory_auth_issuer, directory_auth_tenant,
        diagnostics_opt_in, module_flags)
     VALUES (1, $1, 'core', 25, 25, 'soft_visibility', false, false, 'local', NULL, NULL, NULL, false, $2::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [PLATFORM_ENTITLEMENT_CONTRACT_ID, JSON.stringify(DEFAULT_MODULE_FLAGS)]
  );
}

export async function getPlatformEntitlements() {
  try {
    await ensureEntitlementsRow();
    const { rows } = await query(
      `SELECT contract_id, license_tier, seat_pack, seat_soft_limit, seat_policy_option_id, hard_seat_enabled,
              directory_auth_enabled, directory_auth_mode, directory_auth_label, directory_auth_issuer, directory_auth_tenant,
              diagnostics_opt_in, module_flags, updated_at, updated_by_user_id
       FROM platform_entitlements
       WHERE id=1
       LIMIT 1`,
      []
    );
    return mapPlatformEntitlements(rows[0] || null);
  } catch (error) {
    if (String(error?.code || "") === "42P01") {
      return buildDefaultEntitlements();
    }
    throw error;
  }
}

export async function updatePlatformEntitlements({
  licenseTier,
  seatPack,
  seatSoftLimit,
  seatPolicyOptionId,
  hardSeatEnabled,
  directoryAuthEnabled,
  directoryAuthMode,
  directoryAuthLabel,
  directoryAuthIssuer,
  directoryAuthTenant,
  diagnosticsOptIn,
  moduleFlags,
  packaging,
  updatedByUserId = null
} = {}) {
  await ensureEntitlementsRow();
  const current = await getPlatformEntitlements();
  const requestedPackaging = asObject(packaging);
  const requestedBundleIds = normalizeBundleIds(requestedPackaging.bundleIds);
  const requestedSeatPolicyOptionId = normalizeSeatPolicyOptionId(requestedPackaging.seatPolicyOptionId);
  const requestedHardSeatEnabled = requestedPackaging.hardSeatEnabled;
  const requestedDirectoryAuthEnabled = requestedPackaging.directoryAuthEnabled;
  const requestedDirectoryAuthMode = requestedPackaging.directoryAuthMode;
  const requestedDirectoryAuthLabel = requestedPackaging.directoryAuthLabel;
  const requestedDirectoryAuthIssuer = requestedPackaging.directoryAuthIssuer;
  const requestedDirectoryAuthTenant = requestedPackaging.directoryAuthTenant;
  const requestedLicenseTier = requestedPackaging.licenseTier ?? licenseTier;

  const nextSeatPack = toPositiveInt(seatPack ?? requestedPackaging.seatPack, current.seatPack);
  if (nextSeatPack == null) {
    throw makeContractError("invalid_seat_pack");
  }

  let nextSeatSoftLimit = toPositiveInt(
    seatSoftLimit ?? requestedPackaging.seatSoftLimit,
    current.seatSoftLimit
  );
  if (
    seatSoftLimit === undefined
    && requestedPackaging.seatSoftLimit === undefined
    && requestedSeatPolicyOptionId
  ) {
    nextSeatSoftLimit = resolveSeatSoftLimitForOption(
      requestedSeatPolicyOptionId,
      nextSeatPack,
      current.seatSoftLimit
    );
  }
  if (nextSeatSoftLimit == null) {
    throw makeContractError("invalid_seat_soft_limit");
  }
  if (nextSeatSoftLimit > nextSeatPack) throw makeContractError("invalid_seat_soft_limit");

  const nextLicenseTier = String(requestedLicenseTier ?? current.licenseTier).trim() || current.licenseTier;
  const nextDiagnosticsOptIn = diagnosticsOptIn === undefined ? current.diagnosticsOptIn : diagnosticsOptIn === true;
  const nextHardSeatEnabled = hardSeatEnabled === undefined
    ? requestedHardSeatEnabled === undefined
      ? current.hardSeatEnabled === true
      : requestedHardSeatEnabled === true
    : hardSeatEnabled === true;
  const requestedSeatPolicyRaw = seatPolicyOptionId ?? requestedSeatPolicyOptionId ?? null;
  let nextSeatPolicyOptionId = normalizeSeatPolicyOptionId(
    requestedSeatPolicyRaw ?? current.seatPolicyOptionId
  ) || current.seatPolicyOptionId;
  if (requestedSeatPolicyRaw && isHardSeatOption(nextSeatPolicyOptionId) && nextHardSeatEnabled !== true) {
    throw makeContractError("hard_seat_disabled");
  }
  if (!nextHardSeatEnabled && isHardSeatOption(nextSeatPolicyOptionId)) {
    nextSeatPolicyOptionId = "soft_visibility";
  }

  const nextDirectoryAuthEnabled = directoryAuthEnabled === undefined
    ? requestedDirectoryAuthEnabled === undefined
      ? current.directoryAuthEnabled === true
      : requestedDirectoryAuthEnabled === true
    : directoryAuthEnabled === true;
  const nextDirectoryAuthMode = (() => {
    const raw = directoryAuthMode ?? requestedDirectoryAuthMode ?? current.directoryAuthMode;
    const normalized = String(raw || "local").trim().toLowerCase();
    return DIRECTORY_AUTH_MODE_BY_ID[normalized] ? normalized : null;
  })();
  if (!nextDirectoryAuthMode) {
    throw makeContractError("invalid_directory_auth_mode");
  }
  const nextDirectoryAuthLabel = String(directoryAuthLabel ?? requestedDirectoryAuthLabel ?? current.directoryAuthLabel ?? "").trim() || null;
  const nextDirectoryAuthIssuer = String(directoryAuthIssuer ?? requestedDirectoryAuthIssuer ?? current.directoryAuthIssuer ?? "").trim() || null;
  const nextDirectoryAuthTenant = String(directoryAuthTenant ?? requestedDirectoryAuthTenant ?? current.directoryAuthTenant ?? "").trim() || null;
  const nextModuleFlags = moduleFlags !== undefined
    ? normalizeModuleFlags(moduleFlags)
    : requestedBundleIds
      ? buildModuleFlagsFromBundleIds(requestedBundleIds)
      : current.moduleFlags;

  await query(
    `UPDATE platform_entitlements
     SET contract_id=$1,
         license_tier=$2,
         seat_pack=$3,
         seat_soft_limit=$4,
         seat_policy_option_id=$5,
         hard_seat_enabled=$6,
         directory_auth_enabled=$7,
         directory_auth_mode=$8,
         directory_auth_label=$9,
         directory_auth_issuer=$10,
         directory_auth_tenant=$11,
         diagnostics_opt_in=$12,
         module_flags=$13::jsonb,
         updated_by_user_id=$14,
         updated_at=NOW()
     WHERE id=1`,
    [
      PLATFORM_ENTITLEMENT_CONTRACT_ID,
      nextLicenseTier,
      nextSeatPack,
      nextSeatSoftLimit,
      nextSeatPolicyOptionId,
      nextHardSeatEnabled,
      nextDirectoryAuthEnabled,
      nextDirectoryAuthMode,
      nextDirectoryAuthLabel,
      nextDirectoryAuthIssuer,
      nextDirectoryAuthTenant,
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

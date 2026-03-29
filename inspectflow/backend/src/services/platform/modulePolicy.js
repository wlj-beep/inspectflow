export const MODULE_POLICY_CONTRACT_ID = "COMM-LICENSE-v1";

const MODULE_KEYS = Object.freeze([
  "CORE",
  "QUALITY_PRO",
  "INTEGRATION_SUITE",
  "ANALYTICS_SUITE",
  "MULTISITE",
  "EDGE"
]);

const PROFILE_CATALOG = Object.freeze({
  core_starter: {
    id: "core_starter",
    name: "Core Starter",
    description: "Core module only.",
    moduleFlags: {
      CORE: true,
      QUALITY_PRO: false,
      INTEGRATION_SUITE: false,
      ANALYTICS_SUITE: false,
      MULTISITE: false,
      EDGE: false
    }
  },
  quality_suite: {
    id: "quality_suite",
    name: "Quality Suite",
    description: "Core + Quality Pro.",
    moduleFlags: {
      CORE: true,
      QUALITY_PRO: true,
      INTEGRATION_SUITE: false,
      ANALYTICS_SUITE: false,
      MULTISITE: false,
      EDGE: false
    }
  },
  integration_suite: {
    id: "integration_suite",
    name: "Integration Suite",
    description: "Core + Integration Suite.",
    moduleFlags: {
      CORE: true,
      QUALITY_PRO: false,
      INTEGRATION_SUITE: true,
      ANALYTICS_SUITE: false,
      MULTISITE: false,
      EDGE: false
    }
  },
  edge_ops: {
    id: "edge_ops",
    name: "Edge Ops",
    description: "Core + Edge runtime.",
    moduleFlags: {
      CORE: true,
      QUALITY_PRO: false,
      INTEGRATION_SUITE: false,
      ANALYTICS_SUITE: false,
      MULTISITE: false,
      EDGE: true
    }
  },
  enterprise_all: {
    id: "enterprise_all",
    name: "Enterprise All",
    description: "All modules enabled.",
    moduleFlags: {
      CORE: true,
      QUALITY_PRO: true,
      INTEGRATION_SUITE: true,
      ANALYTICS_SUITE: true,
      MULTISITE: true,
      EDGE: true
    }
  }
});

function normalizeProfileId(profileId) {
  return String(profileId || "").trim().toLowerCase();
}

function normalizeModuleFlags(input) {
  const out = {};
  for (const key of MODULE_KEYS) {
    out[key] = input?.[key] === true;
  }
  return out;
}

function buildFinding(code, message, meta = {}) {
  return { code, message, ...meta };
}

export function getModulePolicyProfiles() {
  return {
    contractId: MODULE_POLICY_CONTRACT_ID,
    profiles: Object.values(PROFILE_CATALOG).map((profile) => ({
      id: profile.id,
      name: profile.name,
      description: profile.description,
      moduleFlags: normalizeModuleFlags(profile.moduleFlags)
    }))
  };
}

export function evaluateModulePolicy({ profile, moduleFlags } = {}) {
  const normalizedProfile = normalizeProfileId(profile);
  const catalogEntry = PROFILE_CATALOG[normalizedProfile];
  if (!catalogEntry) {
    const err = new Error("invalid_module_profile");
    err.status = 400;
    err.code = "invalid_module_profile";
    throw err;
  }

  const findings = [];
  const baseFlags = normalizeModuleFlags(catalogEntry.moduleFlags);
  const requestedFlags = moduleFlags ? normalizeModuleFlags(moduleFlags) : null;

  const merged = { ...baseFlags };
  if (requestedFlags) {
    for (const key of MODULE_KEYS) {
      if (moduleFlags[key] !== undefined) {
        merged[key] = requestedFlags[key];
      }
    }
  }

  if (merged.CORE !== true) {
    merged.CORE = true;
    findings.push(buildFinding("core_required", "CORE module is always enabled"));
  }

  if (merged.MULTISITE === true && merged.ANALYTICS_SUITE !== true) {
    merged.MULTISITE = false;
    findings.push(buildFinding("multisite_requires_analytics", "MULTISITE requires ANALYTICS_SUITE"));
  }

  return {
    contractId: MODULE_POLICY_CONTRACT_ID,
    profile: catalogEntry.id,
    moduleFlags: merged,
    findings
  };
}

export function getDefaultModulePolicyProfile() {
  return PROFILE_CATALOG.core_starter.id;
}

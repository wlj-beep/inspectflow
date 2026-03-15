import { getPlatformEntitlements, isModuleEnabled } from "../platform/entitlements.js";
import { getUserSiteAccess } from "../platform/siteAccess.js";

export const DEFAULT_ANALYTICS_SITE_ID = "default";

function normalizeSiteId(value) {
  const siteId = String(value || "").trim();
  if (!siteId) return DEFAULT_ANALYTICS_SITE_ID;
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(siteId)) {
    const err = new Error("invalid_site_id");
    err.status = 400;
    err.code = "invalid_site_id";
    throw err;
  }
  return siteId;
}

function parseAllowedSites(multisiteEnabled) {
  const fromEnv = String(process.env.ANALYTICS_ALLOWED_SITE_IDS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!fromEnv.length) {
    return new Set([DEFAULT_ANALYTICS_SITE_ID]);
  }
  const normalized = new Set();
  for (const siteId of fromEnv) {
    normalized.add(normalizeSiteId(siteId));
  }
  if (!multisiteEnabled) normalized.add(DEFAULT_ANALYTICS_SITE_ID);
  return normalized;
}

export async function resolveAnalyticsSiteScope({
  requestedSiteId = null,
  actorRole = null,
  actorUserId = null
} = {}) {
  const entitlements = await getPlatformEntitlements();
  const multisiteEnabled = String(process.env.ANALYTICS_MULTISITE_ENABLED || "").trim().toLowerCase() === "true"
    || isModuleEnabled(entitlements, "MULTISITE");
  const siteId = normalizeSiteId(requestedSiteId);
  const allowedSites = parseAllowedSites(multisiteEnabled);

  if (!multisiteEnabled && siteId !== DEFAULT_ANALYTICS_SITE_ID) {
    const err = new Error("multisite_not_enabled");
    err.status = 403;
    err.code = "multisite_not_enabled";
    throw err;
  }

  if (!allowedSites.has(siteId)) {
    const err = new Error("site_scope_forbidden");
    err.status = 403;
    err.code = "site_scope_forbidden";
    throw err;
  }

  let userAllowedSiteIds = [DEFAULT_ANALYTICS_SITE_ID];
  if (actorRole !== "Admin") {
    if (Number.isInteger(Number(actorUserId)) && Number(actorUserId) > 0) {
      const siteAccess = await getUserSiteAccess(actorUserId);
      userAllowedSiteIds = siteAccess.map((entry) => entry.siteId);
      if (!userAllowedSiteIds.length) userAllowedSiteIds = [DEFAULT_ANALYTICS_SITE_ID];
    }
    if (!userAllowedSiteIds.includes(siteId)) {
      const err = new Error("site_scope_forbidden");
      err.status = 403;
      err.code = "site_scope_forbidden";
      throw err;
    }
  }

  return {
    contractId: "ANA-MART-v3",
    siteId,
    multisiteEnabled,
    allowedSiteIds: Array.from(allowedSites).sort(),
    userAllowedSiteIds: actorRole === "Admin" ? Array.from(allowedSites).sort() : userAllowedSiteIds
  };
}

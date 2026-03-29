#!/usr/bin/env node

function env(name) {
  return String(process.env[name] || "").trim();
}

const issues = [];
const notes = [];

const ssoEnabled = env("AUTH_SSO_ENABLED").toLowerCase() === "true";
const oidcIssuer = env("AUTH_OIDC_ISSUER_URL");
const oidcClientId = env("AUTH_OIDC_CLIENT_ID");
const localLoginEnabled = env("AUTH_LOCAL_LOGIN_ENABLED");
const legacyRoleHeader = env("ALLOW_LEGACY_ROLE_HEADER");
const legacySsoSecret = env("SSO_PROXY_SECRET");
const legacySsoHeader = env("SSO_PROXY_SECRET_HEADER");
const modernSsoSecret = env("AUTH_SSO_PROXY_SECRET");

if (!ssoEnabled) {
  issues.push("AUTH_SSO_ENABLED is not true.");
}
if (!oidcIssuer) {
  issues.push("AUTH_OIDC_ISSUER_URL is missing.");
}
if (!oidcClientId) {
  issues.push("AUTH_OIDC_CLIENT_ID is missing.");
}
if (localLoginEnabled.toLowerCase() === "true") {
  issues.push("AUTH_LOCAL_LOGIN_ENABLED=true keeps local login active. Set false for OIDC-only production.");
}
if (legacyRoleHeader.toLowerCase() === "true") {
  issues.push("ALLOW_LEGACY_ROLE_HEADER=true enables deprecated trusted-header auth compatibility.");
}
if (legacySsoSecret || legacySsoHeader) {
  issues.push("Legacy SSO_* env keys are set. Migrate to AUTH_SSO_PROXY_SECRET and AUTH_SSO_PROXY_SECRET_HEADER.");
}
if (ssoEnabled && !modernSsoSecret) {
  issues.push("AUTH_SSO_PROXY_SECRET is missing while AUTH_SSO_ENABLED=true.");
}

if (issues.length === 0) {
  notes.push("OIDC migration audit passed.");
  console.log("[oidc-migration-audit] OK");
  process.exit(0);
}

console.error("[oidc-migration-audit] Migration gaps detected:");
for (const issue of issues) {
  console.error(`- ${issue}`);
}
process.exit(1);

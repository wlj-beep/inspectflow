import { query } from "../../db.js";
import { normalizeUserInput } from "./authContracts.js";

// Module-load guard: if SSO is enabled, AUTH_SSO_PROXY_SECRET (or legacy SSO_PROXY_SECRET)
// must be at least 16 characters. Fail at startup rather than silently misconfiguring proxy trust.
const SSO_ENABLED = String(process.env.AUTH_SSO_ENABLED || "").trim().toLowerCase() === "true";
if (SSO_ENABLED) {
  const _secret = String(process.env.AUTH_SSO_PROXY_SECRET || process.env.SSO_PROXY_SECRET || "").trim();
  if (_secret.length < 16) {
    throw new Error("AUTH_SSO_PROXY_SECRET must be at least 16 characters when SSO is enabled.");
  }
}

const VALID_ROLES = ["Operator", "Quality", "Supervisor", "Admin"];
const DEFAULT_ROLE = "Operator";

function envTrue(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function isTestRuntime() {
  return String(process.env.NODE_ENV || "").trim().toLowerCase() === "test";
}

function configuredPrincipalHeader() {
  return normalizeUserInput(process.env.AUTH_SSO_PRINCIPAL_HEADER || "x-forwarded-user").toLowerCase();
}

function configuredRoleHeader() {
  return normalizeUserInput(process.env.AUTH_SSO_ROLE_HEADER || "x-forwarded-role").toLowerCase();
}

function configuredProxySecret() {
  const allowLegacyEnv = envTrue(process.env.AUTH_ALLOW_LEGACY_SSO_ENV);
  if (allowLegacyEnv) {
    return normalizeUserInput(process.env.AUTH_SSO_PROXY_SECRET || process.env.SSO_PROXY_SECRET);
  }
  return normalizeUserInput(process.env.AUTH_SSO_PROXY_SECRET);
}

function configuredProxySecretHeader() {
  const allowLegacyEnv = envTrue(process.env.AUTH_ALLOW_LEGACY_SSO_ENV);
  return normalizeUserInput(
    process.env.AUTH_SSO_PROXY_SECRET_HEADER
    || (allowLegacyEnv ? process.env.SSO_PROXY_SECRET_HEADER : "")
    || "x-sso-proxy-secret"
  ).toLowerCase();
}

function isTrustedProxyRequest(req) {
  const sharedSecret = configuredProxySecret();
  if (!sharedSecret) return false;
  const secretHeader = configuredProxySecretHeader();
  const providedSecret = normalizeUserInput(req.header(secretHeader));
  return providedSecret !== "" && providedSecret === sharedSecret;
}

function normalizeRole(input) {
  const candidate = normalizeUserInput(input);
  return VALID_ROLES.includes(candidate) ? candidate : null;
}

function configuredDefaultRole() {
  return normalizeRole(process.env.AUTH_SSO_DEFAULT_ROLE) || DEFAULT_ROLE;
}

function resolveLocalLoginEnabled() {
  const configured = String(process.env.AUTH_LOCAL_LOGIN_ENABLED || "").trim().toLowerCase();
  if (configured) return configured === "true";
  return String(process.env.NODE_ENV || "").trim().toLowerCase() !== "production";
}

function hasLegacySsoEnvAliases() {
  return Boolean(String(process.env.SSO_PROXY_SECRET || "").trim() || String(process.env.SSO_PROXY_SECRET_HEADER || "").trim());
}

// This response is intentionally read-only and omits raw secrets. It exists so
// admin tooling can verify the explicit OIDC migration path and legacy-mode
// deprecation posture without parsing server logs or env files.
export function getOidcSsoConfig() {
  const oidcIssuerUrl = normalizeUserInput(process.env.AUTH_OIDC_ISSUER_URL);
  const oidcClientId = normalizeUserInput(process.env.AUTH_OIDC_CLIENT_ID);
  const allowLegacySsoEnv = envTrue(process.env.AUTH_ALLOW_LEGACY_SSO_ENV);
  const legacyRoleHeaderAllowed = isTestRuntime() && envTrue(process.env.ALLOW_LEGACY_ROLE_HEADER);
  const ssoEnabled = isSsoEnabled();

  return {
    contractId: "PLAT-AUTH-v1",
    mode: ssoEnabled ? "oidc_sso" : resolveLocalLoginEnabled() ? "local_auth" : "sso_required",
    enabled: ssoEnabled,
    localLoginEnabled: resolveLocalLoginEnabled(),
    oidc: {
      issuerConfigured: oidcIssuerUrl.length > 0,
      clientIdConfigured: oidcClientId.length > 0,
      issuerRequiredOutsideTest: ssoEnabled && !isTestRuntime(),
      clientIdRequiredOutsideTest: ssoEnabled && !isTestRuntime()
    },
    headers: {
      principal: configuredPrincipalHeader(),
      role: configuredRoleHeader(),
      proxySecretHeader: configuredProxySecretHeader()
    },
    migrationControls: {
      legacyTrustedHeaderModeAllowed: legacyRoleHeaderAllowed,
      legacySsoEnvAliasesAllowed: allowLegacySsoEnv,
      legacySsoEnvAliasesConfigured: hasLegacySsoEnvAliases(),
      migrationChecker: "npm run auth:oidc:migration:check"
    }
  };
}

export function isSsoEnabled() {
  return envTrue(process.env.AUTH_SSO_ENABLED);
}

export function isSsoAutoProvisionEnabled() {
  return envTrue(process.env.AUTH_SSO_AUTO_PROVISION);
}

export function extractSsoLoginRequest(req, body = {}) {
  const trustProxyHeaders = isTrustedProxyRequest(req);
  const headerPrincipal = trustProxyHeaders ? req.header(configuredPrincipalHeader()) : null;
  const headerRole = trustProxyHeaders ? req.header(configuredRoleHeader()) : null;
  const allowBodyPrincipal = envTrue(process.env.AUTH_SSO_ALLOW_BODY_PRINCIPAL)
    || String(process.env.NODE_ENV || "").trim().toLowerCase() === "test";
  const principal = normalizeUserInput(
    headerPrincipal || (allowBodyPrincipal ? (body.principal || body.username) : null)
  );
  const roleHint = normalizeRole(
    headerRole || (allowBodyPrincipal ? body.role : null)
  );
  return {
    principal: principal || null,
    roleHint
  };
}

export async function resolveSsoUser({ principal, roleHint = null } = {}) {
  const normalizedPrincipal = normalizeUserInput(principal);
  if (!normalizedPrincipal) return null;

  const existing = await query(
    "SELECT id, name, role, active FROM users WHERE name=$1 LIMIT 1",
    [normalizedPrincipal]
  );
  if (existing.rows[0]) return existing.rows[0];
  if (!isSsoAutoProvisionEnabled()) return null;

  const nextRole = roleHint || configuredDefaultRole();
  const created = await query(
    `INSERT INTO users (name, role, active)
     VALUES ($1, $2, true)
     RETURNING id, name, role, active`,
    [normalizedPrincipal, nextRole]
  );
  return created.rows[0] || null;
}

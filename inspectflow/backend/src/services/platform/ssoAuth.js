import { query } from "../../db.js";
import { normalizeUserInput } from "./authContracts.js";

const VALID_ROLES = ["Operator", "Quality", "Supervisor", "Admin"];
const DEFAULT_ROLE = "Operator";

function envTrue(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function configuredPrincipalHeader() {
  return normalizeUserInput(process.env.AUTH_SSO_PRINCIPAL_HEADER || "x-forwarded-user").toLowerCase();
}

function configuredRoleHeader() {
  return normalizeUserInput(process.env.AUTH_SSO_ROLE_HEADER || "x-forwarded-role").toLowerCase();
}

function normalizeRole(input) {
  const candidate = normalizeUserInput(input);
  return VALID_ROLES.includes(candidate) ? candidate : null;
}

function configuredDefaultRole() {
  return normalizeRole(process.env.AUTH_SSO_DEFAULT_ROLE) || DEFAULT_ROLE;
}

export function isSsoEnabled() {
  return envTrue(process.env.AUTH_SSO_ENABLED);
}

export function isSsoAutoProvisionEnabled() {
  return envTrue(process.env.AUTH_SSO_AUTO_PROVISION);
}

export function extractSsoLoginRequest(req, body = {}) {
  const principal = normalizeUserInput(
    req.header(configuredPrincipalHeader()) || body.principal || body.username
  );
  const roleHint = normalizeRole(
    req.header(configuredRoleHeader()) || body.role
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

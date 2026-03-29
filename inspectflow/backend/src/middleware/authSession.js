import { getAuthSessionByToken, readSessionTokenFromRequest } from "../auth.js";

const VALID_ROLES = ["Operator", "Quality", "Supervisor", "Admin"];

function allowLegacyRoleHeader() {
  if (String(process.env.NODE_ENV || "").trim().toLowerCase() !== "test") return false;
  return String(process.env.ALLOW_LEGACY_ROLE_HEADER || "").trim().toLowerCase() === "true";
}

function parseLegacyRole(req) {
  const role = String(req.header("x-user-role") || "").trim();
  if (!role) return null;
  if (!VALID_ROLES.includes(role)) {
    const err = new Error("invalid_role");
    err.status = 400;
    err.code = "invalid_role";
    throw err;
  }
  return role;
}

export function getActorRole(req) {
  if (req?.auth?.user?.role) return req.auth.user.role;
  if (!allowLegacyRoleHeader()) return null;
  return parseLegacyRole(req);
}

export function getActorUserId(req) {
  if (req?.auth?.user?.id) return Number(req.auth.user.id);
  if (!allowLegacyRoleHeader()) return null;
  const raw = String(req.header("x-user-id") || "").trim();
  if (!raw) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function attachAuthSession(req, res, next) {
  try {
    const token = readSessionTokenFromRequest(req);
    if (!token) {
      req.auth = null;
      return next();
    }
    const session = await getAuthSessionByToken(token);
    req.auth = session ? { sessionId: session.sessionId, expiresAt: session.expiresAt, user: session.user } : null;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuthenticated(req, res, next) {
  if (req.auth?.user?.id) return next();
  return res.status(401).json({ error: "unauthenticated" });
}

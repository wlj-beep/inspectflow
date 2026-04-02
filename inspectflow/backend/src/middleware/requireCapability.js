import { query } from "../db.js";
import { getActorRole } from "./authSession.js";

const VALID_ROLES = ["Operator", "Quality", "Supervisor", "Admin"];
const DEFAULT_ROLE_CAPABILITIES = Object.freeze({
  Operator: ["view_operator", "submit_records", "view_records"],
  Quality: ["view_admin", "view_jobs", "view_records", "edit_records"],
  Supervisor: ["view_admin", "view_jobs", "manage_jobs", "view_records", "edit_records"],
  Admin: ["view_admin", "view_jobs", "manage_jobs", "view_records", "edit_records", "manage_parts", "manage_tools", "manage_users", "manage_roles"]
});

function roleFromRequest(req) {
  const role = getActorRole(req);
  if (!role) {
    const err = new Error("unauthenticated");
    err.status = 401;
    err.code = "unauthenticated";
    throw err;
  }
  if (!VALID_ROLES.includes(role)) {
    const err = new Error("invalid_role");
    err.status = 400;
    err.code = "invalid_role";
    throw err;
  }
  return role;
}

export async function getRoleCaps(req) {
  if (req._roleCaps) return req._roleCaps;
  const role = roleFromRequest(req);
  let caps = DEFAULT_ROLE_CAPABILITIES[role] || [];
  try {
    const { rows } = await query(
      "SELECT capability FROM role_capabilities WHERE role=$1",
      [role]
    );
    if (rows.length > 0) {
      caps = rows.map((r) => r.capability);
    }
  } catch (error) {
    if (String(error?.code || "") !== "42P01") {
      throw error;
    }
  }
  req._roleCaps = caps;
  req._roleName = role;
  return caps;
}

export async function hasCapability(req, capability) {
  const caps = await getRoleCaps(req);
  return caps.includes(capability);
}

export function requireCapability(capability) {
  return async (req, res, next) => {
    try {
      const ok = await hasCapability(req, capability);
      if (!ok) return res.status(403).json({ error: "forbidden" });
      next();
    } catch (err) {
      if (err?.status) return res.status(err.status).json({ error: err.code });
      next(err);
    }
  };
}

export function requireAnyCapability(capabilities) {
  const list = Array.isArray(capabilities) ? capabilities : [capabilities];
  return async (req, res, next) => {
    try {
      const caps = await getRoleCaps(req);
      const ok = list.some((cap) => caps.includes(cap));
      if (!ok) return res.status(403).json({ error: "forbidden" });
      next();
    } catch (err) {
      if (err?.status) return res.status(err.status).json({ error: err.code });
      next(err);
    }
  };
}

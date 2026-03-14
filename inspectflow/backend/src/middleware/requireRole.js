import { getActorRole } from "./authSession.js";

const ROLE_ORDER = ["Operator", "Quality", "Supervisor", "Admin"];

function roleMeets(required, actual) {
  const reqIdx = ROLE_ORDER.indexOf(required);
  const actIdx = ROLE_ORDER.indexOf(actual);
  if (reqIdx === -1 || actIdx === -1) return false;
  return actIdx >= reqIdx;
}

export function requireRole(minRole) {
  return (req, res, next) => {
    const role = getActorRole(req);
    if (!role) return res.status(401).json({ error: "unauthenticated" });
    if (!roleMeets(minRole, role)) return res.status(403).json({ error: "forbidden" });
    next();
  };
}

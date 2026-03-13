const ROLE_ORDER = ["Operator", "Quality", "Supervisor", "Admin"];

function roleMeets(required, actual) {
  const reqIdx = ROLE_ORDER.indexOf(required);
  const actIdx = ROLE_ORDER.indexOf(actual);
  if (reqIdx === -1 || actIdx === -1) return false;
  return actIdx >= reqIdx;
}

export function requireRole(minRole) {
  return (req, res, next) => {
    const role = req.header("x-user-role");
    if (!role) return res.status(400).json({ error: "missing_role" });
    if (!roleMeets(minRole, role)) return res.status(403).json({ error: "forbidden" });
    next();
  };
}

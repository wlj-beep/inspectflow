const ROLE_THEME_MAP = Object.freeze({
  operator: {
    className: "role-theme-operator",
    label: "Operator mode"
  },
  quality: {
    className: "role-theme-quality",
    label: "Quality review mode"
  },
  supervisor: {
    className: "role-theme-supervisor",
    label: "Supervisor mode"
  },
  admin: {
    className: "role-theme-admin",
    label: "Admin mode"
  },
  neutral: {
    className: "role-theme-neutral",
    label: "Neutral mode"
  }
});

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

export function getRoleThemeClass(role) {
  const normalized = normalizeRole(role);
  return ROLE_THEME_MAP[normalized]?.className || ROLE_THEME_MAP.neutral.className;
}

export function getRoleAccentLabel(role) {
  const normalized = normalizeRole(role);
  return ROLE_THEME_MAP[normalized]?.label || ROLE_THEME_MAP.neutral.label;
}

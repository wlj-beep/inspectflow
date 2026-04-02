const ROLE_THEME_MAP = Object.freeze({
  operator: {
    className: "role-theme-operator",
    label: "Operator workflow"
  },
  quality: {
    className: "role-theme-quality",
    label: "Quality command"
  },
  supervisor: {
    className: "role-theme-supervisor",
    label: "Shift oversight"
  },
  admin: {
    className: "role-theme-admin",
    label: "Admin workspace"
  },
  neutral: {
    className: "role-theme-neutral",
    label: "Shared workspace"
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

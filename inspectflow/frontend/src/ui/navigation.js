const TOP_LEVEL_VIEWS = Object.freeze(["home", "operator", "records", "admin"]);
const ADMIN_TABS = Object.freeze([
  "jobs",
  "records",
  "issues",
  "imports",
  "parts",
  "tools",
  "users",
  "roles"
]);

export const ADMIN_TAB_GROUPS = Object.freeze([
  Object.freeze({
    label: "Parts & Setup",
    tabs: Object.freeze(["jobs", "parts"])
  }),
  Object.freeze({
    label: "Tools & Calibration",
    tabs: Object.freeze(["tools"])
  }),
  Object.freeze({
    label: "Imports",
    tabs: Object.freeze(["imports"])
  }),
  Object.freeze({
    label: "Users",
    tabs: Object.freeze(["users"])
  }),
  Object.freeze({
    label: "System",
    tabs: Object.freeze(["records", "issues", "roles"])
  })
]);

const VIEW_LABELS = Object.freeze({
  home: "Home",
  operator: "Operator Entry",
  records: "Records",
  admin: "Admin"
});

const ADMIN_TAB_TO_GROUP = new Map(
  ADMIN_TAB_GROUPS.flatMap((group) => group.tabs.map((tab) => [tab, group.label]))
);

function readSearchParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

function normalizeView(rawView) {
  const value = String(rawView || "").trim().toLowerCase();
  return TOP_LEVEL_VIEWS.includes(value) ? value : "home";
}

function normalizeAdminTab(rawTab) {
  const value = String(rawTab || "").trim().toLowerCase();
  return ADMIN_TABS.includes(value) ? value : "jobs";
}

export function readUiRouteState() {
  const params = readSearchParams();
  const view = normalizeView(params.get("view"));
  const adminTab = view === "admin" ? normalizeAdminTab(params.get("adminTab")) : undefined;

  return view === "admin"
    ? { view, adminTab }
    : { view };
}

export function writeUiRouteState(next) {
  if (typeof window === "undefined" || typeof window.history === "undefined") return;

  const current = new URLSearchParams(window.location.search);
  const view = normalizeView(next?.view);
  current.set("view", view);

  if (view === "admin") {
    current.set("adminTab", normalizeAdminTab(next?.adminTab));
  } else {
    current.delete("adminTab");
  }

  const nextQuery = current.toString();
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash || ""}`;
  window.history.replaceState({}, "", nextUrl);
}

export function buildBreadcrumbs({ view, adminTab }) {
  const normalizedView = normalizeView(view);
  if (normalizedView !== "admin") {
    return [VIEW_LABELS[normalizedView]];
  }

  const normalizedTab = normalizeAdminTab(adminTab);
  const sectionLabel = ADMIN_TAB_TO_GROUP.get(normalizedTab) || "Parts & Setup";
  return [VIEW_LABELS.admin, sectionLabel];
}

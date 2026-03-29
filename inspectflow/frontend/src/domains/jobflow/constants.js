export const CAPABILITY_DEFS = [
  { key: "view_operator", label: "Operator View", desc: "Access measurement entry" },
  { key: "submit_records", label: "Submit Records", desc: "Submit inspection results" },
  { key: "view_admin", label: "Admin Area", desc: "Access admin screens" },
  { key: "view_jobs", label: "View Jobs", desc: "View job management list" },
  { key: "manage_jobs", label: "Manage Jobs", desc: "Create or modify jobs" },
  { key: "view_records", label: "View Records", desc: "View inspection records" },
  { key: "edit_records", label: "Edit Records", desc: "Supervisor edits with audit log" },
  { key: "manage_parts", label: "Manage Parts", desc: "Edit parts/operations/dimensions" },
  { key: "manage_tools", label: "Manage Tools", desc: "Add/edit tool library" },
  { key: "manage_users", label: "Manage Users", desc: "Add/edit users" },
  { key: "manage_roles", label: "Manage Roles", desc: "Edit role permissions" }
];

export const DEFAULT_ROLE_CAPS = {
  Operator: ["view_operator", "submit_records", "view_records"],
  Quality: ["view_admin", "view_jobs", "view_records", "edit_records"],
  Supervisor: ["view_admin", "view_jobs", "manage_jobs", "view_records", "edit_records"],
  Admin: [
    "view_admin",
    "view_jobs",
    "manage_jobs",
    "view_records",
    "edit_records",
    "manage_parts",
    "manage_tools",
    "manage_users",
    "manage_roles"
  ]
};

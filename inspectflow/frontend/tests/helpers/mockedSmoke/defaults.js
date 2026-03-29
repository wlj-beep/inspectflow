export const ADMIN_CAPS = [
  "view_admin",
  "view_jobs",
  "manage_jobs",
  "view_records",
  "edit_records",
  "manage_parts",
  "manage_tools",
  "manage_users",
  "manage_roles"
];

export const TEST_IDS = {
  adminUserId: 1001,
  operatorUserId: 1002
};

export const DEFAULT_AUTH_USERS = [
  { id: TEST_IDS.adminUserId, name: "Admin User", role: "Admin", active: true }
];
export const DEFAULT_LOGIN_USER = {
  id: TEST_IDS.adminUserId,
  name: "Admin User",
  role: "Admin"
};
export const DEFAULT_ROLES = [
  { role: "Operator", capabilities: ["view_operator", "submit_records", "view_records"] },
  { role: "Admin", capabilities: ADMIN_CAPS }
];
export const DEFAULT_PARTS_LIST = [{ id: "1234", description: "Hydraulic Cylinder Body" }];

export const DEFAULT_PART_DETAIL = {
  id: "1234",
  description: "Hydraulic Cylinder Body",
  currentRevision: "A",
  selectedRevision: "A",
  nextRevision: "B",
  revisions: [
    {
      revision: "A",
      revisionIndex: 1,
      partName: "Hydraulic Cylinder Body",
      changeSummary: "Initial setup baseline",
      changedFields: [],
      createdByRole: "Admin",
      createdAt: "2026-03-13T00:00:00.000Z"
    }
  ],
  operations: [
    { id: 10, opNumber: "10", label: "Rough Turn", dimensions: [] },
    { id: 20, opNumber: "20", label: "Bore & Finish", dimensions: [] },
    { id: 30, opNumber: "30", label: "Thread & Final", dimensions: [] }
  ]
};

export const DEFAULT_TOOLS_LIST = [
  { name: "Outside Micrometer", type: "Variable", itNum: "IT-0042" },
  { name: "Vernier Caliper", type: "Variable", itNum: "IT-0018" },
  { name: "Bore Gauge", type: "Variable", itNum: "IT-0031" },
  { name: "Inside Micrometer", type: "Variable", itNum: "IT-0029" },
  { name: "Depth Micrometer", type: "Variable", itNum: "IT-0055" },
  { name: "Height Gauge", type: "Variable", itNum: "IT-0011" },
  { name: "Profilometer", type: "Variable", itNum: "IT-0063" },
  { name: "CMM", type: "Variable", itNum: "IT-0001" },
  { name: "Plug Gauge", type: "Go/No-Go", itNum: "IT-0074" },
  { name: "Thread Gauge", type: "Go/No-Go", itNum: "IT-0082" },
  { name: "Ring Gauge", type: "Go/No-Go", itNum: "IT-0091" },
  { name: "Snap Gauge", type: "Go/No-Go", itNum: "IT-0090" },
  { name: "Surface Comparator", type: "Attribute", itNum: "IT-0044" },
  { name: "Optical Comparator", type: "Attribute", itNum: "IT-0038" }
].map((tool, index) => ({
  id: `tool-${index + 1}`,
  active: true,
  visible: true,
  ...tool
}));

export const DEFAULT_INSTRUCTION_VERSION = {
  id: "inst-20-v1",
  operation_id: "20",
  version_label: "A",
  title: "Probe setup",
  summary: "Acknowledge before measuring.",
  body: "Wear eye protection and zero the gauge before use.",
  status: "published",
  active: true,
  requires_acknowledgment: true,
  media_links: [{ label: "Setup PDF", url: "https://example.com/setup.pdf" }],
  media_urls: ["https://example.com/setup.pdf"],
  created_at: "2026-03-20T12:00:00.000Z"
};

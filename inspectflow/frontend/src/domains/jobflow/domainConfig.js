export const TOOL_TYPES = ["Variable", "Go/No-Go", "Attribute"];

export const SAMPLING_OPTIONS = [
  { value: "first_last", label: "First & Last" },
  { value: "first_middle_last", label: "First, Middle, Last" },
  { value: "every_5", label: "Every 5th" },
  { value: "every_10", label: "Every 10th" },
  { value: "100pct", label: "100%" },
  { value: "custom_interval", label: "Custom Every Nth" }
];

export const COMMON_TOOL_TEMPLATES = [
  { name: "Outside Micrometer", type: "Variable" },
  { name: "Inside Micrometer", type: "Variable" },
  { name: "Vernier Caliper", type: "Variable" },
  { name: "Depth Micrometer", type: "Variable" },
  { name: "Height Gauge", type: "Variable" },
  { name: "Plug Gauge", type: "Go/No-Go" },
  { name: "Thread Gauge", type: "Go/No-Go" },
  { name: "Ring Gauge", type: "Go/No-Go" },
  { name: "Snap Gauge", type: "Go/No-Go" },
  { name: "Surface Comparator", type: "Attribute" },
  { name: "Optical Comparator", type: "Attribute" }
];

export const ISSUE_CATEGORIES = [
  { value: "part_issue", label: "Part issue" },
  { value: "tolerance_issue", label: "Tolerance issue" },
  { value: "dimension_issue", label: "Dimension issue" },
  { value: "operation_mapping_issue", label: "Wrong operation-stage mapping" },
  { value: "app_functionality_issue", label: "App/functionality issue" },
  { value: "tool_issue", label: "Tool issue" },
  { value: "sampling_issue", label: "Sampling-plan issue" },
  { value: "other", label: "Other" }
];

export const MISSING_REASONS = ["Scrapped", "Lost", "Damaged", "Unable to Measure", "Other"];

export const ANALYTICS_RULE_OPTIONS = [
  "beyond_spec_limits",
  "point_beyond_3sigma",
  "run_of_8_one_side",
  "trend_of_6"
];

export const EMPTY_PARTS = {};
export const EMPTY_JOBS = {};
export const EMPTY_RECORDS = [];
export const EMPTY_TOOL_LIBRARY = {};

export function buildFallbackUsers(authUser = null) {
  if (authUser?.id) {
    return [
      {
        id: authUser.id,
        name: authUser.name || "Authenticated User",
        role: authUser.role || "Operator",
        active: true
      }
    ];
  }
  return [];
}

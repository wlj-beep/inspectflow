import { test, expect } from "@playwright/test";

const ADMIN_CAPS = [
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

const PART_DETAIL = {
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
    { id: 10, opNumber: "10", label: "Rough Turn", dimensions: [] }
  ]
};

const RECORDS = [
  {
    id: 201,
    jobNumber: "J-5001",
    partNumber: "1234",
    operation: "10",
    lot: "Lot-A",
    qty: 1,
    timestamp: "2026-03-30T10:00:00.000Z",
    status: "complete",
    oot: false,
    comment: "Selected record one",
    values: { "10_1": "0.6250" },
    tools: {
      "10": [{ toolId: "tool-1", toolName: "Caliper", itNum: "IT-001" }]
    },
    auditLog: [],
    missingPieces: {}
  },
  {
    id: 202,
    jobNumber: "J-5002",
    partNumber: "1234",
    operation: "10",
    lot: "Lot-B",
    qty: 1,
    timestamp: "2026-03-30T10:05:00.000Z",
    status: "complete",
    oot: false,
    comment: "Unselected record",
    values: { "10_1": "0.6260" },
    tools: {
      "10": [{ toolId: "tool-1", toolName: "Caliper", itNum: "IT-001" }]
    },
    auditLog: [],
    missingPieces: {}
  }
];

const RECORD_DETAILS = {
  201: {
    id: 201,
    job_id: "J-5001",
    part_id: "1234",
    operation_id: 10,
    lot: "Lot-A",
    qty: 1,
    timestamp: "2026-03-30T10:00:00.000Z",
    status: "complete",
    oot: false,
    comment: "Selected record one",
    operator_user_id: 1,
    values: [
      {
        dimension_id: 10,
        piece_number: 1,
        value: "0.6250"
      }
    ],
    tools: [
      {
        dimension_id: 10,
        tool_id: "tool-1",
        tool_name: "Caliper",
        tool_type: "Variable",
        it_num: "IT-001"
      }
    ],
    missingPieces: [],
    auditLog: []
  },
  202: {
    id: 202,
    job_id: "J-5002",
    part_id: "1234",
    operation_id: 10,
    lot: "Lot-B",
    qty: 1,
    timestamp: "2026-03-30T10:05:00.000Z",
    status: "complete",
    oot: false,
    comment: "Unselected record",
    operator_user_id: 1,
    values: [
      {
        dimension_id: 10,
        piece_number: 1,
        value: "0.6260"
      }
    ],
    tools: [
      {
        dimension_id: 10,
        tool_id: "tool-1",
        tool_name: "Caliper",
        tool_type: "Variable",
        it_num: "IT-001"
      }
    ],
    missingPieces: [],
    auditLog: []
  }
};

async function mockApi(page) {
  await page.addInitScript(() => {
    window.__capturedExportCsv = null;
    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      if (blob?.text) {
        blob.text().then((text) => {
          window.__capturedExportCsv = text;
        }).catch(() => {});
      }
      return originalCreateObjectURL(blob);
    };
  });

  await page.route("http://localhost:4000/api/**", async (route) => {
    const req = route.request();
    const { pathname } = new URL(req.url());

    if (req.method() === "GET" && pathname === "/api/auth/session") {
      return route.fulfill({ status: 401, json: { valid: false } });
    }
    if (req.method() === "GET" && pathname === "/api/auth/users") {
      return route.fulfill({ status: 200, json: [{ id: 1, name: "Admin User", role: "Admin", active: true }] });
    }
    if (req.method() === "POST" && pathname === "/api/auth/login") {
      return route.fulfill({
        status: 200,
        json: { ok: true, user: { id: 1, name: "Admin User", role: "Admin" }, expiresAt: "2026-03-15T00:00:00.000Z" }
      });
    }
    if (req.method() === "GET" && pathname === "/api/users") {
      return route.fulfill({ status: 200, json: [{ id: 1, name: "Admin User", role: "Admin", active: true }] });
    }
    if (req.method() === "GET" && pathname === "/api/jobs") {
      return route.fulfill({ status: 200, json: [] });
    }
    if (req.method() === "GET" && pathname === "/api/tools") {
      return route.fulfill({ status: 200, json: [] });
    }
    if (req.method() === "GET" && pathname === "/api/tool-locations") {
      return route.fulfill({ status: 200, json: [] });
    }
    if (req.method() === "GET" && pathname === "/api/parts") {
      return route.fulfill({ status: 200, json: [{ id: "1234", description: "Hydraulic Cylinder Body" }] });
    }
    if (req.method() === "GET" && pathname === "/api/parts/1234") {
      return route.fulfill({ status: 200, json: PART_DETAIL });
    }
    if (req.method() === "GET" && pathname === "/api/records") {
      return route.fulfill({ status: 200, json: RECORDS });
    }
    if (req.method() === "GET" && pathname === "/api/records/201") {
      return route.fulfill({ status: 200, json: RECORD_DETAILS[201] });
    }
    if (req.method() === "GET" && pathname === "/api/records/202") {
      return route.fulfill({ status: 200, json: RECORD_DETAILS[202] });
    }
    if (req.method() === "GET" && pathname.startsWith("/api/records/")) {
      const recordId = pathname.split("/").pop();
      const record = RECORDS.find((item) => String(item.id) === String(recordId));
      return route.fulfill({ status: record ? 200 : 404, json: record || { error: "not_found" } });
    }
    if (req.method() === "GET" && pathname === "/api/roles") {
      return route.fulfill({
        status: 200,
        json: [
          { role: "Operator", capabilities: ["view_operator", "submit_records", "view_records"] },
          { role: "Admin", capabilities: ADMIN_CAPS }
        ]
      });
    }
    if (req.method() === "POST" && pathname === "/api/sessions/start") {
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    if (req.method() === "POST" && pathname === "/api/sessions/end") {
      return route.fulfill({ status: 200, json: { ok: true } });
    }

    return route.fulfill({ status: 404, json: { error: `Unhandled ${req.method()} ${pathname}` } });
  });

  await page.route("http://127.0.0.1:4000/api/**", async (route) => {
    const req = route.request();
    const { pathname } = new URL(req.url());
    return route.fulfill({ status: 404, json: { error: `Unhandled ${req.method()} ${pathname}` } });
  });
}

async function loginAsAdmin(page) {
  await expect(page.getByText("InspectFlow Login")).toBeVisible();
  await page.locator("select").first().selectOption("1");
  await page.getByLabel("Password").fill("inspectflow");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByText("Manufacturing Inspection System")).toBeVisible();
  await expect(page.getByText("Admin User")).toBeVisible();
}

test.describe("Authenticated header and export mode", () => {
  test("shows the signed-in name only after login", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await loginAsAdmin(page);

    await expect(page.locator(".user-ctrl-identity")).toHaveText("Admin User");
    await expect(page.locator(".user-ctrl-label")).toHaveCount(0);
    await expect(page.locator(".user-ctrl select")).toHaveCount(0);
  });

  test("exports only selected records in export mode", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Admin", exact: true }).click();
    await page.getByRole("button", { name: "Records", exact: true }).click();
    await page.getByRole("button", { name: "Select for Export" }).click();

    await expect(page.getByText("Use the checkboxes to choose records for export.")).toBeVisible();
    await page.locator("tbody tr").nth(1).getByRole("checkbox").check();
    await expect(page.getByRole("button", { name: "Export Selected CSV" })).toBeEnabled();

    await page.getByRole("button", { name: "Export Selected CSV" }).click();
    await expect.poll(async () => page.evaluate(() => window.__capturedExportCsv || "")).toContain("Selected record one");
    const csv = await page.evaluate(() => window.__capturedExportCsv || "");
    expect(csv).toContain("Selected record one");
    expect(csv).not.toContain("Unselected record");
  });
});

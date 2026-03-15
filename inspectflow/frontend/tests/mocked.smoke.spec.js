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

const DEFAULT_PART_DETAIL = {
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

async function mockApi(
  page,
  {
    createPartMode = "success",
    createPartDelayMs = 0,
    jobs = [],
    records = [],
    enableImports = false,
    seatUsage = {
      contractId: "COMM-SEAT-v1",
      entitlementContractId: "PLAT-ENT-v1",
      licenseTier: "core",
      seatPack: 25,
      seatSoftLimit: 25,
      activeSessions: 1,
      activeUsers: 1,
      softLimitWarning: false,
      softLimitExceeded: false
    }
  } = {}
) {
  const routeHandler = async (route) => {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());
    const path = url.pathname;

    if (method === "GET" && path === "/api/auth/session") {
      return route.fulfill({ status: 401, json: { valid: false } });
    }
    if (method === "GET" && path === "/api/auth/users") {
      return route.fulfill({ status: 200, json: [{ id: 1, name: "Admin User", role: "Admin", active: true }] });
    }
    if (method === "POST" && path === "/api/auth/login") {
      return route.fulfill({
        status: 200,
        json: {
          ok: true,
          user: { id: 1, name: "Admin User", role: "Admin" },
          expiresAt: "2026-03-15T00:00:00.000Z",
          seatUsage
        }
      });
    }
    if (method === "POST" && path === "/api/auth/logout") {
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    if (method === "GET" && path === "/api/users") {
      return route.fulfill({ status: 200, json: [{ id: 1, name: "Admin User", role: "Admin", active: true }] });
    }
    if (method === "GET" && path === "/api/tools") {
      return route.fulfill({ status: 200, json: [] });
    }
    if (method === "GET" && path === "/api/tool-locations") {
      return route.fulfill({ status: 200, json: [] });
    }
    if (method === "GET" && path === "/api/parts") {
      return route.fulfill({ status: 200, json: [{ id: "1234", description: "Hydraulic Cylinder Body" }] });
    }
    if (method === "GET" && path === "/api/parts/1234") {
      return route.fulfill({
        status: 200,
        json: DEFAULT_PART_DETAIL
      });
    }
    if (method === "GET" && path === "/api/jobs") {
      return route.fulfill({ status: 200, json: jobs });
    }
    if (method === "GET" && path === "/api/records") {
      return route.fulfill({ status: 200, json: records });
    }
    if (method === "GET" && path === "/api/roles") {
      return route.fulfill({
        status: 200,
        json: [
          { role: "Operator", capabilities: ["view_operator", "submit_records", "view_records"] },
          { role: "Admin", capabilities: ADMIN_CAPS }
        ]
      });
    }
    if (method === "POST" && path === "/api/sessions/start") {
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    if (method === "POST" && path === "/api/sessions/end") {
      return route.fulfill({ status: 200, json: { ok: true } });
    }

    if (method === "POST" && path === "/api/parts") {
      if (createPartDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, createPartDelayMs));
      }
      if (createPartMode === "error") {
        return route.fulfill({ status: 500, json: { error: "create_part_failed" } });
      }
      const payload = req.postDataJSON() ?? {};
      return route.fulfill({
        status: 201,
        json: {
          id: payload.id,
          description: payload.description,
          operations: []
        }
      });
    }

    if (enableImports && method === "GET" && path === "/api/imports/templates") {
      return route.fulfill({
        status: 200,
        json: {
          tools: { headers: ["name", "type", "it_num", "size", "active", "visible"] },
          partDimensions: {
            headers: [
              "part_id",
              "part_name",
              "op_number",
              "op_label",
              "dimension_name",
              "nominal",
              "tol_plus",
              "tol_minus",
              "unit",
              "sampling",
              "sampling_interval",
              "input_mode",
              "tool_it_nums"
            ]
          }
        }
      });
    }
    if (enableImports && method === "POST" && path === "/api/imports/tools/csv") {
      return route.fulfill({ status: 200, json: { ok: true, total: 1, inserted: 1, updated: 0 } });
    }
    if (enableImports && method === "POST" && path === "/api/imports/part-dimensions/csv") {
      return route.fulfill({ status: 200, json: { ok: true, totalRows: 1, partsUpserted: 1, operationsUpserted: 1, dimensionsUpserted: 1 } });
    }
    if (enableImports && method === "GET" && path === "/api/imports/integrations") {
      return route.fulfill({ status: 200, json: [] });
    }
    if (enableImports && method === "GET" && path === "/api/imports/unresolved") {
      return route.fulfill({ status: 200, json: [] });
    }
    if (enableImports && method === "POST" && path === "/api/imports/integrations") {
      return route.fulfill({ status: 201, json: { id: 1, name: "Mock Integration", source_type: "api_pull", import_type: "jobs" } });
    }
    if (enableImports && method === "POST" && path === "/api/imports/measurements/bulk") {
      return route.fulfill({ status: 200, json: { ok: true, totalRows: 1, inserted: 1, updated: 0, failed: 0 } });
    }

    return route.fulfill({ status: 404, json: { error: `Unhandled ${method} ${path}` } });
  };

  await page.route("http://localhost:4000/api/**", routeHandler);
  await page.route("http://127.0.0.1:4000/api/**", routeHandler);
}

async function loginAsAdmin(page) {
  await page.getByLabel("User").selectOption("1");
  await page.getByLabel("Password").fill("inspectflow");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByText("Manufacturing Inspection System")).toBeVisible();
}

test.describe("Mocked UI smoke @mock", () => {
  test("loads the InspectFlow shell", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await loginAsAdmin(page);
    await expect(page.getByText("InspectFlow", { exact: false })).toBeVisible();
    await expect(page.getByTestId("authenticated-user")).toContainText("Admin User");
    await expect(page.getByTestId("authenticated-user")).not.toContainText("Select user");
  });

  test("shows COMM-SEAT soft warning chip in authenticated shell when seat usage is high", async ({ page }) => {
    await mockApi(page, {
      seatUsage: {
        contractId: "COMM-SEAT-v1",
        entitlementContractId: "PLAT-ENT-v1",
        licenseTier: "core_plus",
        seatPack: 30,
        seatSoftLimit: 25,
        activeSessions: 28,
        activeUsers: 26,
        softLimitWarning: true,
        softLimitExceeded: true
      }
    });
    await page.goto("/");
    await loginAsAdmin(page);
    await expect(page.getByTestId("seat-usage-chip")).toContainText("Seats Exceeded 26/25");
  });

  test("shows loading and success transitions during part creation", async ({ page }) => {
    await mockApi(page, { createPartMode: "success", createPartDelayMs: 500 });
    await page.goto("/");
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Admin" }).click();
    await page.getByRole("button", { name: "Part / Op Setup" }).click();

    const addPartCard = page.locator(".card").filter({ hasText: "Add New Part" });
    await addPartCard.getByPlaceholder("e.g. 5678").fill("5678");
    await addPartCard.getByPlaceholder("Part name").fill("Transition Widget");
    await addPartCard.getByRole("button", { name: /add part/i }).click();

    const banner = page.getByTestId("transition-banner");
    await expect(banner).toContainText("Create part…");
    await expect(banner).toContainText("Create part complete.");
    await expect(page.getByText("Part 5678")).toBeVisible();
  });

  test("shows failure transition when part creation fails", async ({ page }) => {
    await mockApi(page, { createPartMode: "error" });
    await page.goto("/");
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Admin" }).click();
    await page.getByRole("button", { name: "Part / Op Setup" }).click();

    const addPartCard = page.locator(".card").filter({ hasText: "Add New Part" });
    await addPartCard.getByPlaceholder("e.g. 5678").fill("5678");
    await addPartCard.getByPlaceholder("Part name").fill("Will Fail");
    await addPartCard.getByRole("button", { name: /add part/i }).click();

    const banner = page.getByTestId("transition-banner");
    await expect(banner).toContainText("Create part failed. create_part_failed");
    await expect(page.getByText("create_part_failed", { exact: true })).toBeVisible();
  });

  test("reuses original base prefix and increments family run index for duplicate lot jobs", async ({ page }) => {
    await mockApi(page, {
      jobs: [
        {
          id: "1234561001",
          part_id: "1234",
          operation_id: 10,
          lot: "Lot B",
          qty: 12,
          status: "closed"
        },
        {
          id: "1234562001",
          part_id: "1234",
          operation_id: 20,
          lot: "Lot B",
          qty: 12,
          status: "closed"
        }
      ]
    });
    await page.goto("/");
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Admin" }).click();
    await page.getByRole("button", { name: "Job Management" }).click();
    const builderCard = page.locator(".card").filter({ hasText: "Job Builder (Part + Lot)" });
    await builderCard.locator("select").first().selectOption("1234");
    await builderCard.getByPlaceholder("e.g. Lot B").fill("Lot B");
    await builderCard.getByPlaceholder("12").fill("12");

    await expect(page.getByText("Reusing base job prefix")).toContainText("123456");
    await expect(page.getByText("12345601002")).toBeVisible();
    await expect(page.getByText("12345602002")).toBeVisible();
    await expect(page.getByText("12345603002")).toBeVisible();
  });

  test("allows admins to import tools via CSV from the Data Imports tab", async ({ page }) => {
    await mockApi(page, { enableImports: true });
    await page.goto("/");
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Admin" }).click();
    await page.getByRole("button", { name: "Data Imports" }).click();

    const toolsTextarea = page.getByPlaceholder("Paste tools CSV here…");
    const toolsSection = toolsTextarea.locator("xpath=ancestor::div[contains(@class,'card-body')][1]");
    await toolsSection.getByRole("button", { name: "Load Sample" }).click();
    await toolsSection.getByRole("button", { name: "Run Tool Import" }).click();

    await expect(page.getByText('"ok": true')).toBeVisible();
    await expect(page.getByText('"inserted": 1')).toBeVisible();
  });

  test("supports optional selected-record export mode with checkbox-only selection", async ({ page }) => {
    await mockApi(page, {
      records: [
        {
          id: 901,
          job_id: "J-REC-001",
          part_id: "1234",
          operation_id: 20,
          lot: "Lot X",
          qty: 2,
          timestamp: "2026-03-15T12:00:00.000Z",
          operator_user_id: 1,
          status: "complete",
          oot: false,
          comment: "first"
        },
        {
          id: 902,
          job_id: "J-REC-002",
          part_id: "1234",
          operation_id: 20,
          lot: "Lot Y",
          qty: 2,
          timestamp: "2026-03-15T12:05:00.000Z",
          operator_user_id: 1,
          status: "complete",
          oot: false,
          comment: "second"
        }
      ]
    });
    await page.goto("/");
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Records", exact: true }).click();

    await expect(page.getByRole("button", { name: "Select Records for Export" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Select J-REC-001 for export/i })).toHaveCount(0);

    await page.getByRole("button", { name: "Select Records for Export" }).click();
    const exportSelectedBtn = page.getByRole("button", { name: "Export Selected Records CSV" });
    await expect(exportSelectedBtn).toBeDisabled();

    await page.getByRole("checkbox", { name: /Select J-REC-001 for export/i }).check();
    await expect(exportSelectedBtn).toBeEnabled();

    await page.getByRole("button", { name: "Cancel Selection" }).click();
    await expect(page.getByRole("button", { name: "Export Filtered CSV" })).toBeEnabled();
    await expect(page.getByRole("checkbox", { name: /Select J-REC-001 for export/i })).toHaveCount(0);
  });
});

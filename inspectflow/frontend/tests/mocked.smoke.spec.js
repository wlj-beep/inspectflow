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

async function mockApi(page, {
  createPartMode = "success",
  createPartDelayMs = 0,
  jobs = [],
  records = [],
  enableImports = false,
  loginUser = { id: 1, name: "Admin User", role: "Admin", active: true }
} = {}) {
  const localUsers = [
    { id: 1, name: "Admin User", role: "Admin", active: true },
    { id: 2, name: "Operator User", role: "Operator", active: true }
  ];
  let sessionAuthenticated = false;
  const routeHandler = async (route) => {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());
    const path = url.pathname;
    if (!path.startsWith("/api/")) {
      return route.continue();
    }
    const requestOrigin = (await req.headerValue("origin")) || "http://127.0.0.1:5173";
    const corsHeaders = {
      "access-control-allow-origin": requestOrigin,
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "content-type,x-user-role",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS"
    };

    if (method === "OPTIONS" && path.startsWith("/api/")) {
      return route.fulfill({ status: 204, headers: corsHeaders });
    }

    if (method === "GET" && path === "/api/auth/session") {
      if (!sessionAuthenticated) {
        return route.fulfill({ status: 401, json: { valid: false }, headers: corsHeaders });
      }
      return route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: { valid: true, user: { id: loginUser.id, name: loginUser.name, role: loginUser.role } }
      });
    }
    if (method === "GET" && path === "/api/auth/users") {
      return route.fulfill({ status: 200, json: localUsers, headers: corsHeaders });
    }
    if (method === "GET" && path === "/api/auth/profile") {
      return route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: { mode: "local", summary: "Local accounts enabled." }
      });
    }
    if (method === "POST" && path === "/api/auth/login") {
      sessionAuthenticated = true;
      return route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: {
          ok: true,
          user: { id: loginUser.id, name: loginUser.name, role: loginUser.role },
          expiresAt: "2026-03-15T00:00:00.000Z"
        }
      });
    }
    if (method === "POST" && path === "/api/auth/logout") {
      sessionAuthenticated = false;
      return route.fulfill({ status: 200, json: { ok: true }, headers: corsHeaders });
    }
    if (method === "GET" && path === "/api/users") {
      return route.fulfill({ status: 200, json: localUsers, headers: corsHeaders });
    }
    if (method === "GET" && path === "/api/tools") {
      return route.fulfill({ status: 200, json: [], headers: corsHeaders });
    }
    if (method === "GET" && path === "/api/tool-locations") {
      return route.fulfill({ status: 200, json: [], headers: corsHeaders });
    }
    if (method === "GET" && path === "/api/parts") {
      return route.fulfill({
        status: 200,
        json: [{ id: "1234", description: "Hydraulic Cylinder Body" }],
        headers: corsHeaders
      });
    }
    if (method === "GET" && path === "/api/parts/1234") {
      return route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: DEFAULT_PART_DETAIL
      });
    }
    if (method === "GET" && path === "/api/jobs") {
      return route.fulfill({ status: 200, json: jobs, headers: corsHeaders });
    }
    if (method === "GET" && path === "/api/records") {
      return route.fulfill({ status: 200, json: records, headers: corsHeaders });
    }
    if (method === "GET" && path === "/api/roles") {
      return route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: [
          { role: "Operator", capabilities: ["view_operator", "submit_records", "view_records"] },
          { role: "Admin", capabilities: ADMIN_CAPS }
        ]
      });
    }
    if (method === "POST" && path === "/api/sessions/start") {
      return route.fulfill({ status: 200, json: { ok: true }, headers: corsHeaders });
    }
    if (method === "POST" && path === "/api/sessions/end") {
      return route.fulfill({ status: 200, json: { ok: true }, headers: corsHeaders });
    }

    if (method === "POST" && path === "/api/parts") {
      if (createPartDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, createPartDelayMs));
      }
      if (createPartMode === "error") {
        return route.fulfill({ status: 500, json: { error: "create_part_failed" }, headers: corsHeaders });
      }
      const payload = req.postDataJSON() ?? {};
      return route.fulfill({
        status: 201,
        headers: corsHeaders,
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
        headers: corsHeaders,
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
      return route.fulfill({
        status: 200,
        json: { ok: true, total: 1, inserted: 1, updated: 0 },
        headers: corsHeaders
      });
    }
    if (enableImports && method === "POST" && path === "/api/imports/part-dimensions/csv") {
      return route.fulfill({
        status: 200,
        json: { ok: true, totalRows: 1, partsUpserted: 1, operationsUpserted: 1, dimensionsUpserted: 1 },
        headers: corsHeaders
      });
    }
    if (enableImports && method === "GET" && path === "/api/imports/integrations") {
      return route.fulfill({ status: 200, json: [], headers: corsHeaders });
    }
    if (enableImports && method === "GET" && path === "/api/imports/unresolved") {
      return route.fulfill({ status: 200, json: [], headers: corsHeaders });
    }
    if (enableImports && method === "POST" && path === "/api/imports/integrations") {
      return route.fulfill({
        status: 201,
        json: { id: 1, name: "Mock Integration", source_type: "api_pull", import_type: "jobs" },
        headers: corsHeaders
      });
    }
    if (enableImports && method === "POST" && path === "/api/imports/measurements/bulk") {
      return route.fulfill({
        status: 200,
        json: { ok: true, totalRows: 1, inserted: 1, updated: 0, failed: 0 },
        headers: corsHeaders
      });
    }

    return route.fulfill({ status: 404, json: { error: `Unhandled ${method} ${path}` }, headers: corsHeaders });
  };

  await page.route("**/*", routeHandler);
}

async function loginAsAdmin(page) {
  await page.getByLabel("Username").fill("Admin User");
  await page.getByLabel("Password").fill("inspectflow");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByText("Manufacturing Inspection System")).toBeVisible();
  await expect(page.getByText("Admin User")).toBeVisible();
  await expect(page.locator(".user-ctrl select")).toHaveCount(0);
}

test.describe("Mocked UI smoke @mock", () => {
  test("loads the InspectFlow shell", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.locator("select")).toHaveCount(0);
    await loginAsAdmin(page);
    await expect(page.getByText("InspectFlow", { exact: false })).toBeVisible();
  });

  test("shows loading and success transitions during part creation", async ({ page }) => {
    await mockApi(page, { createPartMode: "success", createPartDelayMs: 500 });
    await page.goto("/");
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Admin", exact: true }).click();
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

    await page.getByRole("button", { name: "Admin", exact: true }).click();
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

    await page.getByRole("button", { name: "Admin", exact: true }).click();
    await page.locator("aside.admin-sidebar").getByRole("button", { name: "Job Management" }).click();
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

    await page.getByRole("button", { name: "Admin", exact: true }).click();
    await page.getByRole("button", { name: "Data Imports" }).click();

    const toolsTextarea = page.getByPlaceholder("Paste tools CSV here…");
    const toolsSection = toolsTextarea.locator("xpath=ancestor::div[contains(@class,'card-body')][1]");
    await toolsSection.getByRole("button", { name: "Load Sample" }).click();
    const importResponse = page.waitForResponse((response) =>
      response.url().includes("/api/imports/tools/csv")
      && response.request().method() === "POST"
    );
    await toolsSection.getByRole("button", { name: "Run Tool Import" }).click();
    const response = await importResponse;
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, inserted: 1 });
  });

  test("restores route state on reload and browser back/forward", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Admin", exact: true }).click();
    await page.getByRole("button", { name: "Part / Op Setup" }).click();
    await expect(page).toHaveURL(/view=admin/);
    await expect(page).toHaveURL(/adminTab=parts/);

    await page.reload();
    await expect(page).toHaveURL(/view=admin/);
    await expect(page).toHaveURL(/adminTab=parts/);

    await page.getByRole("button", { name: "Home", exact: true }).click();
    await expect(page).toHaveURL(/view=home/);

    await page.goBack();
    await expect(page).toHaveURL(/view=admin/);
    await expect(page).toHaveURL(/adminTab=parts/);
  });

  test("scopes '?' shortcut and restores focus when help closes", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Admin", exact: true }).click();
    const jobInput = page.getByPlaceholder("J-10045");
    await jobInput.click();
    await page.keyboard.press("Shift+/");
    await expect(page.getByRole("dialog", { name: "Keyboard Shortcuts" })).toHaveCount(0);

    const homeButton = page.getByRole("button", { name: "Home", exact: true });
    await homeButton.focus();
    await page.keyboard.press("Shift+/");
    const helpDialog = page.getByRole("dialog", { name: "Keyboard Shortcuts" });
    await expect(helpDialog).toBeVisible();
    await expect(page.getByRole("button", { name: "Close shortcut help" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(helpDialog).toHaveCount(0);
    await expect(homeButton).toBeFocused();
  });

  test("shows role-aware dashboard primary actions", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await loginAsAdmin(page);
    await expect(page.getByRole("heading", { name: "Explore the sample workspace in under five minutes" })).toBeVisible();
    await expect(page.getByText("Sample job J-10042")).toBeVisible();
    await expect(page.getByText("Primary Action")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Admin control center" })).toBeVisible();
    const primaryCard = page.locator("article").filter({ hasText: "Primary Action" });
    await primaryCard.getByRole("button", { name: "Manage jobs" }).click();
    await expect(page).toHaveURL(/view=admin/);
    await expect(page).toHaveURL(/adminTab=jobs/);
  });

  test("guides first-run onboarding and can reset the walkthrough", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await loginAsAdmin(page);

    const onboarding = page.getByTestId("customer-onboarding");
    await expect(onboarding.getByText("0/3 steps complete")).toBeVisible();
    await expect(onboarding.getByText("safe to revisit")).toBeVisible();
    await expect(onboarding.getByRole("button", { name: "Show me the workflow" })).toBeVisible();
    await expect(onboarding.getByRole("button", { name: "Reset demo path" })).toBeVisible();

    await onboarding.getByRole("button", { name: "Show me the workflow" }).click();
    await expect(page).toHaveURL(/view=admin/);
    await expect(page).toHaveURL(/adminTab=jobs/);

    await page.getByRole("button", { name: "Home", exact: true }).click();
    await expect(page.getByTestId("customer-onboarding").getByText("1/3 steps complete")).toBeVisible();
    await expect(page.getByTestId("customer-onboarding").getByText("Completed", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Reset demo path" }).click();
    await expect(page.getByTestId("customer-onboarding").getByText("0/3 steps complete")).toBeVisible();

    await page.getByRole("button", { name: "Reset walkthrough" }).click();
    await expect(page.getByTestId("customer-onboarding").getByText("0/3 steps complete")).toBeVisible();
  });

  test("shows system trust indicators for backup freshness, update readiness, import health, and audit confidence", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await loginAsAdmin(page);

    const trustStrip = page.getByTestId("trust-strip");
    await expect(trustStrip).toBeVisible();
    await expect(trustStrip).toContainText("System trust at a glance");
    await expect(trustStrip).toContainText("Operational confidence is summarized from the current workspace.");
    await expect(page.getByTestId("trust-card-backups")).toContainText("Backup freshness");
    await expect(page.getByTestId("trust-card-update-readiness")).toContainText("Update readiness");
    await expect(page.getByTestId("trust-card-import-health")).toContainText("Import health");
    await expect(page.getByTestId("trust-card-audit-confidence")).toContainText("Audit/log confidence");
  });

  test("shows operator-specific dashboard primary action", async ({ page }) => {
    await mockApi(page, { loginUser: { id: 2, name: "Operator User", role: "Operator", active: true } });
    await page.goto("/");
    await page.getByLabel("Username").fill("Operator User");
    await page.getByLabel("Password").fill("inspectflow");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByRole("heading", { name: "Operator start point" })).toBeVisible();
    await expect(page.locator("article").filter({ hasText: "Primary Action" }).getByRole("button", { name: "Start operator entry" })).toBeVisible();
  });

  test("uses one coherent admin navigation surface", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Admin", exact: true }).click();
    await expect(page.getByText("Admin Workspace", { exact: true })).toBeVisible();
    await expect(page.locator(".sub-tabs")).toHaveCount(0);
    await page.getByRole("button", { name: "Data Imports" }).click();
    await expect(page.locator(".admin-main .card-title").filter({ hasText: "Data Imports" }).first()).toBeVisible();
  });

  test("paginates jobs and records consistently for large datasets", async ({ page }) => {
    const jobs = Array.from({ length: 110 }).map((_, idx) => ({
      id: `J-${String(10000 + idx).padStart(5, "0")}`,
      part_id: "1234",
      operation_id: 10,
      lot: "Lot A",
      qty: 12,
      status: "open"
    }));
    const records = Array.from({ length: 55 }).map((_, idx) => ({
      id: 1000 + idx,
      job_id: `J-${String(20000 + idx).padStart(5, "0")}`,
      part_id: "1234",
      operation_id: 10,
      lot: `Lot-${Math.floor(idx / 10) + 1}`,
      qty: 1,
      timestamp: `2026-03-15T${String(10 + Math.floor(idx / 2)).padStart(2, "0")}:00:00.000Z`,
      status: "complete",
      oot: false,
      comment: "",
      operator_user_id: 1
    }));

    await mockApi(page, { jobs, records });
    await page.goto("/");
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Admin", exact: true }).click();
    await page.locator("aside.admin-sidebar").getByRole("button", { name: "Job Management" }).click();

    const jobsRows = page.locator("table.data-table tbody tr");
    const pager = page.locator(".admin-main").getByRole("navigation", { name: "Pagination" });

    await expect(jobsRows).toHaveCount(25);
    await expect(pager).toContainText("Showing 1-25 of 110 jobs");
    await expect(pager).toContainText("Page 1 of 5");

    await pager.getByLabel("Rows per page").selectOption("50");
    await expect(jobsRows).toHaveCount(50);
    await expect(pager).toContainText("Showing 1-50 of 110 jobs");
    await expect(pager).toContainText("Page 1 of 3");

    await pager.getByRole("button", { name: "Go to next page" }).click();
    await expect(pager).toContainText("Showing 51-100 of 110 jobs");
    await expect(pager).toContainText("Page 2 of 3");

    await page.locator("aside.admin-sidebar").getByRole("button", { name: "Records" }).click();
    const recordRows = page.locator("table.data-table tbody tr");
    const recordPager = page.locator(".admin-main").getByRole("navigation", { name: "Pagination" });

    await expect(recordRows).toHaveCount(25);
    await expect(recordPager).toContainText("Showing 1-25 of 55 records");
    await expect(recordPager).toContainText("Page 1 of 3");

    await recordPager.getByLabel("Rows per page").selectOption("50");
    await expect(recordRows).toHaveCount(50);
    await expect(recordPager).toContainText("Showing 1-50 of 55 records");
    await expect(recordPager).toContainText("Page 1 of 2");

    await recordPager.getByRole("button", { name: "Go to next page" }).click();
    await expect(recordPager).toContainText("Showing 51-55 of 55 records");
    await expect(recordPager).toContainText("Page 2 of 2");
  });
});

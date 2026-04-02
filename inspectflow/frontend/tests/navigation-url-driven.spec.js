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

async function mockApi(page) {
  let sessionAuthenticated = false;

  const routeHandler = async (route) => {
    const req = route.request();
    const { pathname } = new URL(req.url());
    const requestOrigin = (await req.headerValue("origin")) || "http://127.0.0.1:5173";
    const corsHeaders = {
      "access-control-allow-origin": requestOrigin,
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "content-type,x-user-role",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS"
    };

    if (req.method() === "OPTIONS" && pathname.startsWith("/api/")) {
      return route.fulfill({ status: 204, headers: corsHeaders });
    }

    if (req.method() === "GET" && pathname === "/api/auth/session") {
      if (!sessionAuthenticated) {
        return route.fulfill({ status: 401, json: { valid: false }, headers: corsHeaders });
      }
      return route.fulfill({
        status: 200,
        json: { valid: true, user: { id: 1, name: "Admin User", role: "Admin" } },
        headers: corsHeaders
      });
    }
    if (req.method() === "GET" && pathname === "/api/auth/profile") {
      return route.fulfill({
        status: 200,
        json: { mode: "local", summary: "Local accounts enabled." },
        headers: corsHeaders
      });
    }
    if (req.method() === "POST" && pathname === "/api/auth/login") {
      sessionAuthenticated = true;
      return route.fulfill({
        status: 200,
        json: { ok: true, user: { id: 1, name: "Admin User", role: "Admin" }, expiresAt: "2026-04-15T00:00:00.000Z" },
        headers: corsHeaders
      });
    }
    if (req.method() === "POST" && pathname === "/api/auth/logout") {
      sessionAuthenticated = false;
      return route.fulfill({ status: 200, json: { ok: true }, headers: corsHeaders });
    }

    if (req.method() === "GET" && pathname === "/api/auth/users") {
      return route.fulfill({
        status: 200,
        json: [{ id: 1, name: "Admin User", role: "Admin", active: true }],
        headers: corsHeaders
      });
    }
    if (req.method() === "GET" && pathname === "/api/users") {
      return route.fulfill({
        status: 200,
        json: [{ id: 1, name: "Admin User", role: "Admin", active: true }],
        headers: corsHeaders
      });
    }
    if (req.method() === "GET" && pathname === "/api/tools") {
      return route.fulfill({ status: 200, json: [], headers: corsHeaders });
    }
    if (req.method() === "GET" && pathname === "/api/tool-locations") {
      return route.fulfill({ status: 200, json: [], headers: corsHeaders });
    }
    if (req.method() === "GET" && pathname === "/api/parts") {
      return route.fulfill({ status: 200, json: [{ id: "1234", description: "Demo Part" }], headers: corsHeaders });
    }
    if (req.method() === "GET" && pathname === "/api/parts/1234") {
      return route.fulfill({
        status: 200,
        json: {
          id: "1234",
          description: "Demo Part",
          currentRevision: "A",
          selectedRevision: "A",
          nextRevision: "B",
          revisions: [
            {
              revision: "A",
              revisionIndex: 1,
              partName: "Demo Part",
              changeSummary: "Initial setup baseline",
              changedFields: [],
              createdByRole: "Admin",
              createdAt: "2026-04-01T00:00:00.000Z"
            }
          ],
          operations: [{ id: 10, opNumber: "10", label: "Op 10", dimensions: [] }]
        },
        headers: corsHeaders
      });
    }
    if (req.method() === "GET" && pathname === "/api/jobs") {
      return route.fulfill({ status: 200, json: [], headers: corsHeaders });
    }
    if (req.method() === "GET" && pathname === "/api/records") {
      return route.fulfill({ status: 200, json: [], headers: corsHeaders });
    }
    if (req.method() === "GET" && pathname === "/api/roles") {
      return route.fulfill({
        status: 200,
        json: [
          { role: "Operator", capabilities: ["view_operator", "submit_records", "view_records"] },
          { role: "Admin", capabilities: ADMIN_CAPS }
        ],
        headers: corsHeaders
      });
    }
    if (req.method() === "POST" && pathname === "/api/sessions/start") {
      return route.fulfill({ status: 200, json: { ok: true }, headers: corsHeaders });
    }
    if (req.method() === "POST" && pathname === "/api/sessions/end") {
      return route.fulfill({ status: 200, json: { ok: true }, headers: corsHeaders });
    }

    return route.fulfill({ status: 404, json: { error: "not_mocked" }, headers: corsHeaders });
  };

  await page.route("http://localhost:4000/api/**", routeHandler);
  await page.route("http://127.0.0.1:4000/api/**", routeHandler);
}

test.describe("URL-driven navigation (BL-062) @mock", () => {
  test("admin sub-tab is encoded in URL and survives back/forward", async ({ page }) => {
    await mockApi(page);

    await page.goto("/");
    await page.getByLabel("Username").fill("Admin User");
    await page.getByLabel("Password").fill("inspectflow");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByText("Manufacturing Inspection System")).toBeVisible();

    await page.getByRole("button", { name: "Admin", exact: true }).click();
    await expect(page).toHaveURL(/view=admin/);
    await expect(page).toHaveURL(/adminTab=jobs/);

    await page.getByRole("button", { name: "Tool Library" }).click();
    await expect(page).toHaveURL(/view=admin/);
    await expect(page).toHaveURL(/adminTab=tools/);

    await page.getByRole("button", { name: "Home", exact: true }).click();
    await expect(page).toHaveURL(/view=home/);
    await expect(page).not.toHaveURL(/adminTab=/);

    // Returning to admin should use the most-recent admin tab (not reset to jobs).
    await page.getByRole("button", { name: "Admin", exact: true }).click();
    await expect(page).toHaveURL(/view=admin/);
    await expect(page).toHaveURL(/adminTab=tools/);

    // Back/forward should replay the exact URL-driven route state.
    await page.goBack();
    await expect(page).toHaveURL(/view=home/);
    await page.goForward();
    await expect(page).toHaveURL(/view=admin/);
    await expect(page).toHaveURL(/adminTab=tools/);
  });
});

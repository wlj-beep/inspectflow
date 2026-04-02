import { test, expect } from "@playwright/test";

const ADMIN_CAPS = [
  "view_admin",
  "view_operator",
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
      return route.fulfill({ status: 401, json: { valid: false }, headers: corsHeaders });
    }
    if (req.method() === "GET" && pathname === "/api/auth/profile") {
      return route.fulfill({ status: 200, json: { mode: "local", summary: "Local accounts enabled." }, headers: corsHeaders });
    }
    if (req.method() === "POST" && pathname === "/api/auth/login") {
      return route.fulfill({
        status: 200,
        json: { ok: true, user: { id: 1, name: "Admin User", role: "Admin" }, expiresAt: "2026-03-15T00:00:00.000Z" },
        headers: corsHeaders
      });
    }
    if (req.method() === "GET" && pathname === "/api/users") {
      return route.fulfill({ status: 200, json: [{ id: 1, name: "Admin User", role: "Admin", active: true }], headers: corsHeaders });
    }
    if (req.method() === "GET" && pathname === "/api/tools") {
      return route.fulfill({ status: 200, json: [{ id: 1, name: "Caliper", type: "Variable", it_num: "IT-001" }], headers: corsHeaders });
    }
    if (req.method() === "GET" && pathname === "/api/tool-locations") {
      return route.fulfill({ status: 200, json: [{ id: 1, name: "Tool Room", location_type: "room" }], headers: corsHeaders });
    }
    if (req.method() === "GET" && pathname === "/api/parts") {
      return route.fulfill({ status: 200, json: [{ id: "1234", description: "Hydraulic Cylinder Body" }], headers: corsHeaders });
    }
    if (req.method() === "GET" && pathname === "/api/parts/1234") {
      return route.fulfill({
        status: 200,
        json: {
          id: "1234",
          description: "Hydraulic Cylinder Body",
          currentRevision: "A",
          selectedRevision: "A",
          nextRevision: "B",
          revisions: [],
          operations: [
            { id: 10, opNumber: "10", label: "Rough Turn", dimensions: [] }
          ]
        },
        headers: corsHeaders
      });
    }
    if (req.method() === "GET" && pathname === "/api/jobs") {
      return route.fulfill({
        status: 200,
        json: [
          { id: "J-5001", part_id: "1234", part_revision_code: "A", operation_id: 10, lot: "Lot-A", qty: 1, status: "open" }
        ],
        headers: corsHeaders
      });
    }
    if (req.method() === "GET" && pathname === "/api/records") {
      return route.fulfill({
        status: 200,
        json: [
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
            tools: { "10": [{ toolId: "tool-1", toolName: "Caliper", itNum: "IT-001" }] },
            auditLog: [],
            missingPieces: {}
          }
        ],
        headers: corsHeaders
      });
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
    if (req.method() === "GET" && pathname === "/api/proof-center/summary") {
      return route.fulfill({
        status: 200,
        json: {
          contractId: "ANA-PROOF-v1",
          siteScope: "default",
          entitlements: {
            licenseTier: "core_plus",
            activeBundles: [{ bundleId: "core_site", label: "Core Site" }],
            seatPolicy: { label: "Soft Buffer" },
            authProfile: { providerLabel: "Local Accounts" }
          },
          proofPack: {
            headline: "Customer proof pack",
            summary: "Redacted summary for customer presentation.",
            bullets: ["Value score 88/100 with ready deployment readiness."],
            redactions: ["raw measurement payloads"]
          },
          trustIndicators: [],
          readiness: {
            valueScore: 88,
            deploymentCompletion: { status: "ready" },
            adoptionMilestone: { milestone: "adopting" },
            renewalRisk: { level: "low" }
          },
          kpiDashboard: {
            contractId: "ANA-KPI-v3",
            kpis: { first_pass_yield: 0.91 },
            breakdowns: { byWorkCenter: [] }
          },
          runtimeSlo: {
            contractId: "PLAT-SLO-v1",
            current: { status: "healthy", tone: "success", label: "Operationally ready", summary: "All runtime SLO signals are green." },
            targets: {
              uptime: { targetPct: 99.5 },
              importSuccess: { targetPct: 99 }
            }
          },
          readOnlyDrilldowns: [],
          shareableText: "Customer proof pack\n\nRedacted summary for customer presentation.\n\nRedactions:\n- raw measurement payloads"
        },
        headers: corsHeaders
      });
    }
    if (req.method() === "GET" && pathname === "/api/integration/ecosystem/compatibility") {
      return route.fulfill({
        status: 200,
        json: {
          contractId: "PLAT-ECO-v1",
          summary: { status: "ready", readyChecks: 1, deferredChecks: 0, totalChecks: 1 },
          checks: []
        },
        headers: corsHeaders
      });
    }
    if (req.method() === "GET" && pathname === "/api/technical-ops/summary") {
      return route.fulfill({ status: 200, json: { generatedAt: "2026-04-01T00:00:00.000Z", runtimeSlo: { current: { label: "Operationally ready", status: "healthy", tone: "success" } } }, headers: corsHeaders });
    }
    if (req.method() === "GET" && pathname === "/api/technical-ops/lifecycle/summary") {
      return route.fulfill({ status: 200, json: { capacity: { backupWithinBudget: true, logWithinBudget: true }, policy: { backupRetentionDays: 14 } }, headers: corsHeaders });
    }

    return route.fulfill({ status: 404, json: { error: `Unhandled ${req.method()} ${pathname}` }, headers: corsHeaders });
  };

  await page.route("http://localhost:4000/api/**", routeHandler);
  await page.route("http://127.0.0.1:4000/api/**", routeHandler);
}

async function loginAsAdmin(page) {
  await expect(page.getByText("InspectFlow Login")).toBeVisible();
  await page.getByLabel("Username").fill("Admin User");
  await page.getByLabel("Password").fill("inspectflow");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByText("Manufacturing Inspection System")).toBeVisible();
}

async function expectNoHorizontalOverflow(page) {
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
}

test.describe("shell layout @mock", () => {
  test("stays within the viewport at desktop and tablet widths", async ({ page }) => {
    await mockApi(page);

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 }
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expectNoHorizontalOverflow(page);

      await loginAsAdmin(page);
      await expectNoHorizontalOverflow(page);

      await page.getByRole("button", { name: "Home", exact: true }).click();
      await expectNoHorizontalOverflow(page);

      await page.getByRole("button", { name: "Proof Center" }).click();
      await expectNoHorizontalOverflow(page);

      await page.getByRole("button", { name: "Operator Entry" }).click();
      await expectNoHorizontalOverflow(page);

      await page.getByRole("button", { name: "Admin" }).click();
      await expectNoHorizontalOverflow(page);
    }
  });
});

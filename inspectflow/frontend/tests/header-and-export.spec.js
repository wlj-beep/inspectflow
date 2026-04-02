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

const AS9102_EXPORT = {
  contractId: "QUAL-AS9102-PKG-v1",
  exportContractId: "AS9102-EXPORT-v1",
  profile: {
    id: "as9102-basic",
    name: "AS9102 Basic",
    version: "0.1.0",
    templateIds: ["fai-summary-v1", "fai-line-v1"]
  },
  record: {
    id: 201,
    jobId: "J-5001",
    partId: "1234",
    partRevision: "A",
    operationId: 10,
    operationNumber: "10",
    operationLabel: "Rough Turn",
    lot: "Lot-A",
    qty: 1,
    status: "complete",
    createdAt: "2026-03-30T10:00:00.000Z"
  },
  input: {
    part: {
      id: "1234",
      revision: "A",
      description: "Hydraulic Cylinder Body"
    },
    lot: "Lot-A",
    balloonSummary: "B1:#1",
    fixtureSummary: "fixture-first-article:pass",
    stats: {
      measured: 1,
      failed: 0,
      expectedMeasurements: 1,
      passRate: 1
    }
  },
  package: {
    contractId: "QUAL-AS9102-PKG-v1",
    summary: {
      measured: 1,
      failed: 0,
      expectedMeasurements: 1,
      passRate: 1
    }
  },
  output: {
    artifacts: [
      {
        templateId: "fai-summary-v1",
        description: "Human-readable first article summary",
        fileName: "as9102-1234-as9102-basic.txt"
      },
      {
        templateId: "fai-package-json-v1",
        description: "Structured AS9102 package payload",
        fileName: "as9102-1234-as9102-basic.json"
      }
    ]
  },
  availableProfiles: [
    { id: "as9102-basic", name: "AS9102 Basic", version: "0.1.0" },
    { id: "as9102-fixture-pack", name: "AS9102 Fixture Pack", version: "0.1.0" }
  ]
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
    if (req.method() === "GET" && pathname === "/api/auth/profile") {
      return route.fulfill({ status: 200, json: { mode: "local", summary: "Local accounts enabled." } });
    }
    if (req.method() === "GET" && pathname === "/api/proof-center/summary") {
      return route.fulfill({
        status: 200,
        json: {
          contractId: "ANA-PROOF-v1",
          siteScope: "default",
          entitlements: {
            licenseTier: "core_plus",
            activeBundles: [{ bundleId: "core_site", label: "Core Site" }, { bundleId: "quality_pro", label: "Quality Pro" }],
            seatPolicy: { label: "Soft Buffer" },
            authProfile: { providerLabel: "Local Accounts" }
          },
          proofPack: {
            headline: "Customer proof pack",
            summary: "Redacted summary for customer presentation.",
            bullets: ["Value score 88/100 with ready deployment readiness."],
            redactions: ["raw measurement payloads"]
          },
          trustIndicators: [
            { key: "backups", label: "Backup freshness", value: "Current", detail: "Last verified 2026-03-31T12:00:00.000Z." },
            { key: "updates", label: "Update readiness", value: "Ready", detail: "Retention and storage targets are within plan." },
            { key: "imports", label: "Import health", value: "Healthy", detail: "Connector monitoring is online and ready." },
            { key: "audit", label: "Audit/log confidence", value: "Current", detail: "4 records and 2 import runs are traceable in-app." }
          ],
          readiness: {
            valueScore: 88,
            deploymentCompletion: { status: "ready" },
            adoptionMilestone: { milestone: "adopting" },
            renewalRisk: { level: "low" }
          },
          kpiDashboard: {
            contractId: "ANA-KPI-v3",
            kpis: { first_pass_yield: 0.91 },
            breakdowns: { byWorkCenter: [{ workCenterId: "wc-1", kpis: { first_pass_yield: 0.91 } }] }
          },
          runtimeSlo: {
            contractId: "PLAT-SLO-v1",
            current: { status: "healthy", tone: "success", label: "Operationally ready", summary: "All runtime SLO signals are green." },
            targets: {
              uptime: { targetPct: 99.5 },
              importSuccess: { targetPct: 99 }
            },
            alertThresholds: {
              backupFreshnessHours: { warning: 24, degraded: 72 }
            },
            incidentResponse: {
              runbookPath: "docs/technical-ops-runbook.md"
            }
          },
          readOnlyDrilldowns: [
            { id: "runtime-slo", label: "Runtime SLO", status: "healthy", detail: "Uptime target 99.5% and import success target 99% are tracked alongside the active operationally ready posture.", deferredBy: null },
            { id: "customer-value", label: "Customer value", status: "ready", detail: "Value score 88/100 combines deployment completion, adoption milestone, and renewal-risk signals.", deferredBy: null },
            { id: "trust-evidence", label: "Trust evidence", status: "healthy", detail: "Read-only trust drilldowns summarize backups, update readiness, import health, and audit confidence without exposing restricted internals.", deferredBy: null }
          ],
          ecosystem: {
            contractId: "PLAT-ECO-v1",
            summary: { status: "ready", readyChecks: 6, deferredChecks: 0, totalChecks: 6 },
            checks: [
              { id: "extension-sdk-boundary", label: "Extension SDK boundary", status: "pass", detail: "Policy-gated.", deferredBy: null },
              { id: "proof-drilldowns", label: "Customer proof drilldowns", status: "pass", detail: "Read-only drilldowns are backed by the runtime SLO and customer proof surfaces.", deferredBy: null }
            ]
          },
          shareableText: "Customer proof pack\n\nRedacted summary for customer presentation.\n\nRuntime SLO: Operationally ready (healthy).\n\nRedactions:\n- raw measurement payloads"
        }
      });
    }
    if (req.method() === "GET" && pathname === "/api/integration/ecosystem/compatibility") {
      return route.fulfill({
        status: 200,
        json: {
          contractId: "PLAT-ECO-v1",
          policy: {
            mode: "entitlement-driven"
          },
          runtimeScaffold: {
            extensionRuntime: { status: "scaffolded" }
          },
          summary: { status: "ready", readyChecks: 6, deferredChecks: 0, totalChecks: 6 },
          checks: [
            { id: "extension-sdk-boundary", label: "Extension SDK boundary", status: "pass", detail: "Policy-gated.", deferredBy: null },
            { id: "proof-drilldowns", label: "Customer proof drilldowns", status: "pass", detail: "Read-only drilldowns are backed by the runtime SLO and customer proof surfaces.", deferredBy: null }
          ]
        }
      });
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
    if (req.method() === "GET" && pathname.startsWith("/api/records/201/export/as9102")) {
      return route.fulfill({ status: 200, json: AS9102_EXPORT });
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
  await page.getByLabel("Username").fill("Admin User");
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

  test("shows the customer proof center with redacted shareable output", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Proof Center" }).click();

    await expect(page.getByText("Present the proof pack, not the internals.")).toBeVisible();
    await expect(page.getByText("Customer proof pack", { exact: true })).toBeVisible();
    await expect(page.getByText("raw measurement payloads", { exact: true })).toBeVisible();
    await expect(page.getByTestId("proof-drilldowns")).toBeVisible();
    await expect(page.getByTestId("runtime-slo-policy")).toBeVisible();
    await expect(page.getByText("Extension SDK boundary")).toBeVisible();
    await expect(page.getByText("Customer proof drilldowns")).toBeVisible();
    await expect(page.getByLabel("Shareable proof export preview")).toHaveValue(/Redacted summary/);
  });

  test("shows the branded AS9102 summary pack in record details", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Records", exact: true }).click();
    await page.locator("tbody tr").nth(1).click();

    await expect(page.getByText("Inspection Record — J-5001")).toBeVisible();
    await expect(page.getByText("Branded Summary Pack")).toBeVisible();
    await expect(page.getByLabel("Summary pack profile")).toHaveValue("as9102-basic");
    await expect(page.getByLabel("Summary pack preview")).toHaveValue(/AS9102 Basic/);
    await expect(page.getByText("Safe to present", { exact: true })).toBeVisible();
    await expect(page.getByText("Artifacts included: fai-summary-v1, fai-package-json-v1")).toBeVisible();
  });
});

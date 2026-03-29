import { test, expect } from "@playwright/test";
import {
  DEFAULT_INSTRUCTION_VERSION,
  DEFAULT_PART_DETAIL,
  TEST_IDS,
  loginAsAdmin,
  loginAsUser,
  mockApi
} from "./helpers/mockedSmokeFixtures.js";

test.describe("Mocked UI smoke @mock", () => {
  test("home dashboard is the default after login and shows key cards @mock", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await loginAsAdmin(page);
    await expect(page.getByText("Home Dashboard", { exact: true })).toBeVisible();
    await expect(page.getByText("Open Jobs", { exact: true })).toBeVisible();
    await expect(page.getByTestId("authenticated-user")).toContainText("Admin User");
    await expect(page.getByTestId("authenticated-user")).not.toContainText("Select user");
  });

  test("admin tab state survives reload when opened from URL @mock", async ({ page }) => {
    await mockApi(page);
    await page.goto("/?view=admin&adminTab=users");
    await loginAsAdmin(page);

    await expect(page.getByText("Admin / Users")).toBeVisible();
    await expect(page.getByRole("button", { name: "Users" })).toHaveClass(/active/);
    await expect(page).toHaveURL(/view=admin/);
    await expect(page).toHaveURL(/adminTab=users/);

    await page.reload();

    await loginAsAdmin(page);
    await expect(page.getByText("Admin / Users")).toBeVisible();
    await expect(page.getByRole("button", { name: "Users" })).toHaveClass(/active/);
    await expect(page).toHaveURL(/view=admin/);
    await expect(page).toHaveURL(/adminTab=users/);
  });

  test("admin grid filter/sort/pagination state persists in URL across navigation and reload @mock", async ({ page }) => {
    const toolsList = Array.from({ length: 60 }, (_, index) => ({
      id: `t-url-${index + 1}`,
      name: `Thread Gauge ${String(index + 1).padStart(2, "0")}`,
      type: "Go/No-Go",
      itNum: `IT-${String(9000 + index)}`,
      active: true,
      visible: true
    }));
    const jobs = Array.from({ length: 60 }, (_, index) => ({
      id: `J-URL-${String(index + 1).padStart(4, "0")}`,
      part_id: "1234",
      operation_id: 20,
      lot: "Lot Bulk",
      qty: 10 + (index % 5),
      status: "open"
    }));
    const records = Array.from({ length: 60 }, (_, index) => ({
      id: `rec-url-${index + 1}`,
      job_id: jobs[index % jobs.length].id,
      part_id: "1234",
      operation_id: 20,
      lot: "Lot Bulk",
      qty: 5,
      timestamp: `2026-03-${String((index % 20) + 1).padStart(2, "0")}T10:00:00.000Z`,
      operator_user_id: TEST_IDS.adminUserId,
      status: "complete",
      oot: true,
      comment: "bulk url state"
    }));

    await mockApi(page, { toolsList, jobs, records });
    await page.goto("/?view=admin&adminTab=tools");
    await loginAsAdmin(page);

    const queryParam = (key) => new URL(page.url()).searchParams.get(key);
    const toolsCard = page.locator(".card").filter({ hasText: "Tool Library" });
    await expect(page.getByText("Admin / Tool Library")).toBeVisible();

    await toolsCard.getByPlaceholder("Search by name, IT #, or location…").fill("thread");
    await toolsCard.getByRole("button", { name: "Go/No-Go", exact: true }).click();
    await toolsCard.locator("th", { hasText: "IT #" }).click();
    await toolsCard.getByRole("button", { name: "Next" }).click();

    await expect.poll(() => queryParam("view")).toBe("admin");
    await expect.poll(() => queryParam("adminTab")).toBe("tools");
    await expect.poll(() => queryParam("toolsSearch")).toBe("thread");
    await expect.poll(() => queryParam("toolsType")).toBe("Go/No-Go");
    await expect.poll(() => queryParam("toolsSort")).toBe("itNum");
    await expect.poll(() => queryParam("toolsDir")).toBe("asc");
    await expect.poll(() => queryParam("toolsPageSize")).toBe("25");
    await expect.poll(() => queryParam("toolsPage")).toBe("2");

    await page.getByRole("button", { name: "Job Management" }).click();
    const allJobsCard = page.locator(".card").filter({ hasText: "All Jobs" });
    await allJobsCard.getByPlaceholder("Search by job #, part, lot, or status…").fill("lot bulk");
    await allJobsCard.getByLabel("Status").selectOption("open");
    await allJobsCard.locator("th", { hasText: "Qty" }).click();
    await allJobsCard.getByRole("button", { name: "Next" }).click();

    await expect.poll(() => queryParam("view")).toBe("admin");
    await expect.poll(() => queryParam("adminTab")).toBe("jobs");
    await expect.poll(() => queryParam("jobsSearch")).toBe("lot bulk");
    await expect.poll(() => queryParam("jobsStatus")).toBe("open");
    await expect.poll(() => queryParam("jobsSort")).toBe("qty");
    await expect.poll(() => queryParam("jobsDir")).toBe("asc");
    await expect.poll(() => queryParam("jobsPageSize")).toBe("25");
    await expect.poll(() => queryParam("jobsPage")).toBe("2");

    await page.getByRole("button", { name: "Inspection Records" }).click();
    const recordFilterCard = page.locator(".card").filter({ has: page.locator("#records-filter-search") }).first();
    const recordsCard = page.locator(".card").filter({ hasText: "Records" });
    await page.locator("#records-filter-search").fill("bulk");
    await page.locator("#records-filter-result").selectOption("oot");
    await recordsCard.locator("th", { hasText: "Lot" }).click();
    await recordsCard.getByRole("button", { name: "Next" }).click();

    await expect.poll(() => queryParam("view")).toBe("admin");
    await expect.poll(() => queryParam("adminTab")).toBe("records");
    await expect.poll(() => queryParam("recordsSearch")).toBe("bulk");
    await expect.poll(() => queryParam("recordsStatus")).toBe("oot");
    await expect.poll(() => queryParam("recordsSort")).toBe("lot");
    await expect.poll(() => queryParam("recordsDir")).toBe("asc");
    await expect.poll(() => queryParam("recordsPageSize")).toBe("25");
    await expect.poll(() => queryParam("recordsPage")).toBe("2");

    await page.getByRole("button", { name: "Job Management" }).click();
    await expect(allJobsCard.getByPlaceholder("Search by job #, part, lot, or status…")).toHaveValue("lot bulk");
    await expect(allJobsCard).toContainText("Page 2/");

    await page.getByRole("button", { name: "Tool Library" }).click();
    await expect(toolsCard.getByPlaceholder("Search by name, IT #, or location…")).toHaveValue("thread");
    await expect(toolsCard).toContainText("Page 2/");

    await page.getByRole("button", { name: "Inspection Records" }).click();
    await expect.poll(() => queryParam("recordsPage")).toBe("2");
    await page.reload();
    await loginAsAdmin(page);
    await expect(page.getByText("Admin / Inspection Records")).toBeVisible();
    await expect(page.locator("#records-filter-search")).toHaveValue("bulk");
    await expect(page.locator("#records-filter-result")).toHaveValue("oot");
    await expect.poll(() => queryParam("recordsPage")).toBe("2");
    await expect(recordsCard).toContainText("Page 2/");
  });

  test("global search opens deep-linked record context from one surface @mock", async ({ page }) => {
    await mockApi(page, {
      records: [
        {
          id: "r001",
          job_id: "J-10042",
          part_id: "1234",
          operation_id: 20,
          lot: "Lot A",
          qty: 1,
          timestamp: "2026-03-21T12:00:00.000Z",
          operator_user_id: TEST_IDS.adminUserId,
          status: "complete",
          oot: true,
          comment: "Found OOT on first piece",
          values: [{ dimensionId: 1, pieceNumber: 1, value: "1.0055", isOot: true }],
          tools: [],
          missingPieces: [],
          pieceComments: [],
          auditLog: []
        }
      ]
    });
    await page.goto("/");
    await loginAsAdmin(page);

    await page.getByLabel("Global search").fill("r001");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: /Record r001/i }).click();

    await expect(page.getByRole("button", { name: "Records", exact: true })).toHaveClass(/active/);
    await expect(page.getByText("Record Detail")).toBeVisible();
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

    await expect(page.getByTestId("transition-toast").filter({ hasText: "Create part…" })).toBeVisible();
    await expect(page.getByTestId("transition-toast").filter({ hasText: "Create part complete." })).toBeVisible();
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

    await expect(page.getByTestId("transition-toast").filter({ hasText: "Create part failed. create_part_failed" })).toBeVisible();
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
          operator_user_id: TEST_IDS.adminUserId,
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
          operator_user_id: TEST_IDS.adminUserId,
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

  test("tablet viewport keeps admin part setup flow usable @mock", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await mockApi(page, { createPartMode: "success" });
    await page.goto("/");
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Admin" }).click();
    await page.getByRole("button", { name: "Part / Op Setup" }).click();

    const addPartCard = page.locator(".card").filter({ hasText: "Add New Part" });
    await addPartCard.getByPlaceholder("e.g. 5678").fill("7310");
    await addPartCard.getByPlaceholder("Part name").fill("Tablet Flow Part");
    await addPartCard.getByRole("button", { name: /add part/i }).click();

    await expect(page.getByText("Part 7310")).toBeVisible();
  });

  test("tablet viewport lets admins create and publish instruction versions with media links @mock", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    let createdPayload = null;
    let publishedPayload = null;
    await mockApi(page, {
      onInstructionCreate: (payload) => {
        createdPayload = payload;
      },
      onInstructionPublish: (payload) => {
        publishedPayload = payload;
      }
    });
    await page.goto("/");
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Admin" }).click();
    await page.getByRole("button", { name: "Part / Op Setup" }).click();

    const instructionCard = page.getByTestId("instruction-manager-20");
    await expect(instructionCard).toBeVisible();
    await instructionCard.getByPlaceholder("v1 or A").fill("A");
    await instructionCard.getByPlaceholder("Setup / measurement instruction title").fill("Bore gauge setup");
    await instructionCard.getByPlaceholder("Short operator-facing summary…").fill("Use the bore gauge after zero check.");
    await instructionCard.getByPlaceholder("Label | https://example.com/file.pdf").fill("Setup PDF | https://example.com/setup.pdf");
    await instructionCard.getByPlaceholder("Detailed work or measurement instruction text…").fill("Confirm the gauge is zeroed before each piece.");
    await instructionCard.getByRole("button", { name: "Create Version" }).click();

    await expect(instructionCard.getByText("Version A")).toBeVisible();
    await expect(instructionCard.getByRole("link", { name: "Setup PDF" })).toBeVisible();

    await instructionCard.getByRole("button", { name: "Publish" }).click();
    await expect(instructionCard.getByText("published")).toBeVisible();
    await expect(instructionCard.getByText("Active")).toBeVisible();

    expect(createdPayload).not.toBeNull();
    expect(createdPayload.mediaLinks).toEqual([
      expect.objectContaining({ label: "Setup PDF", url: "https://example.com/setup.pdf" })
    ]);
    expect(publishedPayload).not.toBeNull();
    expect(publishedPayload.publish).toBe(true);
  });

  test("quality users can load, sign off, and finalize an FAI package @mock", async ({ page }) => {
    await mockApi(page, {
      authUsers: [
        { id: 3, name: "Q. Nguyen", role: "Quality", active: true },
        {
          id: TEST_IDS.adminUserId,
          name: "Admin User",
          role: "Admin",
          active: true
        }
      ],
      loginUser: { id: 3, name: "Q. Nguyen", role: "Quality" },
      jobs: [
        {
          id: "JOB-FAI-100",
          part_id: "1234",
          operation_id: 20,
          lot: "Lot FAI",
          qty: 4,
          status: "open"
        }
      ],
      partDetails: {
        "1234": {
          ...DEFAULT_PART_DETAIL,
          operations: [
            {
              id: 20,
              opNumber: "20",
              label: "Bore & Finish",
              dimensions: [
                {
                  id: "char-1",
                  name: "Bore Diameter",
                  bubbleNumber: "20",
                  featureType: "size",
                  gdtClass: "position",
                  toleranceZone: "true_position",
                  unit: "in",
                  sourceCharacteristicKey: "CHAR-1234-020-BORE"
                },
                {
                  id: "char-2",
                  name: "Surface Finish",
                  bubbleNumber: "21",
                  featureType: "surface",
                  gdtClass: "profile",
                  toleranceZone: "ra",
                  unit: "Ra",
                  sourceCharacteristicKey: "CHAR-1234-020-FINISH"
                }
              ]
            }
          ]
        }
      }
    });

    await page.goto("/");
    await loginAsUser(page, { userId: 3, expectedName: "Q. Nguyen" });

    await page.getByRole("button", { name: "Admin" }).click();
    await page.getByRole("button", { name: "FAI Workflow" }).click();

    const faiPanel = page.getByTestId("fai-workflow-panel");
    await expect(faiPanel).toBeVisible();
    await page.getByRole("button", { name: "Create / Load Package" }).click();

    await expect(page.getByText("Blocking reasons:")).toContainText("needs sign-off");
    await expect(page.getByTestId("fai-signoff-char-1")).toHaveText("Sign Off");
    await expect(page.getByTestId("fai-signoff-char-2")).toHaveText("Sign Off");

    await page.getByTestId("fai-signoff-char-1").click();
    await page.getByTestId("fai-signoff-char-2").click();

    await expect(page.getByText("Ready to finalize", { exact: true })).toBeVisible();
    await expect(page.getByTestId("fai-finalize-button")).toBeEnabled();
    await page.getByTestId("fai-finalize-button").click();

    await expect(page.getByTestId("fai-finalize-button")).toHaveText("Finalized");
  });

  test("operators do not see the FAI workflow panel @mock", async ({ page }) => {
    await mockApi(page, {
      authUsers: [
        { id: TEST_IDS.operatorUserId, name: "Op User", role: "Operator", active: true },
        { id: TEST_IDS.adminUserId, name: "Admin User", role: "Admin", active: true }
      ],
      loginUser: { id: TEST_IDS.operatorUserId, name: "Op User", role: "Operator" }
    });
    await page.goto("/");
    await loginAsUser(page, { userId: TEST_IDS.operatorUserId, expectedName: "Op User" });

    await page.getByRole("button", { name: "Operator Entry" }).click();
    await expect(page.getByTestId("fai-workflow-panel")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "FAI Workflow" })).toHaveCount(0);
  });

  test("mobile viewport keeps records export selection controls reachable @mock", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, {
      records: [
        {
          id: 201,
          job_id: "J-REC-MOBILE",
          part_id: "1234",
          operation_id: 20,
          lot: "Lot M",
          qty: 3,
          timestamp: "2026-03-15T12:00:00.000Z",
          operator_user_id: TEST_IDS.adminUserId,
          oot: false,
          status: "complete",
          comment: ""
        }
      ]
    });
    await page.goto("/");
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Records", exact: true }).click();
    await page.getByRole("button", { name: "Select Records for Export" }).click();
    await expect(page.getByRole("button", { name: "Export Selected Records CSV" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Select J-REC-MOBILE for export/i })).toBeVisible();
  });

  test("mobile operator can continue entry with Enter and surface OOT row warnings @mock", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, {
      authUsers: [
        { id: TEST_IDS.operatorUserId, name: "Op User", role: "Operator", active: true },
        { id: TEST_IDS.adminUserId, name: "Admin User", role: "Admin", active: true }
      ],
      loginUser: { id: TEST_IDS.operatorUserId, name: "Op User", role: "Operator" },
      jobs: [
        {
          id: "JOB-OP-2001",
          part_id: "1234",
          operation_id: 20,
          lot: "Lot OP",
          qty: 2,
          status: "open"
        }
      ],
      partDetails: {
        "1234": {
          ...DEFAULT_PART_DETAIL,
          operations: [
            {
              id: 20,
              opNumber: "20",
              label: "Bore & Finish",
              dimensions: [
                {
                  id: "d-op-1",
                  name: "Bore Diameter",
                  nominal: 0.625,
                  tolPlus: 0.003,
                  tolMinus: 0,
                  unit: "in",
                  sampling: "100pct",
                  input_mode: "single",
                  toolIds: []
                }
              ]
            }
          ]
        }
      }
    });
    await page.goto("/");
    await loginAsUser(page, { userId: TEST_IDS.operatorUserId, expectedName: "Op User" });

    await page.getByRole("button", { name: "Operator Entry" }).click();
    await page.getByPlaceholder("e.g. J-10042").fill("JOB-OP-2001");
    await page.getByRole("button", { name: "Load Job →" }).click();

    await expect(page.getByText("Measurement Entry")).toBeVisible();
    await expect(page.locator(".strip-val").filter({ hasText: "JOB-OP-2001" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit & Close Job" })).toBeVisible();

    const piece1Input = page.locator("tr.pr").filter({ hasText: "Pc 1" }).getByRole("spinbutton");
    const piece2Input = page.locator("tr.pr").filter({ hasText: "Pc 2" }).getByRole("spinbutton");

    await piece1Input.fill("0.7000");
    await piece1Input.press("Enter");
    await expect(piece2Input).toBeFocused();
    await piece2Input.fill("0.6250");

    await expect(page.getByRole("alert")).toContainText("First out-of-tolerance value detected");
    await expect(page.getByText("Pc 1 has out-of-tolerance values on: Bore Diameter.", { exact: true })).toBeVisible();
    await expect(page.getByText("Out-of-Tolerance Detected")).toBeVisible();
    await expect(page.getByText("Bore Diameter — Pc 1", { exact: true })).toBeVisible();

    await expect(page.getByText("Pass 1", { exact: true })).toBeVisible();
    await expect(page.getByText("Fail 1", { exact: true })).toBeVisible();
    await expect(page.getByText("N/A 0", { exact: true })).toBeVisible();
  });

  test("mobile operator acknowledges the active instruction before submitting @mock", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, {
      authUsers: [
        { id: TEST_IDS.operatorUserId, name: "Op User", role: "Operator", active: true },
        { id: TEST_IDS.adminUserId, name: "Admin User", role: "Admin", active: true }
      ],
      loginUser: { id: TEST_IDS.operatorUserId, name: "Op User", role: "Operator" },
      jobs: [
        {
          id: "JOB-OP-ACK-1",
          part_id: "1234",
          operation_id: 20,
          lot: "Lot ACK",
          qty: 1,
          status: "open"
        }
      ],
      partDetails: {
        "1234": {
          ...DEFAULT_PART_DETAIL,
          operations: [
            {
              id: 20,
              opNumber: "20",
              label: "Bore & Finish",
              dimensions: []
            }
          ]
        }
      },
      instructionVersionsByOperation: {
        "20": [DEFAULT_INSTRUCTION_VERSION]
      }
    });
    await page.goto("/");
    await loginAsUser(page, { userId: TEST_IDS.operatorUserId, expectedName: "Op User" });

    await page.getByRole("button", { name: "Operator Entry" }).click();
    await page.getByPlaceholder("e.g. J-10042").fill("JOB-OP-ACK-1");
    await page.getByRole("button", { name: "Load Job →" }).click();

    const instructionCard = page.getByTestId("active-instruction-card");
    await expect(instructionCard.getByText("Probe setup")).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit & Close Job" })).toBeDisabled();
    await expect(page.getByTestId("instruction-ack-button")).toBeVisible();

    await page.getByTestId("instruction-ack-button").click();
    await expect(page.getByTestId("instruction-ack-button")).toHaveText("Acknowledged");
    await expect(page.getByRole("button", { name: "Submit & Close Job" })).toBeEnabled();

    await page.getByRole("button", { name: "Submit & Close Job" }).click();
    await expect(page.getByText("Record Submitted — Job Closed")).toBeVisible();
  });

  test("mobile operator can stage an attachment and submit it with the record @mock", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let submittedPayload = null;
    await mockApi(page, {
      authUsers: [
        { id: TEST_IDS.operatorUserId, name: "Op User", role: "Operator", active: true },
        { id: TEST_IDS.adminUserId, name: "Admin User", role: "Admin", active: true }
      ],
      loginUser: { id: TEST_IDS.operatorUserId, name: "Op User", role: "Operator" },
      jobs: [
        {
          id: "JOB-ATT-100",
          part_id: "1234",
          operation_id: 20,
          lot: "Lot ATT",
          qty: 1,
          status: "open"
        }
      ],
      onRecordSubmit: (payload) => {
        submittedPayload = payload;
      }
    });
    await page.goto("/");
    await loginAsUser(page, { userId: TEST_IDS.operatorUserId, expectedName: "Op User" });

    await page.getByRole("button", { name: "Operator Entry" }).click();
    await page.getByPlaceholder("e.g. J-10042").fill("JOB-ATT-100");
    await page.getByRole("button", { name: "Load Job →" }).click();

    await page.getByTestId("operator-attachment-input").setInputFiles({
      name: "piece-1.png",
      mimeType: "image/png",
      buffer: Buffer.from("mock-image", "utf8")
    });

    await expect(page.getByText("piece-1.png")).toBeVisible();
    await page.getByRole("button", { name: "Submit & Close Job" }).click();

    await expect(page.getByText("Record Submitted — Job Closed")).toBeVisible();
    expect(submittedPayload).not.toBeNull();
    expect(submittedPayload.attachments).toHaveLength(1);
    expect(submittedPayload.attachments[0]).toMatchObject({
      pieceNumber: 1,
      fileName: "piece-1.png",
      mediaType: "image/png"
    });
  });

  test("mobile admin can upload, inspect, and update attachment retention from record detail @mock", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, {
      records: [
        {
          id: 901,
          job_id: "J-REC-9001",
          part_id: "1234",
          operation_id: 20,
          lot: "Lot R",
          qty: 2,
          timestamp: "2026-03-15T12:00:00.000Z",
          operator_user_id: TEST_IDS.adminUserId,
          status: "complete",
          oot: false,
          comment: ""
        }
      ]
    });
    await page.goto("/");
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Records", exact: true }).click();
    await page.locator(".tr-click").filter({ hasText: "J-REC-9001" }).click();

    await expect(page.getByText("Inspection Record — J-REC-9001")).toBeVisible();

    await page.getByTestId("record-attachment-input").setInputFiles({
      name: "after-submit.png",
      mimeType: "image/png",
      buffer: Buffer.from("after-submit", "utf8")
    });

    await expect(page.getByText("after-submit.png")).toBeVisible();

    const attachmentRow = page.locator("tr").filter({ hasText: "after-submit.png" });
    await attachmentRow.getByRole("button", { name: "Inspect" }).click();
    await expect(page.getByText("Payload chars:", { exact: false })).toBeVisible();

    await attachmentRow.getByRole("spinbutton").fill("120");
    await attachmentRow.getByRole("button", { name: "Update" }).click();
    await expect(attachmentRow).toContainText("2026-06-21");
  });

  test("form builder tab renders template list for Admin @mock", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Admin" }).click();
    await page.getByRole("button", { name: "Form Builder" }).click();
    await expect(page.getByRole("button", { name: "+ New Form" })).toBeVisible();
    await expect(page.getByText("Incoming Inspection")).toBeVisible();
    await expect(page.getByText("Final Audit Draft")).toBeVisible();
  });

  test("form builder creates a new form draft via builder canvas @mock", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Admin" }).click();
    await page.getByRole("button", { name: "Form Builder" }).click();
    await page.getByRole("button", { name: "+ New Form" }).click();

    // Builder canvas is now visible
    await expect(page.getByPlaceholder(/e\.g\. Incoming Inspection/)).toBeVisible();
    await page.getByPlaceholder(/e\.g\. Incoming Inspection/).fill("My New Form");

    // Add a field from palette
    await page.getByRole("button", { name: "+ Text" }).click();
    // A field row appears in the canvas
    await expect(page.getByText(/text — no label/i)).toBeVisible();
  });

  test("form builder preview tab shows read-only field rendering @mock", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Admin" }).click();
    await page.getByRole("button", { name: "Form Builder" }).click();
    // Click Preview action on first template
    await page.getByRole("button", { name: "Preview" }).first().click();

    // Preview pane renders — back button confirms FormPreview mounted
    await expect(page.getByRole("button", { name: "← Back" })).toBeVisible();
  });
});

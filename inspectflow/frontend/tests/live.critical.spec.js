import { test, expect } from "@playwright/test";

const API_URL = process.env.PLAYWRIGHT_API_URL || "http://localhost:4000";
const LIVE_ENABLED = ["1", "true", "yes"].includes(String(process.env.PLAYWRIGHT_LIVE || "").toLowerCase());
const DEFAULT_PASSWORD = process.env.INSPECTFLOW_TEST_PASSWORD
  || process.env.INSPECTFLOW_DEFAULT_PASSWORD
  || "inspectflow";

test.skip(!LIVE_ENABLED, "PLAYWRIGHT_LIVE not enabled (set PLAYWRIGHT_LIVE=1 to run live tests).");

test.describe("Live UI critical path @live", () => {
  async function listSelectOptionValues(selectLocator) {
    return selectLocator.locator("option").evaluateAll((options) => options
      .map((option) => option.value)
      .filter((value) => value));
  }

  async function selectPreferredOrFirst(selectLocator, preferredValues, timeoutMs = 10000) {
    await expect.poll(async () => {
      const values = await listSelectOptionValues(selectLocator);
      return values.length;
    }, { timeout: timeoutMs }).toBeGreaterThan(0);
    const values = await listSelectOptionValues(selectLocator);
    const target = preferredValues.find((value) => values.includes(value)) || values[0];
    await selectLocator.selectOption({ value: target });
    return target;
  }

  async function login(page, userLabel) {
    await page.getByLabel("User").selectOption({ label: userLabel });
    await page.getByLabel("Password").fill(DEFAULT_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByText("Manufacturing Inspection System")).toBeVisible();
  }

  async function ensurePartWithOperation(request, partId, opNumber = "020") {
    const partRes = await request.post(`${API_URL}/api/parts`, {
      headers: { "x-user-role": "Admin" },
      data: {
        id: partId,
        description: `UI Live Test ${partId}`,
        revision: "A"
      }
    });
    expect([201, 409]).toContain(partRes.status());

    const opRes = await request.post(`${API_URL}/api/operations`, {
      headers: { "x-user-role": "Admin" },
      data: {
        partId,
        opNumber,
        label: `Live Test Op ${opNumber}`
      }
    });
    expect([201, 409]).toContain(opRes.status());
  }

  test("admin creates job, operator submits measurements, record persists", async ({ page }) => {
    const jobId = `J-UI-${Date.now()}`;
    const lot = `Lot-${Date.now()}`;
    const partId = `UI${Date.now().toString().slice(-8)}`;
    const opNumber = "020";

    await ensurePartWithOperation(page.request, partId, opNumber);

    await page.goto("/");
    await login(page, "S. Admin - Admin");

    await expect(page.locator(".data-chip")).toContainText(/Live Data|Local Demo/);

    await page.getByRole("button", { name: "Admin" }).click();

    const createCard = page.locator(".card").filter({ hasText: "Create New Job" });
    await createCard.getByPlaceholder("J-10045").fill(jobId);

    const partSelect = createCard.locator("div.field:has(label:has-text('Part Number')) select").first();
    await partSelect.selectOption({ value: partId });

    const revSelect = createCard.locator("div.field:has(label:has-text('Revision')) select").first();
    const activeRevision = await revSelect.inputValue();
    if (!activeRevision) {
      await selectPreferredOrFirst(revSelect, ["A"]);
    }

    const opSelect = createCard.locator("div.field:has(label:has-text('Operation')) select").first();
    await selectPreferredOrFirst(opSelect, [opNumber, String(Number(opNumber))]);

    await createCard.getByPlaceholder("e.g. Lot C").fill(lot);
    await createCard.locator("input[placeholder='12']").fill("1");
    await createCard.getByRole("button", { name: /create job/i }).click();
    await expect.poll(async () => {
      const jobsRes = await page.request.get(`${API_URL}/api/jobs?partId=${encodeURIComponent(partId)}`);
      if (!jobsRes.ok()) return false;
      const jobs = await jobsRes.json();
      return jobs.some((job) => job.id === jobId);
    }).toBe(true);

    await page.request.post(`${API_URL}/api/auth/logout`);
    await page.goto("/");
    await login(page, "J. Morris - Operator");

    await page.getByRole("button", { name: "Operator Entry" }).click();
    const jobEntryCard = page.locator(".card").filter({ hasText: "Job Entry" });
    await jobEntryCard.getByPlaceholder("e.g. J-10042").fill(jobId);
    await jobEntryCard.getByRole("button", { name: "Load Job →" }).click();

    await expect(page.getByText("Measurement Entry")).toBeVisible();
    const importCsv = [
      "piece_number,dimension_name,value,is_oot,tool_it_nums,missing_reason,nc_num,details",
      "1,Bore Diameter,0.6250,false,IT-0031,,,",
      "1,Surface Finish,32,false,IT-0063,,,"
    ].join("\n");
    await page.getByPlaceholder("piece_number,dimension_name,value,is_oot,tool_it_nums,missing_reason,nc_num,details").fill(importCsv);
    await page.getByRole("button", { name: "Import & Close Job" }).click();

    await expect(page.getByText("CSV Imported — Job Closed")).toBeVisible();

    const traceRes = await page.request.get(`${API_URL}/api/records/trace?jobId=${encodeURIComponent(jobId)}`);
    expect(traceRes.ok()).toBe(true);
    const traceBody = await traceRes.json();
    expect(Number(traceBody.count || 0)).toBeGreaterThan(0);
    expect(traceBody.records.some((record) => record?.job?.id === jobId)).toBe(true);
  });
});

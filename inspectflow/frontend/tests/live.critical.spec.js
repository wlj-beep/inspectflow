import { test, expect } from "@playwright/test";

const API_URL = process.env.PLAYWRIGHT_API_URL || process.env.VITE_API_URL || "http://127.0.0.1:4000";
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

  test("admin creates job, operator submits measurements, record persists", async ({ page }) => {
    const jobId = `J-UI-${Date.now()}`;
    const lot = `Lot-${Date.now()}`;
    const partId = "1234";

    await page.goto("/");
    await login(page, "S. Admin - Admin");
    const partBaselineRes = await page.request.get(`${API_URL}/api/parts/${partId}`, {
      headers: { "x-user-role": "Admin" }
    });
    expect(partBaselineRes.ok()).toBe(true);

    await expect(page.locator(".data-chip")).toContainText(/Live Data|Local Demo/);

    await page.getByRole("button", { name: "Admin", exact: true }).click();

    const createCard = page.locator(".card").filter({ hasText: "Create New Job" });
    await createCard.getByPlaceholder("J-10045").fill(jobId);

    const partSelect = createCard.locator("div.field:has(label:has-text('Part Number')) select").first();
    const selectedPart = await selectPreferredOrFirst(partSelect, [partId], 20000);
    expect(selectedPart).toBe(partId);

    const revSelect = createCard.locator("div.field:has(label:has-text('Revision')) select").first();
    const activeRevision = await revSelect.inputValue();
    if (!activeRevision) {
      const revisionOptions = await listSelectOptionValues(revSelect);
      if (revisionOptions.length > 0) {
        await selectPreferredOrFirst(revSelect, ["A"], 5000);
      } else {
        await revSelect.evaluate((select) => {
          select.value = "A";
          select.dispatchEvent(new Event("change", { bubbles: true }));
        });
      }
    }

    const opSelect = createCard.locator("div.field:has(label:has-text('Operation')) select").first();
    await selectPreferredOrFirst(opSelect, ["020", "20", "010", "10"], 30000);

    await createCard.getByPlaceholder("e.g. Lot C").fill(lot);
    await createCard.locator("input[placeholder='12']").fill("1");
    await createCard.getByRole("button", { name: /create job/i }).click();
    await expect.poll(async () => {
      const jobsRes = await page.request.get(`${API_URL}/api/jobs?partId=${encodeURIComponent(partId)}`, {
        headers: { "x-user-role": "Admin" }
      });
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

    await expect.poll(async () => {
      const traceRes = await page.request.get(`${API_URL}/api/records/trace?jobId=${encodeURIComponent(jobId)}`, {
        headers: { "x-user-role": "Admin" }
      });
      if (!traceRes.ok()) return 0;
      const traceBody = await traceRes.json();
      return Number(traceBody.count || 0);
    }, { timeout: 20000 }).toBeGreaterThan(0);

    const traceRes = await page.request.get(`${API_URL}/api/records/trace?jobId=${encodeURIComponent(jobId)}`, {
      headers: { "x-user-role": "Admin" }
    });
    expect(traceRes.ok()).toBe(true);
    const traceBody = await traceRes.json();
    expect(traceBody.records.some((record) => record?.job?.id === jobId)).toBe(true);
  });
});

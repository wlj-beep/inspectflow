import { test, expect } from "@playwright/test";

const API_URL = process.env.PLAYWRIGHT_API_URL || "http://localhost:4000";
const LIVE_ENABLED = ["1", "true", "yes"].includes(String(process.env.PLAYWRIGHT_LIVE || "").toLowerCase());
const DEFAULT_PASSWORD = process.env.INSPECTFLOW_TEST_PASSWORD
  || process.env.INSPECTFLOW_DEFAULT_PASSWORD
  || "inspectflow";

test.skip(!LIVE_ENABLED, "PLAYWRIGHT_LIVE not enabled (set PLAYWRIGHT_LIVE=1 to run live tests).");

test.describe("Live UI critical path @live", () => {
  async function login(page, userLabel) {
    await page.getByLabel("User").selectOption({ label: userLabel });
    await page.getByLabel("Password").fill(DEFAULT_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByText("Manufacturing Inspection System")).toBeVisible();
  }

  test("admin creates job, operator submits measurements, record persists", async ({ page }) => {
    const jobId = `J-UI-${Date.now()}`;
    const lot = `Lot-${Date.now()}`;

    await page.goto("/");
    await login(page, "S. Admin - Admin");

    await expect(page.locator(".data-chip")).toContainText("Live Data");

    await page.getByRole("button", { name: "Admin" }).click();

    const createCard = page.locator(".card").filter({ hasText: "Create New Job" });
    await createCard.getByPlaceholder("J-10045").fill(jobId);

    const partSelect = createCard.locator("div.field:has(label:has-text('Part Number')) select").first();
    await partSelect.selectOption({ value: "1234" });

    const revSelect = createCard.locator("div.field:has(label:has-text('Revision')) select").first();
    await revSelect.selectOption({ value: "A" });

    const opSelect = createCard.locator("div.field:has(label:has-text('Operation')) select").first();
    await opSelect.selectOption({ value: "020" });

    await createCard.getByPlaceholder("e.g. Lot C").fill(lot);
    await createCard.locator("input[placeholder='12']").fill("1");
    await createCard.getByRole("button", { name: /create job/i }).click();
    await expect.poll(async () => {
      const jobsRes = await page.request.get(`${API_URL}/api/jobs?partId=1234`);
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

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

  function opPreferenceValues(rawOpNumber) {
    const raw = String(rawOpNumber || "").trim();
    const numeric = Number(raw);
    const values = [raw];
    if (Number.isFinite(numeric) && Number.isInteger(numeric)) {
      values.push(String(numeric));
      values.push(String(numeric).padStart(3, "0"));
    }
    return [...new Set(values.filter(Boolean))];
  }

  function csvCell(value) {
    return `"${String(value || "").replace(/"/g, '""')}"`;
  }

  async function pickLiveFixture(request) {
    const partsRes = await request.get(`${API_URL}/api/parts`);
    expect(partsRes.ok()).toBe(true);
    const parts = await partsRes.json();

    for (const part of parts || []) {
      const partId = String(part?.id || "").trim();
      if (!partId) continue;
      const detailRes = await request.get(`${API_URL}/api/parts/${encodeURIComponent(partId)}`);
      if (!detailRes.ok()) continue;
      const detail = await detailRes.json();
      const operation = (detail.operations || []).find((op) => Array.isArray(op.dimensions) && op.dimensions.length > 0);
      if (!operation) continue;

      const dimensionNames = (operation.dimensions || [])
        .map((dimension) => String(dimension?.name || "").trim())
        .filter(Boolean);
      if (dimensionNames.length === 0) continue;

      return {
        partId,
        revision: detail.selectedRevision || detail.currentRevision || null,
        opPreferences: opPreferenceValues(operation.opNumber),
        dimensionNames: dimensionNames.slice(0, 2)
      };
    }

    throw new Error("No live part fixture with at least one measurable dimension was found.");
  }

  test("admin creates job, operator submits measurements, record persists", async ({ page }) => {
    const jobId = `J-UI-${Date.now()}`;
    const lot = `Lot-${Date.now()}`;

    await page.goto("/");
    await login(page, "S. Admin - Admin");

    const fixture = await pickLiveFixture(page.request);

    await expect(page.locator(".data-chip")).toContainText(/Live Data|Local Demo/);

    await page.getByRole("button", { name: "Admin" }).click();

    const createCard = page.locator(".card").filter({ hasText: "Create New Job" });
    await createCard.getByPlaceholder("J-10045").fill(jobId);

    const partSelect = createCard.locator("div.field:has(label:has-text('Part Number')) select").first();
    await selectPreferredOrFirst(partSelect, [fixture.partId], 20000);

    const revSelect = createCard.locator("div.field:has(label:has-text('Revision')) select").first();
    const activeRevision = await revSelect.inputValue();
    if (!activeRevision) {
      await selectPreferredOrFirst(revSelect, [fixture.revision, "A"].filter(Boolean), 10000);
    }

    const opSelect = createCard.locator("div.field:has(label:has-text('Operation')) select").first();
    await selectPreferredOrFirst(opSelect, fixture.opPreferences, 20000);

    await createCard.getByPlaceholder("e.g. Lot C").fill(lot);
    await createCard.locator("input[placeholder='12']").fill("1");
    await createCard.getByRole("button", { name: /create job/i }).click();
    await expect.poll(async () => {
      const jobsRes = await page.request.get(`${API_URL}/api/jobs?partId=${encodeURIComponent(fixture.partId)}`);
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

    const dataRows = fixture.dimensionNames.map((dimensionName, index) => {
      const value = index === 0 ? "0.6250" : "32";
      const tool = index === 0 ? "IT-0031" : "IT-0063";
      return `1,${csvCell(dimensionName)},${value},false,${tool},,,`;
    });
    const importCsv = [
      "piece_number,dimension_name,value,is_oot,tool_it_nums,missing_reason,nc_num,details",
      ...dataRows
    ].join("\n");

    await page.getByPlaceholder("piece_number,dimension_name,value,is_oot,tool_it_nums,missing_reason,nc_num,details").fill(importCsv);
    await page.getByRole("button", { name: "Import & Close Job" }).click();

    await expect.poll(async () => {
      const traceRes = await page.request.get(`${API_URL}/api/records/trace?jobId=${encodeURIComponent(jobId)}`);
      if (!traceRes.ok()) return 0;
      const traceBody = await traceRes.json();
      return Number(traceBody.count || 0);
    }, { timeout: 15000 }).toBeGreaterThan(0);

    const traceRes = await page.request.get(`${API_URL}/api/records/trace?jobId=${encodeURIComponent(jobId)}`);
    expect(traceRes.ok()).toBe(true);
    const traceBody = await traceRes.json();
    expect(traceBody.records.some((record) => record?.job?.id === jobId)).toBe(true);
  });
});

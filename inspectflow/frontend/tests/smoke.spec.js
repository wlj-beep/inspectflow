import { test, expect } from "@playwright/test";

test("loads the InspectFlow shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("InspectFlow", { exact: false })).toBeVisible();
});

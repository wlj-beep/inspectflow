import { expect } from "@playwright/test";
import { TEST_IDS } from "./defaults.js";

export async function loginAsAdmin(page) {
  await loginAsUser(page, { userId: TEST_IDS.adminUserId, expectedName: "Admin User" });
}

async function waitForLoginSurface(page) {
  await Promise.race([
    page.getByTestId("authenticated-user").waitFor({ state: "attached", timeout: 5000 }).catch(() => null),
    page.locator("select").first().waitFor({ state: "attached", timeout: 5000 }).catch(() => null),
    page.locator('input[type="password"]').first().waitFor({ state: "attached", timeout: 5000 }).catch(() => null)
  ]);
}

export async function loginAsUser(page, { userId, expectedName, password = "inspectflow" }) {
  const authBadge = page.getByTestId("authenticated-user");
  await waitForLoginSurface(page);
  if (await authBadge.count().catch(() => 0)) {
    const currentText = await authBadge.textContent().catch(() => "");
    if (String(currentText || "").includes(expectedName)) {
      return;
    }
    const signOutButton = page.getByRole("button", { name: /sign out/i });
    if (await signOutButton.isVisible().catch(() => false)) {
      await signOutButton.click();
      await page.locator("select").first().waitFor({ state: "visible", timeout: 15000 });
    }
  }
  const userSelect = page.locator("select").first();
  await userSelect.waitFor({ state: "attached", timeout: 15000 });
  await expect(userSelect).toBeVisible();
  await expect(page.locator(`select option[value="${String(userId)}"]`)).toHaveCount(1, { timeout: 15000 });
  await userSelect.selectOption(String(userId));
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByTestId("authenticated-user")).toContainText(expectedName);
}

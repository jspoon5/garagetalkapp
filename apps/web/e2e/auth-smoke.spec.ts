import { test, expect } from "@playwright/test";

const password = "correct-horse-battery-staple";
const email = `e2e-${Date.now()}@example.com`;
const username = `e2euser${Date.now().toString().slice(-6)}`;

test.describe("auth smoke", () => {
  test("signup → profile → export → deletion", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("nav-profile").click();
    await page.getByTestId("auth-switch-register").click();

    await page.getByTestId("auth-email").fill(email);
    await page.getByTestId("auth-username").fill(username);
    await page.getByTestId("auth-password").fill(password);
    await page.getByTestId("auth-register").click();

    await expect(page.getByText(`Signed in as ${username}`)).toBeVisible();

    await page.getByTestId("profile-bio").fill("wrench life");
    await page.getByTestId("profile-city").fill("Detroit");
    await page.getByTestId("profile-save").click();

    await page.getByTestId("export-data").click();
    await expect(page.getByTestId("export-output")).toContainText(email);

    await page.getByTestId("delete-account").click();
    await expect(page.getByTestId("auth-username")).toBeVisible();
    await expect(page.getByTestId("auth-login")).toBeVisible();
  });
});

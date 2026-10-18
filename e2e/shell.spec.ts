import { expect, test } from "@playwright/test";

test("home page loads and shows the app name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Bonnetje" })).toBeVisible();
});

import { expect, test } from "@playwright/test";

test("home lists the three seed jobs by amount and shows the total", async ({ page }) => {
  await page.goto("/");

  const cards = page.locator("a.job-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText("M. Jansen");
  await expect(cards.nth(0)).toContainText("€674.24");
  await expect(cards.nth(1)).toContainText("Fam. de Vries");
  await expect(cards.nth(1)).toContainText("€418.91");
  await expect(cards.nth(2)).toContainText("Bakker & Zn");
  await expect(cards.nth(2)).toContainText("€160.06");

  const total = page.getByRole("region", { name: "Not invoiced yet" });
  await expect(total).toContainText("€1253.21");
  await expect(total).toContainText("excl. VAT");
});

test("home tiles link to stock and expenses", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Stock/ })).toContainText("4 items · €46.30");
  await page.getByRole("link", { name: /Expenses/ }).click();
  await expect(page.getByRole("heading", { name: "Expenses & VAT" })).toBeVisible();
});

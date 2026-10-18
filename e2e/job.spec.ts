import { expect, test } from "@playwright/test";

test("job page shows what is to invoice", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Fam\. de Vries/ }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Fam. de Vries" })).toBeVisible();
  const card = page.getByRole("region", { name: "To invoice" });
  await expect(card).toContainText("€418.91");
  await expect(card).toContainText("Materials €38.18 · markup €5.73 · labour €375.00");

  // the Gamma receipt folds open to show its items
  const gamma = page.getByRole("button", { name: /Gamma/ });
  await expect(gamma).toHaveAttribute("aria-expanded", "false");
  await gamma.click();
  await expect(gamma).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Washbasin tap")).toBeVisible();
});

test("create a job, log two hours, see To invoice update", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "New job" }).click();

  // validation shows red text, not an alert dialog
  await page.getByRole("button", { name: "Create job" }).click();
  await expect(page.getByText("Fill in a client.")).toBeVisible();

  await page.getByLabel("Client").fill("Fam. Peters");
  await page.getByLabel("What's the job?").fill("Leaking tap");
  await page.getByRole("button", { name: "Hourly" }).click();
  await page.getByLabel("Rate per hour").fill("62,50");
  await page.getByRole("button", { name: "Create job" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Fam. Peters" })).toBeVisible();
  const card = page.getByRole("region", { name: "To invoice" });
  await expect(card).toContainText("€0.00");
  await expect(page.getByText("No time logged yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Nothing to invoice yet" })).toBeDisabled();

  await page.getByRole("button", { name: /No time logged yet/ }).click();
  const sheet = page.getByRole("dialog", { name: "Labour" });
  await expect(sheet).toBeFocused();
  for (let i = 0; i < 4; i++) await sheet.getByRole("button", { name: "Add half an hour" }).click();
  await expect(sheet.getByTestId("labour-qty")).toHaveText("2 h");
  await expect(sheet.getByTestId("labour-amount")).toHaveText("€125.00");

  // a bad rate is flagged and blocks saving
  await sheet.getByLabel("Rate per hour").fill("abc");
  await expect(sheet.getByRole("alert")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Save" })).toBeDisabled();
  await sheet.getByLabel("Rate per hour").fill("62.50");

  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
  await expect(card).toContainText("€125.00");
  await expect(page.getByText("2 h × €62.50")).toBeVisible();

  await page.getByRole("link", { name: "Back to jobs" }).click();
  await expect(page.getByRole("link", { name: /Fam\. Peters/ })).toContainText("€125.00");
  await expect(page.getByRole("link", { name: /Fam\. Peters/ })).toContainText("to invoice");
});

test("labour sheet closes on Escape and keeps each mode's own amount", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Bakker/ }).click();
  await page.getByRole("button", { name: /No time logged yet/ }).click();
  const sheet = page.getByRole("dialog", { name: "Labour" });
  await sheet.getByRole("button", { name: "Day rate" }).click();
  await expect(sheet.getByLabel("Rate per day")).toHaveValue("450.00");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

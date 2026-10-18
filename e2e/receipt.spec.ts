import { expect, test, type Page } from "@playwright/test";

/** Home -> Add receipt -> the Technische Unie sample from 18 Oct (cable 100 m, sockets, junction boxes). */
async function openTechnischeUnie(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "Add receipt" }).click();
  await expect(page.getByRole("heading", { name: "Add a receipt" })).toBeVisible();
  await page.getByRole("button", { name: /Technische Unie.*18 Oct/ }).click();
  await expect(page.getByRole("heading", { name: "Where did it go?" })).toBeVisible();
}

test("add receipt shows the capture options as not available yet", async ({ page }) => {
  await page.goto("/receipts/new");
  for (const name of [/Take a photo/, /Choose from your photos/, /Upload a PDF/]) {
    await expect(page.getByRole("button", { name })).toBeDisabled();
  }
  await expect(page.getByText("Reading receipts is coming in the next step")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Try a sample receipt" })).toBeVisible();
});

test("split a receipt over two jobs and keep the rest in stock", async ({ page }) => {
  await openTechnischeUnie(page);
  await expect(page.getByRole("heading", { name: /Still to place · 3/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "3 items still need a place" })).toBeDisabled();

  await page.getByRole("button", { name: /Installation cable/ }).click();
  const sheet = page.getByRole("dialog", { name: /Installation cable/ });
  await expect(sheet).toContainText("Total 100 m · €89.00");

  await sheet.getByRole("button", { name: "+ de Vries" }).click();
  await sheet.getByLabel("Amount for Fam. de Vries").fill("30");
  await sheet.getByRole("button", { name: "+ Bakker" }).click();
  await sheet.getByLabel("Amount for Bakker & Zn").fill("20");
  await expect(sheet.getByTestId("equiv-0")).toHaveText("= €26.70");
  await expect(sheet.getByTestId("equiv-1")).toHaveText("= €17.80");
  await expect(sheet.getByTestId("left-text")).toHaveText("Left over: 50 m · €44.50");
  await expect(sheet.getByRole("button", { name: "Stock" })).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toBeHidden();

  await expect(page.getByRole("heading", { name: /Placed · 1/ })).toBeVisible();
  await expect(page.getByText("30 m → de Vries · 20 m → Bakker · 50 m → stock")).toBeVisible();

  for (const item of [/Flush socket/, /Junction boxes/]) {
    await page.getByRole("button", { name: item }).click();
    const s = page.getByRole("dialog", { name: item });
    await s.getByRole("button", { name: "+ Bakker" }).click();
    await s.getByRole("button", { name: "Done" }).click();
  }

  await expect(page.getByRole("button", { name: "Save receipt" })).toBeEnabled();
  const summary = page.getByLabel("Summary");
  await expect(summary).toContainText("To Fam. de Vries€26.70");
  await expect(summary).toContainText("Into stock€44.50");
  await page.getByRole("button", { name: "Save receipt" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Fam. de Vries" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Saved:");
  const entry = page.getByRole("button", { name: /Technische Unie/ });
  await expect(entry).toContainText("€26.70");
  await entry.click();
  await expect(page.getByText("Installation cable 3×2.5 mm², 100 m")).toBeVisible();
});

test("assigning more than the line shows Too much and blocks Done", async ({ page }) => {
  await openTechnischeUnie(page);
  await page.getByRole("button", { name: /Installation cable/ }).click();
  const sheet = page.getByRole("dialog", { name: /Installation cable/ });
  await sheet.getByRole("button", { name: "+ de Vries" }).click();
  await sheet.getByLabel("Amount for Fam. de Vries").fill("110");
  await expect(sheet.getByTestId("left-text")).toHaveText("Too much: 10 m over");
  await expect(sheet.getByTestId("left-text")).toHaveCSS("color", "rgb(185, 28, 28)");
  await expect(sheet.getByRole("button", { name: "Done" })).toBeDisabled();

  // closing leaves the tile marked, not placed
  await page.keyboard.press("Escape");
  await expect(page.getByText("Too much assigned, fix it")).toBeVisible();
  await expect(page.getByRole("button", { name: /Fix items with too much assigned/ })).toBeDisabled();

  await page.getByRole("button", { name: /Installation cable/ }).click();
  await sheet.getByLabel("Amount for Fam. de Vries").fill("100");
  await expect(sheet.getByTestId("left-text")).toHaveText("Nothing left over");
  await expect(sheet.getByRole("button", { name: "Done" })).toBeEnabled();
});

test("put everything on one job enables Save", async ({ page }) => {
  await openTechnischeUnie(page);
  await expect(page.getByRole("button", { name: /still need a place/ })).toBeDisabled();
  await page.getByRole("button", { name: "Put everything on one job" }).click();
  const sheet = page.getByRole("dialog", { name: "Put everything on one job" });
  await sheet.getByRole("button", { name: /Bakker/ }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("heading", { name: /Placed · 3/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save receipt" })).toBeEnabled();
});

test("a line without a count is split by part or euros", async ({ page }) => {
  await page.goto("/receipts/new");
  await page.getByRole("button", { name: /Praxis/ }).click();
  await page.getByRole("button", { name: /Screws, assorted box/ }).click();
  const sheet = page.getByRole("dialog", { name: /Screws/ });
  await expect(sheet.getByRole("button", { name: "Part" })).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: "+ Jansen" }).click();
  await sheet.getByLabel("Amount for M. Jansen").fill("0,25");
  await expect(sheet.getByTestId("equiv-0")).toHaveText("= €3.24");
  await sheet.getByRole("button", { name: "€ Euros" }).click();
  await expect(sheet.getByLabel("Euros for M. Jansen")).toHaveValue("3.24");
});

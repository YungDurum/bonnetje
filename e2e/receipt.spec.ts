import { expect, test, type Page } from "@playwright/test";

/** Home -> Add receipt -> the Technische Unie sample from 18 Oct (cable 100 m, sockets, junction boxes). */
async function openTechnischeUnie(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "Add receipt" }).click();
  await expect(page.getByRole("heading", { name: "Add a receipt" })).toBeVisible();
  await page.getByRole("button", { name: /Technische Unie.*18 Oct/ }).click();
  await expect(page.getByRole("heading", { name: "Where did it go?" })).toBeVisible();
}

/** Pick a file with one of the capture buttons. The e2e server's fake reader answers from samples/<name>.expected.json. */
async function pickFile(page: Page, button: RegExp, file: string) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: button }).click();
  await (await chooser).setFiles(`samples/${file}`);
}

test("a photo is read and opens Where did it go?", async ({ page }) => {
  await page.goto("/receipts/new");
  await expect(page.getByRole("heading", { name: "Try a sample receipt" })).toBeVisible();
  // hold the upload a moment so the Reading screen can be seen
  await page.route("**/api/receipts/read", async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  await pickFile(page, /Take a photo/, "01-bouwmarkt-tegels.jpg");
  const reading = page.getByRole("dialog", { name: "Reading photo" });
  await expect(reading.getByRole("status")).toHaveText("Reading receipt…");

  await expect(page.getByRole("heading", { name: "Where did it go?" })).toBeVisible();
  await expect(page.getByText(/Klushuis Amersfoort · €109\.82/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Still to place · 4/ })).toBeVisible();
  await expect(page.getByText("TEGELLIJM 25KG · 25 kg")).toBeVisible();
  await expect(page.locator(".notice-error")).toHaveCount(0);
});

test("a PDF invoice is read", async ({ page }) => {
  await page.goto("/receipts/new");
  await pickFile(page, /Upload a PDF/, "02-groothandel-elektra.pdf");
  await expect(page.getByRole("heading", { name: "Where did it go?" })).toBeVisible();
  await expect(page.getByText(/Elektrogroothandel Van Dijk B\.V\. · €120\.45/)).toBeVisible();
});

test("something that isn't a receipt shows an error with Pick another file", async ({ page }) => {
  await page.goto("/receipts/new");
  await pickFile(page, /Choose from your photos/, "08-geen-bon.png");
  const alert = page.getByRole("alert").filter({ hasText: /\S/ });
  await expect(alert).toContainText("This doesn't look like a receipt with items on it.");
  await expect(alert).toHaveCSS("color", "rgb(185, 28, 28)");
  await expect(alert.getByRole("button", { name: "Try again" })).toHaveCount(0);

  await pickFile(page, /Pick another file/, "01-bouwmarkt-tegels.jpg");
  await expect(page.getByRole("heading", { name: "Where did it go?" })).toBeVisible();
});

test("a receipt that doesn't add up is fixed on Check receipt, then can be saved", async ({ page }) => {
  await page.goto("/receipts/new");
  await pickFile(page, /Choose from your photos/, "06-gevouwen-bon.jpg");
  await expect(page.getByRole("heading", { name: "Where did it go?" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Check this receipt first." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check this receipt first" })).toBeDisabled();

  await page.getByRole("button", { name: "Check receipt" }).click();
  const sheet = page.getByRole("dialog", { name: "Check receipt" });
  await expect(sheet.getByRole("img", { name: "The receipt photo" })).toBeVisible();
  await expect(sheet.getByTestId("adds-up")).toHaveText("Items add up to €71.66 · receipt says €82.65");
  await expect(sheet.getByTestId("adds-up")).toHaveCSS("color", "rgb(185, 28, 28)");
  await expect(sheet.getByRole("button", { name: "Items don't add up yet" })).toBeDisabled();

  // the screws were under the fold: add them (the amount starts at the difference)
  await sheet.getByRole("button", { name: "Add a missed item" }).click();
  await expect(sheet.getByLabel("Amount of item 3")).toHaveValue("10.99");
  await sheet.getByLabel("Name of item 3").fill("Drywall screws 500 pcs");
  await expect(sheet.getByTestId("adds-up")).toHaveText("Items add up to €82.65 · receipt says €82.65");
  await expect(sheet.getByTestId("adds-up")).toHaveCSS("color", "rgb(21, 128, 61)");
  await sheet.getByRole("button", { name: "Save changes" }).click();

  await expect(sheet).toBeHidden();
  await expect(page.getByText("Check this receipt first.")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Still to place · 3/ })).toBeVisible();
  await page.getByRole("button", { name: "Put everything on one job" }).click();
  await page.getByRole("dialog", { name: "Put everything on one job" }).getByRole("button", { name: /Bakker/ }).click();
  await expect(page.getByRole("button", { name: "Save receipt" })).toBeEnabled();
});

test("Check receipt flags a bad amount and keeps Save off", async ({ page }) => {
  await page.goto("/receipts/new");
  await pickFile(page, /Choose from your photos/, "06-gevouwen-bon.jpg");
  await page.getByRole("button", { name: "Check receipt" }).click();
  const sheet = page.getByRole("dialog", { name: "Check receipt" });
  await sheet.getByLabel("Amount of item 1").fill("abc");
  await expect(sheet.getByText("Type an amount like 12,95.")).toBeVisible();
  // fixing the total instead: 53.70 + 17.96 = 71.66
  await sheet.getByLabel("Amount of item 1").fill("53,70");
  await sheet.getByRole("textbox", { name: "Receipt total" }).fill("71,66");
  await expect(sheet.getByRole("button", { name: "Save changes" })).toBeEnabled();
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

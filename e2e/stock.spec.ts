import { expect, test, type Page } from "@playwright/test";

// Specs share one database and run in file order, so earlier specs may have added to stock or to
// de Vries' job. Everything below is relative to what the page shows, never to the seed totals.

const cents = (text: string) => Math.round(Number(text.replace(/[^0-9.]/g, "")) * 100);

async function openStock(page: Page) {
  await page.goto("/stock");
  await expect(page.getByRole("heading", { level: 1, name: "Stock" })).toBeVisible();
}

test("stock lists the seed items and search filters them", async ({ page }) => {
  await openStock(page);
  for (const name of ["PVC pipe 32 mm", "Primer, white", "Copper elbows 15 mm", "Sanitary silicone, white"]) {
    await expect(page.getByRole("button", { name: new RegExp(name) })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: /PVC pipe 32 mm/ })).toContainText("2 of 4 m left · Wasco");
  await expect(page.getByRole("button", { name: /PVC pipe 32 mm/ })).toContainText("€6.20");

  await page.screenshot({ path: "/tmp/claude-0/-home-user/6fdf0b5f-b457-50fa-adc2-ce5741a2c04d/scratchpad/stock.png" });

  await page.getByRole("searchbox", { name: "Search stock" }).fill("copper");
  await expect(page).toHaveURL(/q=copper/);
  await expect(page.locator(".stock-row")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Copper elbows 15 mm/ })).toBeVisible();

  await page.getByRole("searchbox", { name: "Search stock" }).fill("zzz");
  await expect(page.getByText("Nothing matches your search.")).toBeVisible();
});

test("use half of a stock item on a job", async ({ page }) => {
  // To invoice on the job before
  await page.goto("/");
  await page.getByRole("link", { name: /Fam\. de Vries/ }).click();
  const card = page.getByRole("region", { name: "To invoice" });
  const before = (await card.innerText()).match(/Materials (€[\d.]+) · markup (€[\d.]+) · labour (€[\d.]+)/)!;
  const [materials, labour] = [cents(before[1]), cents(before[3])];
  const jobUrl = page.url();

  await openStock(page);
  await page.getByRole("button", { name: /PVC pipe 32 mm/ }).click();
  const sheet = page.getByRole("dialog", { name: "Stock item" });
  await expect(sheet).toContainText("2 of 4 m left · €6.20 · from Wasco");
  await sheet.getByRole("button", { name: "de Vries", exact: true }).click();
  await expect(sheet.getByText("How much did you use?")).toBeVisible();
  await sheet.getByRole("button", { name: "½ of it" }).click();
  await expect(sheet.getByTestId("rest-text")).toHaveText("Stays in stock: 1 m · €3.10");
  await expect(sheet.getByTestId("use-cents")).toHaveText("€3.10");
  await page.screenshot({ path: "/tmp/claude-0/-home-user/6fdf0b5f-b457-50fa-adc2-ce5741a2c04d/scratchpad/stock-use.png" });

  // too much is red and blocks
  await sheet.getByLabel("Amount to use").fill("3");
  await expect(sheet.getByTestId("rest-text")).toHaveText("You only have 2 m in stock");
  await expect(sheet.getByTestId("rest-text")).toHaveCSS("color", "rgb(185, 28, 28)");
  await expect(sheet.getByRole("button", { name: "More than you have" })).toBeDisabled();
  await sheet.getByRole("button", { name: "½ of it" }).click();

  await sheet.getByRole("button", { name: "Put on Fam. de Vries" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("status")).toHaveText("PVC pipe 32 mm (1 m) put on Fam. de Vries");
  await expect(page.getByRole("button", { name: /PVC pipe 32 mm/ })).toContainText("1 of 4 m left");
  await expect(page.getByRole("button", { name: /PVC pipe 32 mm/ })).toContainText("€3.10");

  // the job: new "Stock" entry of €3.10, To invoice recomputed (3.10 / 1.21 = 2.56 excl. VAT, markup 15%)
  await page.goto(jobUrl);
  const entry = page.getByText("From stock").first().locator("xpath=ancestor::div[contains(@class,'row-head')]");
  await expect(entry).toContainText("PVC pipe 32 mm");
  await expect(entry).toContainText("€3.10");
  const newMaterials = materials + 256;
  const markup = Math.round(newMaterials * 0.15);
  const total = newMaterials + markup + labour;
  const euro = (c: number) => `€${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
  await expect(card).toContainText(euro(total));
  await expect(card).toContainText(`Materials ${euro(newMaterials)} · markup ${euro(markup)}`);
});

test("add to stock, then remove it", async ({ page }) => {
  await openStock(page);
  await page.getByRole("button", { name: "Add to stock" }).click();
  const sheet = page.getByRole("dialog", { name: "Add to stock" });
  await expect(sheet.getByRole("button", { name: "Fill in a name, amount and value" })).toBeDisabled();
  await expect(sheet).toContainText("For things you already had in stock. Bought it new? Add the receipt instead");
  await page.screenshot({ path: "/tmp/claude-0/-home-user/6fdf0b5f-b457-50fa-adc2-ce5741a2c04d/scratchpad/add-stock.png" });
  await sheet.getByLabel("What is it?").fill("Copper elbows 22 mm");
  await sheet.getByLabel("How much?").fill("10");
  await sheet.getByRole("button", { name: "pcs" }).click();
  await sheet.getByLabel("Value incl. VAT").fill("12,00");
  await sheet.getByRole("button", { name: "Add to stock", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("status")).toHaveText("Copper elbows 22 mm added to stock");

  const first = page.locator(".stock-row").first();
  await expect(first).toContainText("Copper elbows 22 mm");
  await expect(first).toContainText("10 pcs left · Added manually");
  await expect(first).toContainText("€12.00");

  await first.click();
  const item = page.getByRole("dialog", { name: "Stock item" });
  await item.getByRole("button", { name: "Remove from stock" }).click();
  await expect(item).toContainText("Remove from stock? Used up or thrown away. It is not billed");
  await item.getByRole("button", { name: "Keep" }).click();
  await expect(item.getByRole("button", { name: "Remove from stock" })).toBeVisible();
  await item.getByRole("button", { name: "Remove from stock" }).click();
  await item.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(item).toBeHidden();
  await expect(page.getByRole("status")).toHaveText("Copper elbows 22 mm removed from stock");
  await expect(page.getByRole("button", { name: /Copper elbows 22 mm/ })).toHaveCount(0);
});

test("add material on a job: manually, then from stock", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Bakker/ }).click();
  await expect(page.getByText("Adding materials is coming in a later step.")).toHaveCount(0);

  await page.getByRole("button", { name: "Add material" }).click();
  const sheet = page.getByRole("dialog", { name: "Add material" });
  await expect(sheet.getByRole("link", { name: /Scan a receipt/ })).toHaveAttribute("href", "/receipts/new");
  await expect(sheet).toContainText("Something without a receipt");
  await page.screenshot({ path: "/tmp/claude-0/-home-user/6fdf0b5f-b457-50fa-adc2-ce5741a2c04d/scratchpad/add-material.png" });

  await sheet.getByRole("button", { name: /Add manually/ }).click();
  await expect(sheet.getByRole("button", { name: "Fill in a name and price" })).toBeDisabled();
  await sheet.getByLabel("What is it?").fill("Teflon tape");
  await sheet.getByLabel("Price each, incl. VAT").fill("1,99");
  await sheet.getByLabel("Quantity").fill("3");
  await expect(sheet.getByTestId("manual-total")).toHaveText("€5.97");
  await page.screenshot({ path: "/tmp/claude-0/-home-user/6fdf0b5f-b457-50fa-adc2-ce5741a2c04d/scratchpad/manual.png" });
  await sheet.getByRole("button", { name: /^Add to Bakker/ }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("status")).toHaveText("Teflon tape added to Bakker & Zn");
  const manual = page.getByText("Added manually").first().locator("xpath=ancestor::div[contains(@class,'row-head')]");
  await expect(manual).toContainText("Teflon tape");
  await expect(manual).toContainText("€5.97");

  // from stock: all of the copper elbows
  await page.getByRole("button", { name: "Add material" }).click();
  await sheet.getByRole("button", { name: /From stock/ }).click();
  await sheet.getByRole("button", { name: "Use Copper elbows 15 mm on Bakker & Zn" }).click();
  await expect(sheet).toContainText("In stock: 12 pcs · €14.40");
  await sheet.getByRole("button", { name: "All" }).click();
  await expect(sheet.getByTestId("rest-text")).toHaveText("Nothing left in stock after this");
  await sheet.getByRole("button", { name: "Back" }).click();
  await expect(sheet.getByRole("heading", { name: "From stock" })).toBeVisible();
  await sheet.getByRole("button", { name: "Use Copper elbows 15 mm on Bakker & Zn" }).click();
  await sheet.getByRole("button", { name: "Add to Bakker & Zn" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("status")).toContainText("Copper elbows 15 mm (12 pcs) added from stock");
  await expect(page.getByText("From stock").first()).toBeVisible();

  await openStock(page);
  await expect(page.getByRole("button", { name: /Copper elbows 15 mm/ })).toHaveCount(0);
});

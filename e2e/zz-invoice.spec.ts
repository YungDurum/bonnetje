// Runs last (file order): it invoices M. Jansen, which changes what the other specs would see.
import { expect, test } from "@playwright/test";

test("preview the invoice, send it to Moneybird, and the job shows as invoiced", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /M\. Jansen/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "M. Jansen" })).toBeVisible();
  const card = page.getByRole("region", { name: "To invoice" });
  const cardText = (await card.innerText()).replace(/\s+/g, " ");
  const euros = [...cardText.matchAll(/€(\d+)\.(\d{2})/g)].map((m) => Number(m[1]) * 100 + Number(m[2]));
  const toInvoice = euros[0];
  expect(toInvoice).toBeGreaterThan(0);

  await page.getByRole("link", { name: /Create invoice/ }).click();
  await expect(page.getByRole("heading", { name: "Invoice preview" })).toBeVisible();
  const sheet = page.getByRole("article", { name: "Invoice" });
  await expect(sheet).toContainText("Draft");
  await expect(sheet).toContainText("Bill to");
  await expect(sheet).toContainText("M. Jansen");
  await expect(sheet).toContainText("Labour, 4.5 h × €62.50");
  await expect(sheet).toContainText("Material lines are shown excl. VAT. Payment within 14 days.");

  const amount = async (label: string) => {
    const t = await sheet.locator(".invoice-row", { has: page.getByText(label, { exact: true }) }).locator(".amount").innerText();
    const m = /€(\d+)\.(\d{2})/.exec(t)!;
    return Number(m[1]) * 100 + Number(m[2]);
  };
  const subtotal = await amount("Subtotal excl. VAT");
  const vat = await amount("VAT 21%");
  const total = await amount("Total");
  expect(subtotal).toBe(toInvoice);
  expect(vat).toBe(Math.round(subtotal * 0.21));
  expect(total).toBe(subtotal + vat);
  await page.screenshot({ path: "/tmp/claude-0/-home-user/6fdf0b5f-b457-50fa-adc2-ce5741a2c04d/scratchpad/invoice.png", fullPage: true });

  await page.getByRole("button", { name: "Send to Moneybird" }).click();
  await expect(page.getByText("Invoice for M. Jansen is in Moneybird")).toBeVisible();
  await page.screenshot({ path: "/tmp/claude-0/-home-user/6fdf0b5f-b457-50fa-adc2-ce5741a2c04d/scratchpad/invoice-sent.png", fullPage: true });

  await page.getByRole("link", { name: "Back to jobs" }).click();
  await expect(page.getByRole("link", { name: /M\. Jansen/ })).toContainText("Invoiced");

  await page.getByRole("link", { name: /M\. Jansen/ }).click();
  await expect(page.getByRole("button", { name: /Already invoiced/ })).toBeVisible();
  await expect(page.getByText("No time logged yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Nothing to invoice yet" })).toBeDisabled();
  await page.screenshot({ path: "/tmp/claude-0/-home-user/6fdf0b5f-b457-50fa-adc2-ce5741a2c04d/scratchpad/job-invoiced.png", fullPage: true });
});

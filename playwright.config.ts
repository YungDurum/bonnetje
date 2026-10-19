import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// The sandbox ships a preinstalled Chromium whose build may differ from the one
// this Playwright version expects. Use it when PLAYWRIGHT_CHROMIUM_PATH is set,
// or when the sandbox path exists; otherwise Playwright uses its own browser.
const sandboxChromium = "/opt/pw-browsers/chromium";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (existsSync(sandboxChromium) ? sandboxChromium : undefined);

export default defineConfig({
  testDir: "./e2e",
  // One shared in-memory database behind the dev server: run the files one after another.
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    viewport: { width: 390, height: 844 },
    browserName: "chromium",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [{ name: "mobile-chromium" }],
  webServer: {
    command: "npx next dev -p 3100",
    url: "http://localhost:3100",
    // Fresh seeded in-memory database on every run; receipts are "read" from samples/*.expected.json.
    env: { BONNETJE_DB: "memory", BONNETJE_READER: "fake", BONNETJE_FAKE_MONEYBIRD: "1" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

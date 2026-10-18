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
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    viewport: { width: 390, height: 844 },
    browserName: "chromium",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [{ name: "mobile-chromium" }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

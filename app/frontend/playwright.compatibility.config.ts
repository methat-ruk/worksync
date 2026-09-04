import { defineConfig, devices } from "@playwright/test";
import { playwrightReporting } from "./scripts/playwright-reporting.mjs";

export default defineConfig({
  testDir: "./test/compatibility",
  // Keep each browser project's tests serial so one engine instance cannot
  // exhaust the software renderer while the three projects still run together.
  fullyParallel: false,
  workers: 3,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  ...playwrightReporting("compatibility"),
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "off",
    trace: "off",
    video: "off"
  },
  projects: [
    {
      name: "chromium-compatibility",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "firefox-compatibility",
      use: { ...devices["Desktop Firefox"] }
    },
    {
      name: "webkit-compatibility",
      use: { ...devices["Desktop Safari"] }
    }
  ]
});

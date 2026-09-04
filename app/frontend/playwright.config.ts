import { defineConfig, devices } from "@playwright/test";
import { playwrightReporting } from "./scripts/playwright-reporting.mjs";

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  ...playwrightReporting("mocked"),
  use: {
    baseURL: "http://localhost:3000",
    trace: "off"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});

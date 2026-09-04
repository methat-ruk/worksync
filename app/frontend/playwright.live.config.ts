import { defineConfig, devices } from "@playwright/test";
import { playwrightReporting } from "./scripts/playwright-reporting.mjs";

export default defineConfig({
  testDir: "./test/live-e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  ...playwrightReporting("live"),
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "off",
    trace: "off",
    video: "off"
  },
  projects: [
    {
      name: "chromium-live",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});

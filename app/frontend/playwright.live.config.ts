import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test/live-e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
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

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test/compatibility",
  fullyParallel: true,
  workers: 3,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
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

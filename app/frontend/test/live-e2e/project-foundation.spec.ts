import { expect, test } from "@playwright/test";

const apiBaseUrl = "http://localhost:4000";

test("creates a workspace and project through the real application boundary", async ({
  browser
}) => {
  const context = await browser.newContext();
  const consoleErrors: string[] = [];
  const projectStatuses: number[] = [];
  const runId = `${Date.now()}`;
  try {
    const signup = await context.request.post(`${apiBaseUrl}/api/auth/signup`, {
      data: {
        displayName: `Project Live ${runId}`,
        email: `project-live-${runId}@example.com`,
        password: "correct horse battery staple"
      }
    });
    expect(signup.status()).toBe(201);

    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("response", (response) => {
      if (response.url().includes("/projects")) {
        projectStatuses.push(response.status());
      }
    });

    await page.goto("/app");
    await expect(page.getByText("Create your first workspace")).toBeVisible({
      timeout: 20_000
    });
    await page.getByLabel("Workspace name").fill(`Project Live ${runId}`);
    await page.getByRole("button", { name: "Create workspace" }).click();

    await expect(page.getByText("No projects in this workspace")).toBeVisible({
      timeout: 20_000
    });
    await page.getByLabel("Project name").fill("WorkSync Live");
    await page.getByLabel("Project key").fill("wslive");
    await page.getByRole("button", { name: "Create project" }).click();

    await expect(page.getByText("WorkSync Live is ready.")).toBeVisible();
    await expect(page.getByText("WSLIVE")).toBeVisible();
    await expect(page.getByText("1 total").last()).toBeVisible();

    await page.reload();
    await expect(page.getByText("WorkSync Live")).toBeVisible({
      timeout: 20_000
    });
    await expect(page.getByText("WSLIVE")).toBeVisible();
    expect(projectStatuses).toContain(200);
    expect(projectStatuses).toContain(201);
    expect(
      projectStatuses.filter((status) => status === 200).length
    ).toBeGreaterThanOrEqual(2);
    expect(consoleErrors).toEqual([]);
  } finally {
    await context.close();
  }
});

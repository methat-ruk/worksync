import { expect, test } from "@playwright/test";

const apiBaseUrl = "http://localhost:4000";

test("creates a workspace, project, and task through the real application boundary", async ({
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
    await expect(page.getByText("No matching tasks")).toBeVisible();

    await page.getByRole("button", { name: "Create task" }).click();
    const taskDialog = page.getByRole("dialog");
    await taskDialog.getByLabel("Title").fill("Live task workflow");
    await taskDialog
      .getByLabel("Description")
      .fill("Created through the real browser and API boundary.");
    await taskDialog
      .getByLabel("Due date")
      .fill("2026-08-07T10:00");
    const assigneeSearch = taskDialog.getByRole("combobox", {
      name: "Assignee"
    });
    await assigneeSearch.fill(`Project Live ${runId}`);
    await taskDialog
      .getByRole("option", { name: new RegExp(`Project Live ${runId}`) })
      .click();
    await taskDialog.getByRole("button", { name: "Create task" }).click();

    await expect(page.getByText("Live task workflow")).toBeVisible({
      timeout: 20_000
    });
    await expect(page.getByText("Backlog").last()).toBeVisible();
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByText("In progress").last()).toBeVisible();
    await page.getByRole("button", { name: "Complete" }).click();
    await expect(page.getByText("Done").last()).toBeVisible();
    await page.getByLabel("Status filter").selectOption("DONE");
    await expect(page.getByText("Live task workflow")).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("button", { name: /WSLIVE WorkSync Live/ })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("WSLIVE")).toBeVisible();
    await expect(page.getByText("Live task workflow")).toBeVisible({
      timeout: 20_000
    });
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

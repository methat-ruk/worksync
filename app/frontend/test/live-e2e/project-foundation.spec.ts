import { expect, test } from "@playwright/test";

const apiBaseUrl = "http://localhost:4000";

test("creates a workspace, project, and task through the real application boundary", async ({
  browser
}) => {
  const context = await browser.newContext();
  const memberContext = await browser.newContext();
  const consoleErrors: string[] = [];
  const projectStatuses: number[] = [];
  const runId = `${Date.now()}`;
  try {
    const ownerDisplayName = `Project Live ${runId}`;
    const signup = await context.request.post(`${apiBaseUrl}/api/auth/signup`, {
      data: {
        displayName: ownerDisplayName,
        email: `project-live-${runId}@example.com`,
        password: "correct horse battery staple"
      }
    });
    expect(signup.status()).toBe(201);
    const signupData = (await signup.json()) as {
      data: { accessToken: string };
    };
    const authorization = {
      Authorization: `Bearer ${signupData.data.accessToken}`
    };
    const memberDisplayName = `Mention Live ${runId}`;
    const memberEmail = `mention-live-${runId}@example.com`;
    const memberSignup = await memberContext.request.post(
      `${apiBaseUrl}/api/auth/signup`,
      {
      data: {
        displayName: memberDisplayName,
        email: memberEmail,
        password: "correct horse battery staple"
      }
      }
    );
    expect(memberSignup.status()).toBe(201);
    const memberSignupData = (await memberSignup.json()) as {
      data: { accessToken: string };
    };
    const memberAuthorization = {
      Authorization: `Bearer ${memberSignupData.data.accessToken}`
    };

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
    await page.getByLabel("Workspace name").fill(ownerDisplayName);
    await page.getByRole("button", { name: "Create workspace" }).click();

    await expect(page.getByText("No projects in this workspace")).toBeVisible({
      timeout: 20_000
    });
    const workspaceResponse = await context.request.get(
      `${apiBaseUrl}/api/workspaces`,
      { headers: authorization }
    );
    expect(workspaceResponse.status()).toBe(200);
    const workspaceData = (await workspaceResponse.json()) as {
      data: { items: Array<{ id: string; name: string }> };
    };
    const workspaceId = workspaceData.data.items.find(
      ({ name }) => name === ownerDisplayName
    )?.id;
    expect(workspaceId).toBeTruthy();
    const membership = await context.request.post(
      `${apiBaseUrl}/api/workspaces/${workspaceId}/members`,
      {
        headers: authorization,
        data: { email: memberEmail, role: "MEMBER" }
      }
    );
    expect(membership.status()).toBe(201);

    await page.getByLabel("Project name").fill("WorkSync Live");
    await page.getByLabel("Project key").fill("wslive");
    await page.getByRole("button", { name: "Create project" }).click();

    await expect(page.getByText("WorkSync Live is ready.")).toBeVisible();
    await expect(page.getByText("WSLIVE")).toBeVisible();
    await expect(page.getByText("1 total").last()).toBeVisible();
    await expect(page.getByText("No matching tasks")).toBeVisible();

    const createTaskButton = page
      .getByRole("region", { name: "Tasks in WorkSync Live" })
      .getByRole("button", { name: "Create task" });
    await createTaskButton.click();
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
    await expect(createTaskButton).toBeFocused();
    await expect(page.getByText("Backlog").last()).toBeVisible();

    const detailsButton = page.getByRole("button", { name: "View details" });
    await detailsButton.click();
    const detailsDialog = page.getByRole("dialog");
    await expect(detailsDialog.getByText("No comments yet")).toBeVisible();
    const commentBody = `Ask @${memberDisplayName} now`;
    const composer = detailsDialog.getByRole("textbox", {
      name: "Add a comment"
    });
    await composer.fill(`Ask @${memberDisplayName}`);
    await expect(
      detailsDialog.getByRole("option", {
        name: new RegExp(memberDisplayName)
      })
    ).toBeVisible();
    await composer.press("Tab");
    await composer.pressSequentially("now");
    await detailsDialog
      .getByRole("button", { name: "Post comment" })
      .click();
    await expect(
      detailsDialog.locator("article").getByText(commentBody)
    ).toBeVisible();

    await expect
      .poll(
        async () => {
          const response = await memberContext.request.get(
            `${apiBaseUrl}/api/notifications`,
            { headers: memberAuthorization }
          );
          if (response.status() !== 200) {
            return -1;
          }
          const body = (await response.json()) as {
            data: { items: unknown[] };
          };
          return body.data.items.length;
        },
        { timeout: 20_000 }
      )
      .toBe(1);

    const memberNotifications = await memberContext.request.get(
      `${apiBaseUrl}/api/notifications`,
      { headers: memberAuthorization }
    );
    expect(memberNotifications.status()).toBe(200);
    const memberNotificationData = (await memberNotifications.json()) as {
      data: {
        items: Array<{
          id: string;
          readAt: string | null;
          actor: { displayName: string };
          task: { title: string };
        }>;
        unreadCount: number;
      };
    };
    expect(memberNotificationData.data).toMatchObject({
      items: [
        {
          readAt: null,
          actor: { displayName: ownerDisplayName },
          task: { title: "Live task workflow" }
        }
      ],
      unreadCount: 1
    });
    expect(JSON.stringify(memberNotificationData)).not.toContain(commentBody);
    expect(JSON.stringify(memberNotificationData)).not.toContain("recipientId");
    const notificationId = memberNotificationData.data.items[0]?.id;
    expect(notificationId).toBeTruthy();
    const actorReadAttempt = await context.request.patch(
      `${apiBaseUrl}/api/notifications/${notificationId}/read`,
      { headers: authorization }
    );
    expect(actorReadAttempt.status()).toBe(404);

    const memberPage = await memberContext.newPage();
    memberPage.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    await memberPage.goto("/app");
    const notificationTrigger = memberPage.getByRole("button", {
      name: "Notifications, 1 unread"
    });
    await expect(notificationTrigger).toBeVisible({ timeout: 20_000 });
    await notificationTrigger.click();
    const notificationDialog = memberPage.getByRole("dialog", {
      name: "Notifications"
    });
    await expect(
      notificationDialog.locator("p").filter({
        hasText: `${ownerDisplayName} mentioned you in Live task workflow`
      })
    ).toBeVisible();
    await notificationDialog
      .getByRole("button", { name: "Mark as read" })
      .click();
    await expect(
      notificationDialog.getByRole("button", { name: "Mark as read" })
    ).toHaveCount(0);
    await expect(
      notificationDialog.getByRole("button", { name: "Mark all as read" })
    ).toBeDisabled();
    await memberPage.keyboard.press("Escape");
    await expect(
      memberPage.getByRole("button", { name: "Notifications" })
    ).toBeFocused();

    const projectsResponse = await context.request.get(
      `${apiBaseUrl}/api/workspaces/${workspaceId}/projects`,
      { headers: authorization }
    );
    expect(projectsResponse.status()).toBe(200);
    const projectsData = (await projectsResponse.json()) as {
      data: { items: Array<{ id: string; name: string }> };
    };
    const projectId = projectsData.data.items.find(
      ({ name }) => name === "WorkSync Live"
    )?.id;
    expect(projectId).toBeTruthy();
    const tasksResponse = await context.request.get(
      `${apiBaseUrl}/api/workspaces/${workspaceId}/projects/${projectId}/tasks`,
      { headers: authorization }
    );
    expect(tasksResponse.status()).toBe(200);
    const tasksData = (await tasksResponse.json()) as {
      data: { items: Array<{ id: string; title: string }> };
    };
    const taskId = tasksData.data.items.find(
      ({ title }) => title === "Live task workflow"
    )?.id;
    expect(taskId).toBeTruthy();
    const commentsResponse = await context.request.get(
      `${apiBaseUrl}/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`,
      { headers: authorization }
    );
    expect(commentsResponse.status()).toBe(200);
    const commentsData = (await commentsResponse.json()) as {
      data: {
        items: Array<{
          body: string;
          mentions: Array<{ start: number; end: number; userId?: string }>;
        }>;
      };
    };
    expect(commentsData.data.items).toEqual([
      expect.objectContaining({
        body: commentBody,
        mentions: [
          {
            start: 4,
            end: 5 + memberDisplayName.length
          }
        ]
      })
    ]);
    expect(commentsData.data.items[0]?.mentions[0]).not.toHaveProperty(
      "userId"
    );
    await detailsDialog.getByRole("button", { name: "Close" }).click();
    await expect(detailsButton).toBeFocused();

    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByText("In progress").last()).toBeVisible();
    await page.getByRole("button", { name: "Complete" }).click();
    await expect(page.getByText("Done").last()).toBeVisible();
    await page.getByLabel("Status filter").selectOption("DONE");
    await expect(page.getByText("Live task workflow")).toBeVisible();

    const assigneeFilter = page.getByRole("combobox", {
      name: "Assignee filter"
    });
    await expect(assigneeFilter).not.toHaveAttribute("aria-controls");
    await assigneeFilter.fill(`Project Live ${runId}`);
    const assigneeListbox = page.getByRole("listbox", {
      name: "Assignee candidates"
    });
    await expect(assigneeListbox).toBeVisible();
    const assigneeListboxId = await assigneeListbox.getAttribute("id");
    expect(assigneeListboxId).not.toBeNull();
    await expect(assigneeFilter).toHaveAttribute(
      "aria-controls",
      assigneeListboxId!
    );
    await expect(
      assigneeListbox.getByRole("option", {
        name: new RegExp(`Project Live ${runId}`)
      })
    ).toHaveAttribute("tabindex", "-1");
    await assigneeFilter.press("Escape");
    await expect(assigneeListbox).toBeHidden();
    await expect(assigneeFilter).toBeFocused();
    await expect(assigneeFilter).not.toHaveAttribute("aria-controls");

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
    await memberContext.close();
    await context.close();
  }
});

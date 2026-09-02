import { expect, test } from "@playwright/test";

const apiBaseUrl = "http://localhost:4000";
const apiUrl = (path: string) => `${apiBaseUrl}${path}`;

const user = {
  id: "user-1",
  email: "owner@example.com",
  displayName: "Task Owner",
  createdAt: "2026-07-31T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z"
};

const workspace = {
  id: "workspace-1",
  name: "Product Team",
  slug: "product-team",
  membershipRole: "OWNER",
  createdAt: "2026-07-31T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z"
};

const project = {
  id: "project-1",
  name: "WorkSync",
  key: "WSYNC",
  createdAt: "2026-07-31T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z"
};

const task = {
  id: "task-1",
  projectId: project.id,
  title: "Ship task workflow",
  description: "Browser-visible task state",
  status: "BACKLOG",
  dueDate: null,
  creator: { id: user.id, displayName: user.displayName },
  assignee: null,
  createdAt: "2026-07-31T10:00:00.000Z",
  updatedAt: "2026-07-31T10:00:00.000Z"
};

test.beforeEach(async ({ page }) => {
  await page.route(apiUrl("/api/auth/refresh"), (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "Session refreshed",
        data: {
          user,
          accessToken: "task-access-token",
          tokenType: "Bearer",
          expiresIn: 900
        }
      })
    })
  );
  await page.route(/^http:\/\/localhost:4000\/api\/workspaces(?:\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { items: [workspace], page: 1, pageSize: 20, total: 1 }
      })
    })
  );
  await page.route(
    /^http:\/\/localhost:4000\/api\/workspaces\/workspace-1\/projects(?:\?.*)?$/,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { items: [project], page: 1, pageSize: 20, total: 1 }
        })
      })
  );
  await page.route(
    /^http:\/\/localhost:4000\/api\/workspaces\/workspace-1\/projects\/project-1\/tasks(?:\?.*)?$/,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { items: [task], page: 1, pageSize: 20, total: 1 }
        })
      })
  );
  await page.route(
    /^http:\/\/localhost:4000\/api\/notifications(?:\?.*)?$/,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { items: [], nextCursor: null, unreadCount: 0 }
        })
      })
  );
});

test("opens task details and posts a validated mention", async ({ page }) => {
  const consoleErrors: string[] = [];
  const commentBodies: unknown[] = [];
  const commentRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("request", (request) => {
    if (request.url().includes("/comments")) {
      commentRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  await page.route(
    /^http:\/\/localhost:4000\/api\/workspaces\/workspace-1\/mention-candidates\?.*$/,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            items: [
              {
                id: "user-2",
                displayName: "Alice   Example",
                mentionLabel: "Alice Example"
              }
            ]
          }
        })
      })
  );
  await page.route(
    /^http:\/\/localhost:4000\/api\/workspaces\/workspace-1\/projects\/project-1\/tasks\/task-1\/comments(?:\?.*)?$/,
    (route) => {
      if (route.request().method() === "POST") {
        const input = route.request().postDataJSON() as {
          body: string;
          mentions: Array<{ start: number; end: number }>;
        };
        commentBodies.push(input);
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            message: "Comment created",
            data: {
              comment: {
                id: "comment-1",
                taskId: task.id,
                body: input.body,
                author: { id: user.id, displayName: user.displayName },
                mentions: input.mentions.map(({ start, end }) => ({
                  start,
                  end
                })),
                createdAt: "2026-09-01T10:00:00.000Z"
              }
            }
          })
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { items: [], nextCursor: null }
        })
      });
    }
  );

  await page.goto("/app");
  const detailsButton = page.getByRole("button", { name: "View details" });
  await detailsButton.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("No comments yet")).toBeVisible();

  const composer = dialog.getByRole("textbox", { name: "Add a comment" });
  await composer.fill("Ask @Ali");
  await expect(
    dialog.getByRole("option", { name: /Alice Example/i })
  ).toBeVisible();
  await composer.press("Tab");
  await expect(composer).toHaveValue("Ask @Alice Example ");
  await composer.pressSequentially("now");
  await dialog.getByRole("button", { name: "Post comment" }).click();

  await expect
    .poll(() =>
      commentRequests.some((value) => value.startsWith("POST "))
    )
    .toBe(true);
  await expect.poll(() => commentBodies).toEqual([
    {
      body: "Ask @Alice Example now",
      mentions: [{ userId: "user-2", start: 4, end: 18 }]
    }
  ]);
  await expect(composer).toHaveValue("");
  await expect(
    dialog.locator("article").getByText("Ask @Alice Example now")
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(detailsButton).toBeFocused();
  expect(consoleErrors).toEqual([]);
});

test("auto-searches assignees and confirms terminal cancellation", async ({
  page
}) => {
  const consoleErrors: string[] = [];
  const assigneeQueries: string[] = [];
  const statusBodies: unknown[] = [];
  const taskMutationMethods: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("request", (request) => {
    if (
      request.url().includes("/projects/project-1/tasks") &&
      request.method() !== "GET"
    ) {
      taskMutationMethods.push(request.method());
    }
  });
  await page.route(
    /^http:\/\/localhost:4000\/api\/workspaces\/workspace-1\/task-assignees\?.*$/,
    (route) => {
      const url = new URL(route.request().url());
      const search = url.searchParams.get("search") ?? "";
      assigneeQueries.push(search);
      const items =
        search === "Nobody"
          ? []
          : [{ id: "user-2", displayName: "Alice Example" }];
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            items,
            page: 1,
            pageSize: 20,
            total: items.length
          }
        })
      });
    }
  );
  await page.route(
    apiUrl(
      "/api/workspaces/workspace-1/projects/project-1/tasks/task-1/status"
    ),
    (route) => {
      statusBodies.push(route.request().postDataJSON());
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { task: { ...task, status: "CANCELED" } }
        })
      });
    }
  );

  await page.goto("/app");
  await expect(page.getByText(task.title)).toBeVisible();

  const createTask = page.getByRole("button", { name: "Create task" });
  await createTask.click();
  const taskDialog = page.getByRole("dialog");
  await expect(taskDialog).toBeVisible();
  await taskDialog.getByLabel("Title").fill("Keyboard-safe task");
  const formAssignee = taskDialog.getByRole("combobox", { name: "Assignee" });
  await formAssignee.focus();
  await expect(
    taskDialog.getByRole("listbox", { name: "Assignee candidates" })
  ).toBeVisible();
  await formAssignee.fill("Nobody");
  await expect.poll(() => assigneeQueries).toContain("Nobody");
  await expect(
    taskDialog.getByText("No matching workspace members.")
  ).toBeVisible();
  await formAssignee.press("Enter");
  await expect(taskDialog).toBeVisible();
  expect(taskMutationMethods).toEqual([]);
  await formAssignee.press("Escape");
  await expect(
    taskDialog.getByRole("listbox", { name: "Assignee candidates" })
  ).toBeHidden();
  await formAssignee.press("Enter");
  await expect(taskDialog).toBeVisible();
  await expect(formAssignee).toHaveAttribute("aria-expanded", "true");
  await expect(
    taskDialog.getByRole("listbox", { name: "Assignee candidates" })
  ).toBeAttached();
  expect(taskMutationMethods).toEqual([]);
  await formAssignee.press("Escape");
  await expect(
    taskDialog.getByRole("listbox", { name: "Assignee candidates" })
  ).toBeHidden();
  await formAssignee.press("Escape");
  await expect(taskDialog).toBeHidden();
  await expect(createTask).toBeFocused();

  const assigneeSearch = page.getByRole("combobox", {
    name: "Assignee filter"
  });
  await expect(assigneeSearch).not.toHaveAttribute("aria-controls");
  await assigneeSearch.fill("Ali");
  await expect.poll(() => assigneeQueries).toContain("Ali");
  const assigneeListbox = page.getByRole("listbox", {
    name: "Assignee candidates"
  });
  await expect(assigneeListbox).toBeVisible();
  const assigneeListboxId = await assigneeListbox.getAttribute("id");
  expect(assigneeListboxId).not.toBeNull();
  await expect(assigneeSearch).toHaveAttribute(
    "aria-controls",
    assigneeListboxId!
  );
  await expect(
    page.getByRole("option", { name: /Alice Example/ })
  ).toHaveAttribute("tabindex", "-1");
  await assigneeSearch.press("Escape");
  await expect(assigneeListbox).toBeHidden();
  await expect(assigneeSearch).toBeFocused();
  await expect(assigneeSearch).not.toHaveAttribute("aria-controls");

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByText(/cannot be reopened after it is canceled/)
  ).toBeVisible();
  expect(statusBodies).toEqual([]);
  await page.getByRole("button", { name: "Keep task" }).click();
  expect(statusBodies).toEqual([]);

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Cancel task" }).click();
  await expect.poll(() => statusBodies).toEqual([{ status: "CANCELED" }]);
  expect(taskMutationMethods).toEqual(["PATCH"]);
  expect(consoleErrors).toEqual([]);
});

test("uses the same primary solid action color in light and dark themes", async ({
  page
}) => {
  await page.goto("/");
  const getStarted = page.getByRole("link", { name: "Get started" });
  await expect(getStarted).toHaveCSS("background-color", "rgb(37, 99, 235)");

  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await expect(getStarted).toHaveCSS("background-color", "rgb(37, 99, 235)");
});

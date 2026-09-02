import { expect, test } from "@playwright/test";

const apiBaseUrl = "http://localhost:4000";
const apiUrl = (path: string) => `${apiBaseUrl}${path}`;

const user = {
  id: "recipient-1",
  email: "recipient@example.com",
  displayName: "Notification Recipient",
  createdAt: "2026-09-02T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z"
};

const workspace = {
  id: "workspace-1",
  name: "Product Team",
  slug: "product-team",
  membershipRole: "MEMBER",
  createdAt: "2026-09-02T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z"
};

const project = {
  id: "project-1",
  name: "WorkSync",
  key: "WSYNC",
  createdAt: "2026-09-02T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z"
};

const notification = {
  id: "notification-1",
  type: "COMMENT_MENTION",
  createdAt: "2026-09-02T10:00:00.000Z",
  readAt: null as string | null,
  actor: { id: "owner-1", displayName: "Task Owner" },
  workspace: { id: workspace.id, name: workspace.name },
  project: { id: project.id, key: project.key, name: project.name },
  task: { id: "task-1", title: "Review notification flow" }
};

test.beforeEach(async ({ page }) => {
  notification.readAt = null;
  await page.route(apiUrl("/api/auth/refresh"), (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "Session refreshed",
        data: {
          user,
          accessToken: "notification-access-token",
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
          data: { items: [], page: 1, pageSize: 20, total: 0 }
        })
      })
  );
  await page.route(/^http:\/\/localhost:4000\/api\/notifications(?:\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          items: [notification],
          nextCursor: null,
          unreadCount: notification.readAt ? 0 : 1
        }
      })
    })
  );
  await page.route(apiUrl("/api/notifications/notification-1/read"), (route) => {
    notification.readAt ??= "2026-09-02T10:05:00.000Z";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "Notification marked as read",
        data: { notification, unreadCount: 0 }
      })
    });
  });
});

test("opens the responsive notification panel and preserves accepted read state", async ({
  page
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto("/app");
  const trigger = page.getByRole("button", {
    name: "Notifications, 1 unread"
  });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Notifications" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Task Owner")).toBeVisible();
  await expect(dialog.getByText("Review notification flow")).toBeVisible();
  await expect(dialog.getByText("Product Team · WSYNC")).toBeVisible();
  await dialog.getByRole("button", { name: "Mark as read" }).click();
  await expect(
    dialog.getByRole("button", { name: "Mark as read" })
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Mark all as read" })
  ).toBeDisabled();
  await expect(page.locator('button[aria-label="Notifications"]')).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Notifications" })).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByRole("dialog", { name: "Notifications" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

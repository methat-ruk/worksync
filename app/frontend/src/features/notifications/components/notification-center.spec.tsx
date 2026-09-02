import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  NotificationListData,
  PublicNotification
} from "../model/notification-contract";

const mocks = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn()
}));

vi.mock("../api/notifications-api", () => mocks);

import { NotificationCenter } from "./notification-center";

const unreadNotification: PublicNotification = {
  id: "notification-1",
  type: "COMMENT_MENTION",
  createdAt: new Date("2026-09-02T10:00:00.000Z"),
  readAt: null,
  actor: { id: "owner-1", displayName: "Task Owner" },
  workspace: { id: "workspace-1", name: "Product Workspace" },
  project: { id: "project-1", key: "WORK", name: "WorkSync" },
  task: { id: "task-1", title: "Review notification flow" }
};

function listData(
  items: PublicNotification[],
  unreadCount: number
): NotificationListData {
  return { items, nextCursor: null, unreadCount };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.listNotifications.mockReset();
  mocks.markNotificationRead.mockReset();
  mocks.markAllNotificationsRead.mockReset();
  mocks.listNotifications.mockResolvedValue(listData([], 0));
});

describe("NotificationCenter", () => {
  it("shows an accessible empty state and supports manual refresh", async () => {
    const user = userEvent.setup();
    render(<NotificationCenter sessionKey="user-1" />);

    const trigger = await screen.findByRole("button", {
      name: "Notifications"
    });
    await user.click(trigger);

    expect(await screen.findByText("No notifications yet")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(mocks.listNotifications).toHaveBeenCalledTimes(3));
  });

  it("marks one notification read from the accepted server response", async () => {
    const user = userEvent.setup();
    mocks.listNotifications.mockResolvedValue(listData([unreadNotification], 1));
    const readAt = new Date("2026-09-02T10:05:00.000Z");
    mocks.markNotificationRead.mockResolvedValue({
      notification: { ...unreadNotification, readAt },
      unreadCount: 0
    });
    render(<NotificationCenter sessionKey="user-1" />);

    const trigger = await screen.findByRole("button", {
      name: "Notifications, 1 unread"
    });
    await user.click(trigger);
    expect(
      await screen.findByText("Task Owner", { selector: "span" })
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Mark as read" }));

    await waitFor(() =>
      expect(
        document.querySelector('button[aria-label="Notifications"]')
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByRole("button", { name: "Mark as read" })
    ).not.toBeInTheDocument();
  });

  it("does not resurrect unread state from a superseded refresh after mark-all", async () => {
    const user = userEvent.setup();
    const staleRefresh = deferred<NotificationListData>();
    const readAt = new Date("2026-09-02T10:10:00.000Z");
    mocks.listNotifications
      .mockResolvedValueOnce(listData([unreadNotification], 1))
      .mockReturnValueOnce(staleRefresh.promise)
      .mockResolvedValueOnce(
        listData([{ ...unreadNotification, readAt }], 0)
      );
    mocks.markAllNotificationsRead.mockResolvedValue({
      readAt,
      updatedCount: 1,
      unreadCount: 0
    });
    render(<NotificationCenter sessionKey="user-1" />);

    await user.click(
      await screen.findByRole("button", {
        name: "Notifications, 1 unread"
      })
    );
    await user.click(
      screen.getByRole("button", { name: "Mark all as read" })
    );
    await waitFor(() =>
      expect(
        document.querySelector('button[aria-label="Notifications"]')
      ).toBeInTheDocument()
    );

    staleRefresh.resolve(listData([unreadNotification], 1));
    await waitFor(() => expect(mocks.listNotifications).toHaveBeenCalledTimes(3));
    expect(
      document.querySelector('button[aria-label="Notifications"]')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mark as read" })
    ).not.toBeInTheDocument();
  });

  it("exits initial loading into a recoverable error", async () => {
    const user = userEvent.setup();
    mocks.listNotifications
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(listData([], 0));
    render(<NotificationCenter sessionKey="user-1" />);

    await user.click(
      await screen.findByRole("button", { name: "Notifications" })
    );
    expect(
      await screen.findByText(
        "Notifications could not be loaded. Please try again."
      )
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No notifications yet")).toBeVisible();
  });
});

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

const secondUnreadNotification: PublicNotification = {
  ...unreadNotification,
  id: "notification-2",
  createdAt: new Date("2026-09-02T09:00:00.000Z"),
  actor: { id: "owner-2", displayName: "Second Owner" },
  task: { id: "task-2", title: "Verify notification ordering" }
};

function listData(
  items: PublicNotification[],
  unreadCount: number,
  nextCursor: string | null = null
): NotificationListData {
  return { items, nextCursor, unreadCount };
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

  it("serializes read mutations so responses cannot regress the unread count", async () => {
    const user = userEvent.setup();
    const firstMutation = deferred<{
      notification: PublicNotification;
      unreadCount: number;
    }>();
    const firstReadAt = new Date("2026-09-02T10:05:00.000Z");
    const secondReadAt = new Date("2026-09-02T10:06:00.000Z");
    mocks.listNotifications.mockResolvedValue(
      listData([unreadNotification, secondUnreadNotification], 2)
    );
    mocks.markNotificationRead
      .mockReturnValueOnce(firstMutation.promise)
      .mockResolvedValueOnce({
        notification: { ...secondUnreadNotification, readAt: secondReadAt },
        unreadCount: 0
      });
    render(<NotificationCenter sessionKey="user-1" />);

    await user.click(
      await screen.findByRole("button", {
        name: "Notifications, 2 unread"
      })
    );
    const readButtons = await screen.findAllByRole("button", {
      name: "Mark as read"
    });
    await user.click(readButtons[0]!);
    await waitFor(() => expect(readButtons[1]).toBeDisabled());
    await user.click(readButtons[1]!);
    expect(mocks.markNotificationRead).toHaveBeenCalledTimes(1);

    firstMutation.resolve({
      notification: { ...unreadNotification, readAt: firstReadAt },
      unreadCount: 1
    });
    const remainingButton = await screen.findByRole("button", {
      name: "Mark as read"
    });
    await waitFor(() => expect(remainingButton).toBeEnabled());
    await user.click(remainingButton);

    await waitFor(() =>
      expect(mocks.markNotificationRead).toHaveBeenCalledTimes(2)
    );
    await waitFor(() =>
      expect(
        document.querySelector('button[aria-label="Notifications"]')
      ).toBeInTheDocument()
    );
  });

  it("removes cached notifications missing from an authoritative refresh", async () => {
    const user = userEvent.setup();
    mocks.listNotifications
      .mockResolvedValueOnce(listData([unreadNotification], 1))
      .mockResolvedValueOnce(listData([], 0));
    render(<NotificationCenter sessionKey="user-1" />);

    await user.click(
      await screen.findByRole("button", {
        name: "Notifications, 1 unread"
      })
    );

    expect(await screen.findByText("No notifications yet")).toBeVisible();
    expect(screen.queryByText("Task Owner")).not.toBeInTheDocument();
  });

  it("keeps notifications newer than the mark-all cutoff unread", async () => {
    const user = userEvent.setup();
    const readAt = new Date("2026-09-02T10:05:00.000Z");
    const newerNotification = {
      ...secondUnreadNotification,
      createdAt: new Date("2026-09-02T10:10:00.000Z")
    };
    mocks.listNotifications
      .mockResolvedValueOnce(listData([newerNotification, unreadNotification], 2))
      .mockResolvedValueOnce(listData([newerNotification, unreadNotification], 2))
      .mockResolvedValueOnce(
        listData(
          [newerNotification, { ...unreadNotification, readAt }],
          1
        )
      );
    mocks.markAllNotificationsRead.mockResolvedValue({
      readAt,
      updatedCount: 1,
      unreadCount: 1
    });
    render(<NotificationCenter sessionKey="user-1" />);

    await user.click(
      await screen.findByRole("button", {
        name: "Notifications, 2 unread"
      })
    );
    await user.click(
      await screen.findByRole("button", { name: "Mark all as read" })
    );

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Mark as read" })).toHaveLength(1)
    );
    expect(screen.getByText("Second Owner")).toBeVisible();
    expect(
      document.querySelector(
        'button[aria-label="Notifications, 1 unread"]'
      )
    ).toBeInTheDocument();
  });

  it("loads another cursor page without duplicating the first page", async () => {
    const user = userEvent.setup();
    mocks.listNotifications
      .mockResolvedValueOnce(listData([unreadNotification], 2, "next-page"))
      .mockResolvedValueOnce(listData([unreadNotification], 2, "next-page"))
      .mockResolvedValueOnce(listData([secondUnreadNotification], 2));
    render(<NotificationCenter sessionKey="user-1" />);

    await user.click(
      await screen.findByRole("button", {
        name: "Notifications, 2 unread"
      })
    );
    await user.click(await screen.findByRole("button", { name: "Load more" }));

    expect(await screen.findByText("Second Owner")).toBeVisible();
    expect(screen.getAllByText("Task Owner", { selector: "span" })).toHaveLength(1);
  });

  it("clears user-specific state and aborts in-flight work when the session changes", async () => {
    const nextSessionRequest = deferred<NotificationListData>();
    let nextSessionSignal: AbortSignal | undefined;
    mocks.listNotifications
      .mockResolvedValueOnce(listData([unreadNotification], 1))
      .mockImplementationOnce(({ signal }: { signal: AbortSignal }) => {
        nextSessionSignal = signal;
        return nextSessionRequest.promise;
      });
    const { rerender, unmount } = render(
      <NotificationCenter sessionKey="user-1" />
    );

    expect(
      await screen.findByRole("button", {
        name: "Notifications, 1 unread"
      })
    ).toBeInTheDocument();
    rerender(<NotificationCenter sessionKey="user-2" />);

    expect(
      await screen.findByRole("button", { name: "Notifications" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Task Owner")).not.toBeInTheDocument();
    await waitFor(() => expect(nextSessionSignal).toBeDefined());
    unmount();
    expect(nextSessionSignal?.aborted).toBe(true);
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

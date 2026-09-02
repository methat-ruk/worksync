import { beforeEach, describe, expect, it, vi } from "vitest";

import { setAccessToken } from "@/lib/api/session-token";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from "./notifications-api";

const notificationPayload = {
  id: "notification-1",
  type: "COMMENT_MENTION",
  createdAt: "2026-09-02T10:00:00.000Z",
  readAt: null,
  actor: { id: "owner-1", displayName: "Owner" },
  workspace: { id: "workspace-1", name: "Workspace" },
  project: { id: "project-1", key: "WORK", name: "Project" },
  task: { id: "task-1", title: "Review notifications" }
};

describe("notifications API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setAccessToken("access-token");
  });

  it("requests a bounded cursor page and parses notification dates", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            items: [notificationPayload],
            nextCursor: "next-cursor",
            unreadCount: 1
          }
        }),
        { status: 200 }
      )
    );

    const data = await listNotifications({ cursor: "cursor/value", limit: 10 });

    expect(data.items[0]?.createdAt).toBeInstanceOf(Date);
    expect(data.items[0]?.readAt).toBeNull();
    expect(data.unreadCount).toBe(1);
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("/api/notifications?");
    expect(url).toContain("cursor=cursor%2Fvalue");
    expect(url).toContain("limit=10");
  });

  it("marks one encoded notification ID read with no request body", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            notification: {
              ...notificationPayload,
              readAt: "2026-09-02T10:01:00.000Z"
            },
            unreadCount: 0
          }
        }),
        { status: 200 }
      )
    );

    const data = await markNotificationRead("notification/value");

    expect(data.notification.readAt).toBeInstanceOf(Date);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/api/notifications/notification%2Fvalue/read"
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH" });
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("body");
  });

  it("marks all notifications read and parses the server cutoff", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            readAt: "2026-09-02T10:02:00.000Z",
            updatedCount: 2,
            unreadCount: 0
          }
        }),
        { status: 200 }
      )
    );

    const data = await markAllNotificationsRead();

    expect(data.readAt).toBeInstanceOf(Date);
    expect(data.updatedCount).toBe(2);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      "/api/notifications/read-all"
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH" });
  });
});

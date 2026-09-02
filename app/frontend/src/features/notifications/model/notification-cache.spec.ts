import { describe, expect, it } from "vitest";

import type { PublicNotification } from "./notification-contract";
import {
  mergeNotificationPages,
  reconcileNotificationFirstPage
} from "./notification-cache";

function notification(
  id: string,
  createdAt: string,
  readAt: string | null = null
): PublicNotification {
  return {
    id,
    type: "COMMENT_MENTION",
    createdAt: new Date(createdAt),
    readAt: readAt ? new Date(readAt) : null,
    actor: { id: "actor-1", displayName: "Actor" },
    workspace: { id: "workspace-1", name: "Workspace" },
    project: { id: "project-1", key: "WORK", name: "Project" },
    task: { id: "task-1", title: "Task" }
  };
}

describe("mergeNotificationPages", () => {
  it("deduplicates pages and preserves newest-first tuple order", () => {
    const merged = mergeNotificationPages(
      [
        notification("notification-b", "2026-09-02T10:00:00.000Z"),
        notification("notification-a", "2026-09-02T10:00:00.000Z")
      ],
      [
        notification("notification-c", "2026-09-02T11:00:00.000Z"),
        notification("notification-b", "2026-09-02T10:00:00.000Z")
      ],
      false
    );

    expect(merged.map(({ id }) => id)).toEqual([
      "notification-c",
      "notification-b",
      "notification-a"
    ]);
  });

  it("does not resurrect accepted read state from a stale page", () => {
    const acceptedReadAt = "2026-09-02T12:00:00.000Z";
    const merged = mergeNotificationPages(
      [notification("notification-1", "2026-09-02T10:00:00.000Z", acceptedReadAt)],
      [notification("notification-1", "2026-09-02T10:00:00.000Z")],
      true
    );

    expect(merged[0]?.readAt).toEqual(new Date(acceptedReadAt));
  });

  it("drops cached notifications missing from an authoritative first page", () => {
    const refreshed = reconcileNotificationFirstPage(
      [notification("notification-1", "2026-09-02T10:00:00.000Z")],
      [],
      false
    );

    expect(refreshed).toEqual([]);
  });

  it("preserves accepted read state when the first-page response is stale", () => {
    const acceptedReadAt = "2026-09-02T12:00:00.000Z";
    const refreshed = reconcileNotificationFirstPage(
      [notification("notification-1", "2026-09-02T10:00:00.000Z", acceptedReadAt)],
      [notification("notification-1", "2026-09-02T10:00:00.000Z")],
      true
    );

    expect(refreshed[0]?.readAt).toEqual(new Date(acceptedReadAt));
  });
});

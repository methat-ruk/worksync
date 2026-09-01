import { createRef } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setAccessToken } from "@/lib/api/session-token";
import type { PublicTask } from "@/features/tasks/model/task-contract";
import { TaskDetailSheet } from "./task-detail-sheet";

const task: PublicTask = {
  id: "task-1",
  projectId: "project-1",
  title: "Review discussion",
  description: "Keep comments readable.",
  status: "IN_PROGRESS",
  dueDate: null,
  creator: { id: "owner-1", displayName: "Owner" },
  assignee: null,
  createdAt: new Date("2026-09-01T09:00:00.000Z"),
  updatedAt: new Date("2026-09-01T09:00:00.000Z")
};

describe("TaskDetailSheet", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setAccessToken("access-token");
  });

  it("renders comment text safely and keeps viewers read-only", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            items: [
              {
                id: "comment-1",
                taskId: "task-1",
                body: "<img src=x onerror=alert(1)> @Alice",
                author: { id: "owner-1", displayName: "Owner" },
                mentions: [{ start: 35, end: 41 }],
                createdAt: "2026-09-01T10:00:00.000Z"
              }
            ],
            nextCursor: null
          }
        }),
        { status: 200 }
      )
    );

    render(
      <TaskDetailSheet
        canCreateComment={false}
        onOpenChange={vi.fn()}
        open
        projectId="project-1"
        returnFocusRef={createRef<HTMLElement>()}
        task={task}
        workspaceId="workspace-1"
      />
    );

    expect(await screen.findByText(/<img src=x onerror=alert\(1\)>/)).toBeVisible();
    expect(document.querySelector("img")).toBeNull();
    expect(
      screen.getByText(/VIEWER role can read this thread/)
    ).toBeVisible();
    expect(
      screen.queryByRole("textbox", { name: "Add a comment" })
    ).not.toBeInTheDocument();
  });

  it("shows the composer to roles that can create comments", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { items: [], nextCursor: null }
        }),
        { status: 200 }
      )
    );

    render(
      <TaskDetailSheet
        canCreateComment
        onOpenChange={vi.fn()}
        open
        projectId="project-1"
        returnFocusRef={createRef<HTMLElement>()}
        task={task}
        workspaceId="workspace-1"
      />
    );

    expect(await screen.findByText("No comments yet")).toBeVisible();
    expect(
      screen.getByRole("textbox", { name: "Add a comment" })
    ).toBeVisible();
  });

  it("prepends older pages without duplicating comments", async () => {
    const user = userEvent.setup();
    const latest = {
      id: "comment-latest",
      taskId: "task-1",
      body: "Latest comment",
      author: { id: "owner-1", displayName: "Owner" },
      mentions: [],
      createdAt: "2026-09-01T11:00:00.000Z"
    };
    const older = {
      ...latest,
      id: "comment-older",
      body: "Older comment",
      createdAt: "2026-09-01T10:00:00.000Z"
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { items: [latest], nextCursor: "older-cursor" }
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { items: [older, latest], nextCursor: null }
          }),
          { status: 200 }
        )
      );

    render(
      <TaskDetailSheet
        canCreateComment={false}
        onOpenChange={vi.fn()}
        open
        projectId="project-1"
        returnFocusRef={createRef<HTMLElement>()}
        task={task}
        workspaceId="workspace-1"
      />
    );

    await user.click(
      await screen.findByRole("button", { name: "Load older comments" })
    );
    const olderText = await screen.findByText("Older comment");
    const latestText = screen.getByText("Latest comment");
    expect(
      olderText.compareDocumentPosition(latestText) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getAllByText("Latest comment")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Load older comments" })
    ).not.toBeInTheDocument();
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "cursor=older-cursor"
    );
  });

  it("recovers from an initial thread error through Retry comments", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            message: "Thread unavailable",
            data: { code: "INTERNAL_ERROR" }
          }),
          { status: 500 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { items: [], nextCursor: null }
          }),
          { status: 200 }
        )
      );

    render(
      <TaskDetailSheet
        canCreateComment
        onOpenChange={vi.fn()}
        open
        projectId="project-1"
        returnFocusRef={createRef<HTMLElement>()}
        task={task}
        workspaceId="workspace-1"
      />
    );

    await user.click(
      await screen.findByRole("button", { name: "Retry comments" })
    );
    await waitFor(() => expect(screen.getByText("No comments yet")).toBeVisible());
  });
});

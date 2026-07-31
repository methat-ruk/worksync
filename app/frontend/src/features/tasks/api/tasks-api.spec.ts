import { beforeEach, describe, expect, it, vi } from "vitest";

import { setAccessToken } from "@/lib/api/session-token";
import {
  createTask,
  listTasks,
  searchTaskAssignees,
  transitionTaskStatus,
  updateTask
} from "./tasks-api";

const taskPayload = {
  id: "task-1",
  projectId: "project-1",
  title: "Ship tasks",
  description: null,
  status: "BACKLOG",
  dueDate: null,
  creator: { id: "user-1", displayName: "Owner" },
  assignee: null,
  createdAt: "2026-07-31T10:00:00.000Z",
  updatedAt: "2026-07-31T10:00:00.000Z"
};

describe("tasks API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setAccessToken("access-token");
  });

  it("composes bounded task filters and parses dates", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { items: [taskPayload], page: 2, pageSize: 10, total: 11 }
        }),
        { status: 200 }
      )
    );

    const result = await listTasks("workspace 1", "project 1", {
      page: 2,
      pageSize: 10,
      status: "BACKLOG",
      assigneeId: "user-1"
    });

    expect(result.items[0]?.createdAt).toBeInstanceOf(Date);
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain(
      "/api/workspaces/workspace%201/projects/project%201/tasks?"
    );
    expect(url).toContain("status=BACKLOG");
    expect(url).toContain("assigneeId=user-1");
  });

  it("sends only reviewed task mutation bodies", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () =>
        new Response(
          JSON.stringify({ success: true, data: { task: taskPayload } }),
          { status: 200 }
        )
      );

    await createTask("workspace-1", "project-1", {
      title: " Ship tasks ",
      description: null,
      assigneeId: null,
      dueDate: null
    });
    await updateTask("workspace-1", "project-1", "task-1", {
      title: "Updated"
    });
    await transitionTaskStatus(
      "workspace-1",
      "project-1",
      "task-1",
      "IN_PROGRESS"
    );

    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    ).toEqual({
      title: "Ship tasks",
      description: null,
      assigneeId: null,
      dueDate: null
    });
    expect(
      JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))
    ).toEqual({ title: "Updated" });
    expect(
      JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))
    ).toEqual({ status: "IN_PROGRESS" });
  });

  it("trims assignee auto-search queries", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            items: [{ id: "user-1", displayName: "Alice" }],
            page: 1,
            pageSize: 20,
            total: 1
          }
        }),
        { status: 200 }
      )
    );

    await searchTaskAssignees("workspace-1", { search: "  aLiCe  " });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("search=aLiCe");
  });
});

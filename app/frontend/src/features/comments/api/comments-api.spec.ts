import { beforeEach, describe, expect, it, vi } from "vitest";

import { setAccessToken } from "@/lib/api/session-token";
import {
  createComment,
  listComments,
  searchMentionCandidates
} from "./comments-api";

const commentPayload = {
  id: "comment-1",
  taskId: "task-1",
  body: "Ask @Alice Example",
  author: { id: "owner-1", displayName: "Owner" },
  mentions: [{ start: 4, end: 18 }],
  createdAt: "2026-09-01T10:00:00.000Z"
};

describe("comments API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setAccessToken("access-token");
  });

  it("requests an older cursor page and parses comment dates", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { items: [commentPayload], nextCursor: null }
        }),
        { status: 200 }
      )
    );

    const data = await listComments("workspace 1", "project 1", "task 1", {
      cursor: "cursor/value",
      limit: 10
    });

    expect(data.items[0]?.createdAt).toBeInstanceOf(Date);
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain(
      "/workspaces/workspace%201/projects/project%201/tasks/task%201/comments"
    );
    expect(url).toContain("cursor=cursor%2Fvalue");
    expect(url).toContain("limit=10");
  });

  it("sends only canonical comment and mention fields", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          message: "Comment created",
          data: { comment: commentPayload }
        }),
        { status: 201 }
      )
    );

    await createComment("workspace-1", "project-1", "task-1", {
      body: commentPayload.body,
      mentions: [{ userId: "alice-1", start: 4, end: 18 }]
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      body: commentPayload.body,
      mentions: [{ userId: "alice-1", start: 4, end: 18 }]
    });
  });

  it("trims and bounds mention candidate search", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            items: [
              {
                id: "alice-1",
                displayName: "Alice   Example",
                mentionLabel: "Alice Example"
              }
            ]
          }
        }),
        { status: 200 }
      )
    );

    await searchMentionCandidates("workspace-1", "  Ali  ");

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("search=Ali");
    expect(url).toContain("limit=10");
  });
});

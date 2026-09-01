import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setAccessToken } from "@/lib/api/session-token";
import { MentionCommentComposer } from "./mention-comment-composer";

describe("MentionCommentComposer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setAccessToken("access-token");
  });

  it("selects a mention and posts canonical UTF-16 ranges pessimistically", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input, init) => {
        const url = String(input);
        if (url.includes("mention-candidates")) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                items: [
                  {
                    id: "user-alice",
                    displayName: "Alice   Example",
                    mentionLabel: "Alice Example"
                  }
                ]
              }
            }),
            { status: 200 }
          );
        }
        const body = JSON.parse(String(init?.body)) as {
          body: string;
          mentions: Array<{ userId: string; start: number; end: number }>;
        };
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              comment: {
                id: "comment-1",
                taskId: "task-1",
                body: body.body,
                author: { id: "owner-1", displayName: "Owner" },
                mentions: body.mentions.map(({ start, end }) => ({ start, end })),
                createdAt: "2026-09-01T10:00:00.000Z"
              }
            }
          }),
          { status: 201 }
        );
      }
    );

    render(
      <MentionCommentComposer
        onCreated={onCreated}
        projectId="project-1"
        taskId="task-1"
        workspaceId="workspace-1"
      />
    );
    const textbox = screen.getByRole("textbox", { name: "Add a comment" });
    await user.type(textbox, "Ask @Ali");
    await user.click(
      await screen.findByRole("option", { name: /Alice Example/i })
    );
    expect(textbox).toHaveValue("Ask @Alice Example ");
    await user.type(textbox, "now");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Post comment" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    const postCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).includes("/comments") && init?.method === "POST"
    );
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      body: "Ask @Alice Example now",
      mentions: [{ userId: "user-alice", start: 4, end: 18 }]
    });
    expect(textbox).toHaveValue("");
  });

  it("removes structured mention data after editing the selected label", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input, init) => {
        if (String(input).includes("mention-candidates")) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                items: [
                  {
                    id: "user-alice",
                    displayName: "Alice",
                    mentionLabel: "Alice"
                  }
                ]
              }
            }),
            { status: 200 }
          );
        }
        const requestBody = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              comment: {
                id: "comment-2",
                taskId: "task-1",
                body: requestBody.body,
                author: { id: "owner-1", displayName: "Owner" },
                mentions: [],
                createdAt: "2026-09-01T10:00:00.000Z"
              }
            }
          }),
          { status: 201 }
        );
      }
    );

    render(
      <MentionCommentComposer
        onCreated={vi.fn()}
        projectId="project-1"
        taskId="task-1"
        workspaceId="workspace-1"
      />
    );
    const textbox = screen.getByRole("textbox", { name: "Add a comment" });
    await user.type(textbox, "@Ali");
    await user.click(await screen.findByRole("option", { name: /Alice/i }));
    await user.clear(textbox);
    await user.type(textbox, "Alice without a mention");
    await user.click(screen.getByRole("button", { name: "Post comment" }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input).includes("/comments") && init?.method === "POST"
      );
      expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
        body: "Alice without a mention",
        mentions: []
      });
    });
  });

  it("posts an unselected @ query as plain text when the menu is open", async () => {
    const user = userEvent.setup();
    const postBodies: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).includes("mention-candidates")) {
        return new Response(
          JSON.stringify({ success: true, data: { items: [] } }),
          { status: 200 }
        );
      }
      const requestBody = JSON.parse(String(init?.body));
      postBodies.push(requestBody);
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            comment: {
              id: "comment-3",
              taskId: "task-1",
              body: requestBody.body,
              author: { id: "owner-1", displayName: "Owner" },
              mentions: [],
              createdAt: "2026-09-01T10:00:00.000Z"
            }
          }
        }),
        { status: 201 }
      );
    });

    render(
      <MentionCommentComposer
        onCreated={vi.fn()}
        projectId="project-1"
        taskId="task-1"
        workspaceId="workspace-1"
      />
    );
    const textbox = screen.getByRole("textbox", { name: "Add a comment" });
    await user.type(textbox, "Ask @Nobody");
    expect(await screen.findByRole("listbox")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Post comment" }));

    await waitFor(() =>
      expect(postBodies).toEqual([
        { body: "Ask @Nobody", mentions: [] }
      ])
    );
    expect(textbox).toHaveValue("");
  });

  it("aborts stale candidate searches and ignores their late results", async () => {
    const user = userEvent.setup();
    let resolveStale: ((response: Response) => void) | undefined;
    const staleResponse = new Promise<Response>((resolve) => {
      resolveStale = resolve;
    });
    const signals: AbortSignal[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(String(input), "http://localhost");
      signals.push(init?.signal as AbortSignal);
      if (url.searchParams.get("search") === "Ali") {
        return staleResponse;
      }
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            items: [
              {
                id: "user-alice-new",
                displayName: "Alice New",
                mentionLabel: "Alice New"
              }
            ]
          }
        }),
        { status: 200 }
      );
    });

    render(
      <MentionCommentComposer
        onCreated={vi.fn()}
        projectId="project-1"
        taskId="task-1"
        workspaceId="workspace-1"
      />
    );
    const textbox = screen.getByRole("textbox", { name: "Add a comment" });
    await user.type(textbox, "@Ali");
    await waitFor(() => expect(signals).toHaveLength(1));
    await user.type(textbox, "ce");

    expect(await screen.findByRole("option", { name: /Alice New/i })).toBeVisible();
    expect(signals[0]?.aborted).toBe(true);
    resolveStale?.(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            items: [
              {
                id: "user-stale",
                displayName: "Stale Result",
                mentionLabel: "Stale Result"
              }
            ]
          }
        }),
        { status: 200 }
      )
    );
    await waitFor(() =>
      expect(screen.queryByRole("option", { name: /Stale Result/i })).not.toBeInTheDocument()
    );
  });

  it("waits for IME composition to end before searching", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            items: [
              {
                id: "user-ime",
                displayName: "あきら",
                mentionLabel: "あきら"
              }
            ]
          }
        }),
        { status: 200 }
      )
    );

    render(
      <MentionCommentComposer
        onCreated={vi.fn()}
        projectId="project-1"
        taskId="task-1"
        workspaceId="workspace-1"
      />
    );
    const textbox = screen.getByRole("textbox", { name: "Add a comment" });
    fireEvent.compositionStart(textbox);
    fireEvent.change(textbox, {
      target: { value: "@あ", selectionStart: 2 }
    });
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    expect(globalThis.fetch).not.toHaveBeenCalled();

    fireEvent.compositionEnd(textbox);
    expect(await screen.findByRole("option", { name: /あきら/i })).toBeVisible();
  });
});

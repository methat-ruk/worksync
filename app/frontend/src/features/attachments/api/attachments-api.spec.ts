import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setRefreshSessionHandler } from "@/lib/api/api-client";
import { ApiError } from "@/lib/api/api-error";
import { setAccessToken } from "@/lib/api/session-token";

import type { PublicAttachment } from "../model/attachment-contract";
import {
  deleteAttachment,
  downloadAttachment,
  listAttachments,
  triggerAttachmentDownload,
  uploadAttachment
} from "./attachments-api";

const scope = {
  workspaceId: "workspace/1",
  projectId: "project-1",
  taskId: "task-1"
};

const attachment: PublicAttachment = {
  id: "attachment-1",
  filename: "diagram.png",
  size: 4,
  contentType: "image/png",
  status: "AVAILABLE",
  creator: { id: "owner-1", displayName: "Owner" },
  createdAt: new Date("2026-09-07T10:00:00.000Z"),
  updatedAt: new Date("2026-09-07T10:00:00.000Z")
};

function attachmentEnvelope(value = attachment): string {
  return JSON.stringify({
    success: true,
    data: { attachment: value }
  });
}

class FakeXMLHttpRequest {
  static instances: FakeXMLHttpRequest[] = [];

  readonly headers = new Map<string, string>();
  readonly upload: {
    onprogress: ((event: ProgressEvent) => void) | null;
  } = { onprogress: null };
  readonly open = vi.fn();
  readonly send = vi.fn((body: Document | XMLHttpRequestBodyInit | null) => {
    this.requestBody = body;
  });
  onabort: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  requestBody: Document | XMLHttpRequestBodyInit | null = null;
  responseText = "";
  status = 0;
  withCredentials = false;

  constructor() {
    FakeXMLHttpRequest.instances.push(this);
  }

  setRequestHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }

  abort(): void {
    this.onabort?.();
  }

  respond(status: number, responseText: string): void {
    this.status = status;
    this.responseText = responseText;
    this.onload?.();
  }
}

describe("attachments API", () => {
  beforeEach(() => {
    FakeXMLHttpRequest.instances = [];
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
    setAccessToken("access-token");
    setRefreshSessionHandler(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("lists a cursor page through the authenticated API client", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { items: [attachment], nextCursor: "next-page" }
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const page = await listAttachments(scope, { cursor: "cursor/value" });

    expect(page.items[0]?.createdAt).toBeInstanceOf(Date);
    expect(page.nextCursor).toBe("next-page");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:4000/api/workspaces/workspace%2F1/projects/project-1/tasks/task-1/attachments?limit=20&cursor=cursor%2Fvalue"
    );
  });

  it("uploads multipart data with progress and without overriding its content type", async () => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], "diagram.png", {
      type: "image/png"
    });
    const onProgress = vi.fn();

    const resultPromise = uploadAttachment(scope, file, {
      idempotencyKey: "stable-key",
      onProgress
    });
    const request = FakeXMLHttpRequest.instances[0]!;
    request.upload.onprogress?.(
      new ProgressEvent("progress", {
        lengthComputable: true,
        loaded: 2,
        total: 4
      })
    );
    request.respond(201, attachmentEnvelope());

    await expect(resultPromise).resolves.toEqual(attachment);
    expect(request.open).toHaveBeenCalledWith(
      "POST",
      "http://localhost:4000/api/workspaces/workspace%2F1/projects/project-1/tasks/task-1/attachments"
    );
    expect(request.withCredentials).toBe(true);
    expect(request.headers).toEqual(
      new Map([
        ["Idempotency-Key", "stable-key"],
        ["X-Upload-Length", "4"],
        ["Authorization", "Bearer access-token"]
      ])
    );
    expect(request.headers.has("Content-Type")).toBe(false);
    expect(request.requestBody).toBeInstanceOf(FormData);
    expect((request.requestBody as FormData).get("file")).toBe(file);
    expect(onProgress).toHaveBeenCalledWith({ loaded: 2, total: 4, percent: 50 });
  });

  it("reuses the file and idempotency key after a shared session refresh", async () => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], "diagram.png", {
      type: "image/png"
    });
    setAccessToken("expired-token");
    setRefreshSessionHandler(async () => {
      setAccessToken("replacement-token");
      return { kind: "refreshed" };
    });

    const resultPromise = uploadAttachment(scope, file, {
      idempotencyKey: "stable-key"
    });
    FakeXMLHttpRequest.instances[0]?.respond(401, "not-json");
    await vi.waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(2));
    FakeXMLHttpRequest.instances[1]?.respond(201, attachmentEnvelope());

    await expect(resultPromise).resolves.toEqual(attachment);
    const [first, retry] = FakeXMLHttpRequest.instances;
    expect(first?.headers.get("Idempotency-Key")).toBe("stable-key");
    expect(retry?.headers.get("Idempotency-Key")).toBe("stable-key");
    expect(first?.headers.get("Authorization")).toBe("Bearer expired-token");
    expect(retry?.headers.get("Authorization")).toBe("Bearer replacement-token");
    expect((first?.requestBody as FormData).get("file")).toBe(file);
    expect((retry?.requestBody as FormData).get("file")).toBe(file);
  });

  it("aborts the active upload and exposes an AbortError", async () => {
    const controller = new AbortController();
    const resultPromise = uploadAttachment(
      scope,
      new File(["png"], "diagram.png", { type: "image/png" }),
      { idempotencyKey: "stable-key", signal: controller.signal }
    );

    controller.abort();

    await expect(resultPromise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("turns a structured upload rejection into an ApiError", async () => {
    const resultPromise = uploadAttachment(
      scope,
      new File(["png"], "diagram.png", { type: "image/png" }),
      { idempotencyKey: "stable-key" }
    );
    FakeXMLHttpRequest.instances[0]?.respond(
      422,
      JSON.stringify({
        success: false,
        message: "Rejected",
        data: { code: "ATTACHMENT_CONTENT_REJECTED" }
      })
    );

    await expect(resultPromise).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      body: { data: { code: "ATTACHMENT_CONTENT_REJECTED" } }
    });
  });

  it("downloads only a response that matches the public metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: {
            "Content-Length": "4",
            "Content-Type": "application/octet-stream"
          }
        })
      )
    );

    const blob = await downloadAttachment(scope, attachment);

    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual([
      1, 2, 3, 4
    ]);
  });

  it("rejects a download whose declared size differs from metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: {
            "Content-Length": "3",
            "Content-Type": "application/octet-stream"
          }
        })
      )
    );

    await expect(downloadAttachment(scope, attachment)).rejects.toThrow(
      "did not match its metadata"
    );
  });

  it("creates a temporary browser download without leaking the object URL", () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn().mockReturnValue("blob:attachment");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    triggerAttachmentDownload(new Blob(["file"]), "diagram.png");

    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector("a[download]")).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:attachment");
  });

  it("accepts only a 204 delete response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteAttachment(scope, attachment.id)).resolves.toBeUndefined();
    await expect(deleteAttachment(scope, attachment.id)).rejects.toBeInstanceOf(
      ApiError
    );
  });
});

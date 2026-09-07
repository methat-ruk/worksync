import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/api-error";

import {
  deleteAttachment,
  downloadAttachment,
  listAttachments,
  triggerAttachmentDownload,
  uploadAttachment
} from "../api/attachments-api";
import type { PublicAttachment } from "../model/attachment-contract";
import { AttachmentSection } from "./attachment-section";

vi.mock("../api/attachments-api", () => ({
  deleteAttachment: vi.fn(),
  downloadAttachment: vi.fn(),
  listAttachments: vi.fn(),
  triggerAttachmentDownload: vi.fn(),
  uploadAttachment: vi.fn()
}));

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

const defaultProps = {
  actorId: "owner-1",
  membershipRole: "OWNER" as const,
  projectId: "project-1",
  taskId: "task-1",
  workspaceId: "workspace-1"
};

function page(items: PublicAttachment[], nextCursor: string | null = null) {
  return { items, nextCursor };
}

describe("AttachmentSection", () => {
  beforeEach(() => {
    vi.mocked(deleteAttachment).mockReset();
    vi.mocked(downloadAttachment).mockReset();
    vi.mocked(listAttachments).mockReset();
    vi.mocked(triggerAttachmentDownload).mockReset();
    vi.mocked(uploadAttachment).mockReset();
    vi.mocked(listAttachments).mockResolvedValue(page([]));
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000000"
    );
  });

  it("keeps viewers upload-read-only while retaining list and download", async () => {
    vi.mocked(listAttachments).mockResolvedValue(
      page([
        {
          ...attachment,
          creator: { id: "another-user", displayName: "Another user" }
        }
      ])
    );

    render(<AttachmentSection {...defaultProps} membershipRole="VIEWER" />);

    expect(await screen.findByText("diagram.png")).toBeVisible();
    expect(screen.queryByLabelText("Choose an image")).not.toBeInTheDocument();
    expect(screen.getByText(/VIEWER role can download/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Download" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Delete diagram.png" })
    ).not.toBeInTheDocument();
  });

  it("shows members delete only for attachments they created", async () => {
    vi.mocked(listAttachments).mockResolvedValue(
      page([
        attachment,
        {
          ...attachment,
          id: "attachment-2",
          filename: "other.png",
          creator: { id: "another-user", displayName: "Another user" }
        },
        {
          ...attachment,
          id: "attachment-3",
          filename: "former-member.png",
          creator: null
        }
      ])
    );

    render(<AttachmentSection {...defaultProps} membershipRole="MEMBER" />);

    expect(
      await screen.findByRole("button", { name: "Delete diagram.png" })
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Delete other.png" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete former-member.png" })
    ).not.toBeInTheDocument();
  });

  it("validates a file before offering upload", async () => {
    render(<AttachmentSection {...defaultProps} />);
    await screen.findByText("No attachments yet");

    fireEvent.change(screen.getByLabelText("Choose an image"), {
      target: {
        files: [new File(["text"], "notes.txt", { type: "text/plain" })]
      }
    });

    expect(
      screen.getByText(/Choose a PNG or JPEG whose extension matches/)
    ).toBeVisible();
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  it("announces real progress and refreshes the list after upload", async () => {
    const user = userEvent.setup();
    let reportProgress:
      | ((progress: { loaded: number; total: number | null; percent: number | null }) => void)
      | undefined;
    let resolveUpload!: (value: PublicAttachment) => void;
    vi.mocked(listAttachments)
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(page([attachment]));
    vi.mocked(uploadAttachment).mockImplementation(
      (_scope, _file, options) =>
        new Promise((resolve) => {
          reportProgress = options.onProgress;
          resolveUpload = resolve;
        })
    );
    render(<AttachmentSection {...defaultProps} />);
    await screen.findByText("No attachments yet");

    const file = new File([new Uint8Array([137, 80, 78, 71])], "diagram.png", {
      type: "image/png"
    });
    await user.upload(screen.getByLabelText("Choose an image"), file);
    await user.click(screen.getByRole("button", { name: "Upload attachment" }));

    act(() => reportProgress?.({ loaded: 2, total: 4, percent: 50 }));
    expect(screen.getByText("50%")).toBeVisible();
    resolveUpload(attachment);

    await waitFor(() =>
      expect(uploadAttachment).toHaveBeenCalledWith(
        {
          workspaceId: "workspace-1",
          projectId: "project-1",
          taskId: "task-1"
        },
        file,
        expect.objectContaining({
          idempotencyKey: "00000000-0000-4000-8000-000000000000"
        })
      )
    );
    expect(await screen.findByText("diagram.png uploaded.")).toBeVisible();
    expect(screen.getByText("diagram.png")).toBeVisible();
    expect(listAttachments).toHaveBeenCalledTimes(2);
  });

  it("cancels an active upload and offers a safe retry", async () => {
    const user = userEvent.setup();
    vi.mocked(uploadAttachment).mockImplementation(
      (_scope, _file, options) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Canceled", "AbortError")),
            { once: true }
          );
        })
    );
    render(<AttachmentSection {...defaultProps} />);
    await screen.findByText("No attachments yet");
    await user.upload(
      screen.getByLabelText("Choose an image"),
      new File([new Uint8Array([137, 80, 78, 71])], "diagram.png", {
        type: "image/png"
      })
    );
    await user.click(screen.getByRole("button", { name: "Upload attachment" }));

    await user.click(screen.getByRole("button", { name: "Cancel upload" }));

    expect(await screen.findByRole("button", { name: "Retry upload" })).toBeEnabled();
    expect(screen.getByText(/Upload canceled locally/)).toBeVisible();
    expect(listAttachments).toHaveBeenCalledTimes(2);
  });

  it("reuses the same idempotency key for a safe retry", async () => {
    const user = userEvent.setup();
    vi.mocked(uploadAttachment)
      .mockRejectedValueOnce(
        new ApiError(503, {
          success: false,
          message: "Unavailable",
          data: { code: "ATTACHMENT_STORAGE_UNAVAILABLE" }
        })
      )
      .mockResolvedValueOnce(attachment);
    render(<AttachmentSection {...defaultProps} />);
    await screen.findByText("No attachments yet");
    await user.upload(
      screen.getByLabelText("Choose an image"),
      new File([new Uint8Array([137, 80, 78, 71])], "diagram.png", {
        type: "image/png"
      })
    );

    await user.click(screen.getByRole("button", { name: "Upload attachment" }));
    await user.click(await screen.findByRole("button", { name: "Retry upload" }));

    await waitFor(() => expect(uploadAttachment).toHaveBeenCalledTimes(2));
    const firstOptions = vi.mocked(uploadAttachment).mock.calls[0]?.[2];
    const retryOptions = vi.mocked(uploadAttachment).mock.calls[1]?.[2];
    expect(firstOptions?.idempotencyKey).toBe(
      "00000000-0000-4000-8000-000000000000"
    );
    expect(retryOptions?.idempotencyKey).toBe(firstOptions?.idempotencyKey);
  });

  it("downloads available bytes using the validated public filename", async () => {
    const user = userEvent.setup();
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])]);
    vi.mocked(listAttachments).mockResolvedValue(page([attachment]));
    vi.mocked(downloadAttachment).mockResolvedValue(blob);
    render(<AttachmentSection {...defaultProps} />);

    await user.click(await screen.findByRole("button", { name: "Download" }));

    await waitFor(() =>
      expect(triggerAttachmentDownload).toHaveBeenCalledWith(blob, "diagram.png")
    );
  });

  it("confirms permanent deletion and removes the item after success", async () => {
    const user = userEvent.setup();
    vi.mocked(listAttachments).mockResolvedValue(page([attachment]));
    vi.mocked(deleteAttachment).mockResolvedValue();
    render(<AttachmentSection {...defaultProps} />);

    await user.click(
      await screen.findByRole("button", { name: "Delete diagram.png" })
    );
    expect(screen.getByText("Delete diagram.png?")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Delete attachment" }));

    await waitFor(() =>
      expect(deleteAttachment).toHaveBeenCalledWith(
        {
          workspaceId: "workspace-1",
          projectId: "project-1",
          taskId: "task-1"
        },
        attachment.id,
        expect.any(AbortSignal)
      )
    );
    expect(await screen.findByText("diagram.png deleted.")).toBeVisible();
    expect(screen.queryByText("Owner")).not.toBeInTheDocument();
  });

  it("keeps DELETE_FAILED unavailable while allowing authorized cleanup retry", async () => {
    vi.mocked(listAttachments).mockResolvedValue(
      page([{ ...attachment, status: "DELETE_FAILED" }])
    );

    render(<AttachmentSection {...defaultProps} />);

    expect(await screen.findByRole("button", { name: "Download" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Retry delete diagram.png" })
    ).toBeEnabled();
    expect(screen.getByText(/cannot be downloaded/)).toBeVisible();
  });
});

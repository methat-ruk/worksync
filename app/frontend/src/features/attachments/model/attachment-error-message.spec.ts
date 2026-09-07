import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/api-error";

import {
  attachmentErrorMessage,
  isAttachmentAbortError
} from "./attachment-error-message";

describe("attachment error messages", () => {
  it("maps stable public codes without exposing backend detail", () => {
    const error = new ApiError(503, {
      success: false,
      message: "s3.internal.example refused secret-object-key",
      data: { code: "ATTACHMENT_STORAGE_UNAVAILABLE" }
    });

    expect(attachmentErrorMessage(error)).toBe(
      "Attachment storage is temporarily unavailable. Please retry."
    );
    expect(attachmentErrorMessage(error)).not.toContain("secret-object-key");
  });

  it("uses a generic message for unknown failures", () => {
    expect(attachmentErrorMessage(new Error("private detail"))).toBe(
      "Something went wrong with attachments. Please try again."
    );
  });

  it("recognizes abort-shaped errors across browser realms", () => {
    expect(isAttachmentAbortError({ name: "AbortError" })).toBe(true);
    expect(isAttachmentAbortError({ name: "NetworkError" })).toBe(false);
    expect(isAttachmentAbortError(null)).toBe(false);
  });
});

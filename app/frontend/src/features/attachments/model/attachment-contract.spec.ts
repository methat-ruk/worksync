import { describe, expect, it } from "vitest";

import {
  MAX_ATTACHMENT_BYTES,
  attachmentListResponseSchema,
  validateAttachmentSelection
} from "./attachment-contract";

function imageFile(
  name: string,
  type: string,
  bytes: number[] = [137, 80, 78, 71]
): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("attachment contract", () => {
  it("parses public attachments with a nullable creator and dates", () => {
    const parsed = attachmentListResponseSchema.parse({
      success: true,
      data: {
        items: [
          {
            id: "attachment-1",
            filename: "diagram.png",
            size: 4,
            contentType: "image/png",
            status: "AVAILABLE",
            creator: null,
            createdAt: "2026-09-07T10:00:00.000Z",
            updatedAt: "2026-09-07T10:00:00.000Z"
          }
        ],
        nextCursor: null
      }
    });

    expect(parsed.data.items[0]?.creator).toBeNull();
    expect(parsed.data.items[0]?.createdAt).toBeInstanceOf(Date);
  });

  it.each([
    [null, "Choose a PNG or JPEG file."],
    [imageFile("empty.png", "image/png", []), "The selected file is empty."],
    [imageFile("photo.jpg", "image/png"), "extension matches its file type"],
    [imageFile("folder/photo.png", "image/png"), "unsupported characters"],
    [imageFile(`${"ก".repeat(86)}.png`, "image/png"), "unsupported characters"]
  ])("rejects an invalid local selection", (file, message) => {
    const result = validateAttachmentSelection(file);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toContain(message);
    }
  });

  it("rejects files over the public upload limit", () => {
    const oversized = new File(
      [new Uint8Array(MAX_ATTACHMENT_BYTES + 1)],
      "large.png",
      { type: "image/png" }
    );

    expect(validateAttachmentSelection(oversized)).toEqual({
      success: false,
      message: "The selected file must be 10 MiB or smaller."
    });
  });

  it.each([
    imageFile("diagram.png", "image/png"),
    imageFile("photo.jpg", "image/jpeg", [255, 216, 255]),
    imageFile("photo.jpeg", "image/jpeg", [255, 216, 255])
  ])("accepts a supported image selection", (file) => {
    expect(validateAttachmentSelection(file)).toEqual({ success: true, file });
  });
});

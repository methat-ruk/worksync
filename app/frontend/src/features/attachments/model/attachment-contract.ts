import { z } from "zod";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENT_FILENAME_BYTES = 255;
export const ATTACHMENT_PAGE_SIZE = 20;

export const attachmentContentTypeSchema = z.enum(["image/png", "image/jpeg"]);
export const attachmentStatusSchema = z.enum(["AVAILABLE", "DELETE_FAILED"]);

const publicAttachmentCreatorSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1)
});

export const publicAttachmentSchema = z.object({
  id: z.string().min(1),
  filename: z
    .string()
    .min(1)
    .refine(
      (filename) =>
        new TextEncoder().encode(filename).byteLength <=
        MAX_ATTACHMENT_FILENAME_BYTES,
      "Attachment filename is too long"
    ),
  size: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
  contentType: attachmentContentTypeSchema,
  status: attachmentStatusSchema,
  creator: publicAttachmentCreatorSchema.nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

export const attachmentListResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(publicAttachmentSchema).max(50),
    nextCursor: z.string().min(1).nullable()
  })
});

export const attachmentResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z.object({ attachment: publicAttachmentSchema })
});

export type PublicAttachment = z.infer<typeof publicAttachmentSchema>;
export type AttachmentListData = z.infer<
  typeof attachmentListResponseSchema
>["data"];

export type AttachmentSelectionResult =
  | { success: true; file: File }
  | { success: false; message: string };

const unsafeFilenamePattern =
  /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;

export function validateAttachmentSelection(
  file: File | null
): AttachmentSelectionResult {
  if (!file) {
    return { success: false, message: "Choose a PNG or JPEG file." };
  }
  if (file.size === 0) {
    return { success: false, message: "The selected file is empty." };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return {
      success: false,
      message: "The selected file must be 10 MiB or smaller."
    };
  }

  const normalizedFilename = file.name.normalize("NFC").trim();
  if (
    normalizedFilename.length === 0 ||
    normalizedFilename.includes("/") ||
    normalizedFilename.includes("\\") ||
    unsafeFilenamePattern.test(normalizedFilename) ||
    new TextEncoder().encode(normalizedFilename).byteLength >
      MAX_ATTACHMENT_FILENAME_BYTES
  ) {
    return {
      success: false,
      message: "The selected filename contains unsupported characters or is too long."
    };
  }

  const extension = normalizedFilename
    .slice(normalizedFilename.lastIndexOf("."))
    .toLowerCase();
  const matchesPng = extension === ".png" && file.type === "image/png";
  const matchesJpeg =
    (extension === ".jpg" || extension === ".jpeg") &&
    file.type === "image/jpeg";
  if (!matchesPng && !matchesJpeg) {
    return {
      success: false,
      message: "Choose a PNG or JPEG whose extension matches its file type."
    };
  }

  return { success: true, file };
}

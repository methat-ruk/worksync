import { createHash } from "node:crypto";
import { Transform, type TransformCallback } from "node:stream";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_TASK = 20;
export const MAX_WORKSPACE_ATTACHMENT_BYTES = 1024 * 1024 * 1024;
export const MAX_PENDING_ATTACHMENTS_PER_ACTOR = 3;
export const MAX_PENDING_ATTACHMENTS_PER_WORKSPACE = 20;

export const ATTACHMENT_CONTENT_TYPES = ["image/png", "image/jpeg"] as const;
export type AttachmentContentType = (typeof ATTACHMENT_CONTENT_TYPES)[number];

export class AttachmentPolicyError extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
    this.name = "AttachmentPolicyError";
  }
}

function hasUnsafeFilenameCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      codePoint !== undefined &&
      (codePoint <= 0x1f ||
        (codePoint >= 0x7f && codePoint <= 0x9f) ||
        (codePoint >= 0x202a && codePoint <= 0x202e) ||
        (codePoint >= 0x2066 && codePoint <= 0x2069))
    );
  });
}

export function normalizeAttachmentFilename(value: string): string {
  const filename = value.normalize("NFC").trim();
  if (
    filename.length === 0 ||
    filename.includes("/") ||
    filename.includes("\\") ||
    hasUnsafeFilenameCharacter(filename) ||
    Buffer.byteLength(filename, "utf8") > 255
  ) {
    throw new AttachmentPolicyError("INVALID_FILENAME");
  }
  return filename;
}

export function validateDeclaredAttachmentType(
  filename: string,
  contentType: string
): AttachmentContentType {
  const normalizedContentType = contentType.toLowerCase();
  const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  if (extension === ".png" && normalizedContentType === "image/png") {
    return "image/png";
  }
  if (
    (extension === ".jpg" || extension === ".jpeg") &&
    normalizedContentType === "image/jpeg"
  ) {
    return "image/jpeg";
  }
  throw new AttachmentPolicyError("UNSUPPORTED_CONTENT_TYPE");
}

function detectContentType(signature: Buffer): AttachmentContentType {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (signature.length >= png.length && signature.subarray(0, 8).equals(png)) {
    return "image/png";
  }
  if (
    signature.length >= 3 &&
    signature[0] === 0xff &&
    signature[1] === 0xd8 &&
    signature[2] === 0xff
  ) {
    return "image/jpeg";
  }
  throw new AttachmentPolicyError("CONTENT_SIGNATURE_MISMATCH");
}

export type InspectedAttachment = Readonly<{
  authoritativeSize: number;
  detectedContentType: AttachmentContentType;
  sha256: string;
}>;

export class AttachmentInspectionTransform extends Transform {
  private readonly hash = createHash("sha256");
  private readonly signatureChunks: Buffer[] = [];
  private signatureLength = 0;
  private authoritativeSize = 0;
  private detectedContentType?: AttachmentContentType;

  constructor(
    private readonly declaredContentType: AttachmentContentType,
    private readonly declaredSize: number
  ) {
    super();
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback
  ): void {
    try {
      this.authoritativeSize += chunk.length;
      if (
        this.authoritativeSize > MAX_ATTACHMENT_BYTES ||
        this.authoritativeSize > this.declaredSize
      ) {
        throw new AttachmentPolicyError("SIZE_MISMATCH");
      }
      this.hash.update(chunk);
      if (this.signatureLength < 8) {
        const needed = 8 - this.signatureLength;
        const part = chunk.subarray(0, needed);
        this.signatureChunks.push(part);
        this.signatureLength += part.length;
        if (this.signatureLength >= 8) {
          this.validateSignature();
        }
      }
      callback(null, chunk);
    } catch (error: unknown) {
      callback(error instanceof Error ? error : new Error("Inspection failed"));
    }
  }

  override _flush(callback: TransformCallback): void {
    try {
      if (this.authoritativeSize !== this.declaredSize) {
        throw new AttachmentPolicyError("SIZE_MISMATCH");
      }
      if (!this.detectedContentType) {
        this.validateSignature();
      }
      callback();
    } catch (error: unknown) {
      callback(error instanceof Error ? error : new Error("Inspection failed"));
    }
  }

  result(): InspectedAttachment {
    if (!this.detectedContentType || this.authoritativeSize !== this.declaredSize) {
      throw new AttachmentPolicyError("INCOMPLETE_INSPECTION");
    }
    return {
      authoritativeSize: this.authoritativeSize,
      detectedContentType: this.detectedContentType,
      sha256: this.hash.digest("hex")
    };
  }

  private validateSignature(): void {
    const detected = detectContentType(Buffer.concat(this.signatureChunks));
    if (detected !== this.declaredContentType) {
      throw new AttachmentPolicyError("CONTENT_SIGNATURE_MISMATCH");
    }
    this.detectedContentType = detected;
  }
}

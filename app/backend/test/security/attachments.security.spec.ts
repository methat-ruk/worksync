import { WorkspaceRole } from "../../src/generated/prisma/client";
import {
  canDeleteAttachment,
  canUploadAttachment
} from "../../src/attachments/attachment.policy";
import {
  AttachmentPolicyError,
  normalizeAttachmentFilename,
  validateDeclaredAttachmentType
} from "../../src/attachments/attachment-policy";

describe("attachment security boundary", () => {
  it("keeps viewer upload and peer deletion outside authority", () => {
    expect(canUploadAttachment(WorkspaceRole.VIEWER)).toBe(false);
    expect(
      canDeleteAttachment(WorkspaceRole.MEMBER, "attacker", "uploader")
    ).toBe(false);
  });

  it.each([
    "../secret.png",
    "folder/secret.png",
    "folder\\secret.png",
    "header\r\ninjection.png",
    "direction\u202echange.png"
  ])("rejects filename injection input %p", (filename) => {
    expect(() => normalizeAttachmentFilename(filename)).toThrow(
      AttachmentPolicyError
    );
  });

  it("does not trust active or mismatched declared content", () => {
    expect(() => validateDeclaredAttachmentType("payload.svg", "image/svg+xml"))
      .toThrow(AttachmentPolicyError);
    expect(() => validateDeclaredAttachmentType("payload.png", "text/html")).toThrow(
      AttachmentPolicyError
    );
  });
});

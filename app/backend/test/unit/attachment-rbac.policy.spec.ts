import { WorkspaceRole } from "../../src/generated/prisma/client";
import {
  canDeleteAttachment,
  canUploadAttachment
} from "../../src/attachments/attachment.policy";

describe("attachment role policy", () => {
  it.each([
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MEMBER
  ])("allows %s to upload", (role) => {
    expect(canUploadAttachment(role)).toBe(true);
  });

  it("keeps viewers read-only", () => {
    expect(canUploadAttachment(WorkspaceRole.VIEWER)).toBe(false);
  });

  it("allows uploaders and elevated roles to delete", () => {
    expect(canDeleteAttachment(WorkspaceRole.MEMBER, "user-1", "user-1")).toBe(
      true
    );
    expect(canDeleteAttachment(WorkspaceRole.MEMBER, "user-1", "user-2")).toBe(
      false
    );
    expect(canDeleteAttachment(WorkspaceRole.ADMIN, "user-1", "user-2")).toBe(
      true
    );
    expect(canDeleteAttachment(WorkspaceRole.OWNER, "user-1", null)).toBe(true);
  });
});

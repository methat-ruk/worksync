import { WorkspaceRole } from "../../src/generated/prisma/client";
import { canCreateComment } from "../../src/comments/comment.policy";

describe("comment role policy", () => {
  it.each([
    [WorkspaceRole.OWNER, true],
    [WorkspaceRole.ADMIN, true],
    [WorkspaceRole.MEMBER, true],
    [WorkspaceRole.VIEWER, false]
  ])("maps %s comment creation permission", (role, expected) => {
    expect(canCreateComment(role)).toBe(expected);
  });
});

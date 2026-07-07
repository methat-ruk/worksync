import { WorkspaceRole } from "../../src/generated/prisma/client";
import {
  canAddWorkspaceMember,
  canListWorkspaceMembers,
  canRemoveWorkspaceMember,
  canUpdateWorkspaceMember
} from "../../src/workspaces/workspace-rbac.policy";

describe("workspace RBAC policy", () => {
  it("allows only owners and admins to list members", () => {
    expect(canListWorkspaceMembers(WorkspaceRole.OWNER)).toBe(true);
    expect(canListWorkspaceMembers(WorkspaceRole.ADMIN)).toBe(true);
    expect(canListWorkspaceMembers(WorkspaceRole.MEMBER)).toBe(false);
    expect(canListWorkspaceMembers(WorkspaceRole.VIEWER)).toBe(false);
  });

  it("keeps owner role creation out of member management", () => {
    expect(
      canAddWorkspaceMember(WorkspaceRole.OWNER, WorkspaceRole.OWNER)
    ).toBe(false);
    expect(
      canAddWorkspaceMember(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
    ).toBe(true);
    expect(
      canAddWorkspaceMember(WorkspaceRole.ADMIN, WorkspaceRole.ADMIN)
    ).toBe(false);
    expect(
      canAddWorkspaceMember(WorkspaceRole.ADMIN, WorkspaceRole.MEMBER)
    ).toBe(true);
  });

  it("prevents self role changes and owner demotion", () => {
    expect(
      canUpdateWorkspaceMember(
        WorkspaceRole.OWNER,
        WorkspaceRole.ADMIN,
        WorkspaceRole.MEMBER,
        true
      )
    ).toBe(false);
    expect(
      canUpdateWorkspaceMember(
        WorkspaceRole.OWNER,
        WorkspaceRole.OWNER,
        WorkspaceRole.ADMIN,
        false
      )
    ).toBe(false);
    expect(
      canUpdateWorkspaceMember(
        WorkspaceRole.OWNER,
        WorkspaceRole.ADMIN,
        WorkspaceRole.VIEWER,
        false
      )
    ).toBe(true);
  });

  it("limits admin changes to member and viewer targets", () => {
    expect(
      canUpdateWorkspaceMember(
        WorkspaceRole.ADMIN,
        WorkspaceRole.MEMBER,
        WorkspaceRole.VIEWER,
        false
      )
    ).toBe(true);
    expect(
      canUpdateWorkspaceMember(
        WorkspaceRole.ADMIN,
        WorkspaceRole.ADMIN,
        WorkspaceRole.MEMBER,
        false
      )
    ).toBe(false);
    expect(
      canRemoveWorkspaceMember(
        WorkspaceRole.ADMIN,
        WorkspaceRole.VIEWER,
        false
      )
    ).toBe(true);
    expect(
      canRemoveWorkspaceMember(
        WorkspaceRole.ADMIN,
        WorkspaceRole.OWNER,
        false
      )
    ).toBe(false);
  });
});

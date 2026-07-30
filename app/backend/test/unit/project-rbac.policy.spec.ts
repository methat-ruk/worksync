import { WorkspaceRole } from "../../src/generated/prisma/client";
import {
  canCreateProject,
  canUpdateProject
} from "../../src/projects/project-rbac.policy";

describe("project RBAC policy", () => {
  it.each([
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MEMBER
  ])("allows %s to create and update projects", (role) => {
    expect(canCreateProject(role)).toBe(true);
    expect(canUpdateProject(role)).toBe(true);
  });

  it("keeps viewers read-only", () => {
    expect(canCreateProject(WorkspaceRole.VIEWER)).toBe(false);
    expect(canUpdateProject(WorkspaceRole.VIEWER)).toBe(false);
  });
});

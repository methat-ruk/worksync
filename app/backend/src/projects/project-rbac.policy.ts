import { WorkspaceRole } from "../generated/prisma/client";

const PROJECT_EDITOR_ROLES = new Set<WorkspaceRole>([
  WorkspaceRole.OWNER,
  WorkspaceRole.ADMIN,
  WorkspaceRole.MEMBER
]);

export function canCreateProject(role: WorkspaceRole): boolean {
  return PROJECT_EDITOR_ROLES.has(role);
}

export function canUpdateProject(role: WorkspaceRole): boolean {
  return PROJECT_EDITOR_ROLES.has(role);
}

import { WorkspaceRole } from "../generated/prisma/client";

const TASK_EDITOR_ROLES = new Set<WorkspaceRole>([
  WorkspaceRole.OWNER,
  WorkspaceRole.ADMIN,
  WorkspaceRole.MEMBER
]);

export function canMutateTask(role: WorkspaceRole): boolean {
  return TASK_EDITOR_ROLES.has(role);
}

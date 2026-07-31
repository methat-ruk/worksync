import { WorkspaceRole } from "../generated/prisma/client";

const TASK_EDITOR_ROLES = new Set<WorkspaceRole>([
  WorkspaceRole.OWNER,
  WorkspaceRole.ADMIN,
  WorkspaceRole.MEMBER
]);

const TASK_READER_ROLES = new Set<WorkspaceRole>([
  ...TASK_EDITOR_ROLES,
  WorkspaceRole.VIEWER
]);

export function canReadTask(role: WorkspaceRole): boolean {
  return TASK_READER_ROLES.has(role);
}

export function canMutateTask(role: WorkspaceRole): boolean {
  return TASK_EDITOR_ROLES.has(role);
}

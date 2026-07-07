import { WorkspaceRole } from "../generated/prisma/client";

const OWNER_MANAGED_ROLES = new Set<WorkspaceRole>([
  WorkspaceRole.ADMIN,
  WorkspaceRole.MEMBER,
  WorkspaceRole.VIEWER
]);
const ADMIN_MANAGED_ROLES = new Set<WorkspaceRole>([
  WorkspaceRole.MEMBER,
  WorkspaceRole.VIEWER
]);

export function canListWorkspaceMembers(actorRole: WorkspaceRole): boolean {
  return actorRole === WorkspaceRole.OWNER || actorRole === WorkspaceRole.ADMIN;
}

export function canAddWorkspaceMember(
  actorRole: WorkspaceRole,
  role: WorkspaceRole
): boolean {
  if (actorRole === WorkspaceRole.OWNER) {
    return OWNER_MANAGED_ROLES.has(role);
  }

  if (actorRole === WorkspaceRole.ADMIN) {
    return ADMIN_MANAGED_ROLES.has(role);
  }

  return false;
}

export function canUpdateWorkspaceMember(
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole,
  nextRole: WorkspaceRole,
  isSelf: boolean
): boolean {
  if (isSelf) {
    return false;
  }

  if (actorRole === WorkspaceRole.OWNER) {
    return OWNER_MANAGED_ROLES.has(targetRole) && OWNER_MANAGED_ROLES.has(nextRole);
  }

  if (actorRole === WorkspaceRole.ADMIN) {
    return (
      ADMIN_MANAGED_ROLES.has(targetRole) && ADMIN_MANAGED_ROLES.has(nextRole)
    );
  }

  return false;
}

export function canRemoveWorkspaceMember(
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole,
  isSelf: boolean
): boolean {
  if (isSelf) {
    return false;
  }

  if (actorRole === WorkspaceRole.OWNER) {
    return OWNER_MANAGED_ROLES.has(targetRole);
  }

  if (actorRole === WorkspaceRole.ADMIN) {
    return ADMIN_MANAGED_ROLES.has(targetRole);
  }

  return false;
}

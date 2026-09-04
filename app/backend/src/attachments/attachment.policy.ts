import { WorkspaceRole } from "../generated/prisma/client";

const ATTACHMENT_WRITER_ROLES = new Set<WorkspaceRole>([
  WorkspaceRole.OWNER,
  WorkspaceRole.ADMIN,
  WorkspaceRole.MEMBER
]);

export function canUploadAttachment(role: WorkspaceRole): boolean {
  return ATTACHMENT_WRITER_ROLES.has(role);
}

export function canDeleteAttachment(
  role: WorkspaceRole,
  actorId: string,
  creatorId: string | null
): boolean {
  return (
    role === WorkspaceRole.OWNER ||
    role === WorkspaceRole.ADMIN ||
    creatorId === actorId
  );
}

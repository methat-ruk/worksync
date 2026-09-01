import { WorkspaceRole } from "../generated/prisma/client";

export function canCreateComment(role: WorkspaceRole): boolean {
  return role !== WorkspaceRole.VIEWER;
}

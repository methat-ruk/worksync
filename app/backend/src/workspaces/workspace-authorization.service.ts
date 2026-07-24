import { Injectable, NotFoundException } from "@nestjs/common";

import { API_ERROR_CODE } from "../common/errors/api-error-code";
import { PrismaService } from "../database/prisma.service";
import type { Prisma, WorkspaceRole } from "../generated/prisma/client";

const WORKSPACE_ACTOR_SELECT = {
  workspaceId: true,
  userId: true,
  role: true
} satisfies Prisma.WorkspaceMemberSelect;

export type WorkspaceActor = Readonly<{
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}>;

@Injectable()
export class WorkspaceAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async requireActor(
    userId: string,
    workspaceId: string,
    database: PrismaService | Prisma.TransactionClient = this.prisma
  ): Promise<WorkspaceActor> {
    const membership = await database.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId
        }
      },
      select: WORKSPACE_ACTOR_SELECT
    });
    if (!membership) {
      throw new NotFoundException({
        message: "Workspace not found",
        code: API_ERROR_CODE.RESOURCE_NOT_FOUND
      });
    }

    return {
      workspaceId: membership.workspaceId,
      userId: membership.userId,
      role: membership.role
    };
  }
}

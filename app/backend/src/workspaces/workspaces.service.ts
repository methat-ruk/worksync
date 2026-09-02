import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { randomBytes } from "node:crypto";

import { API_ERROR_CODE } from "../common/errors/api-error-code";
import { PrismaService } from "../database/prisma.service";
import {
  runSerializableTransaction,
  SerializableTransactionExhaustedError
} from "../database/serializable-transaction";
import { Prisma, WorkspaceRole } from "../generated/prisma/client";
import type {
  AddWorkspaceMemberRequestDto,
  CreateWorkspaceRequestDto,
  ListWorkspaceMembersQueryDto,
  ListWorkspacesQueryDto,
  PublicWorkspaceMemberDto,
  PublicWorkspaceDto,
  UpdateWorkspaceMemberRequestDto,
  WorkspaceMemberListDataDto,
  WorkspaceListDataDto
} from "./dto/workspace.dto";
import {
  canAddWorkspaceMember,
  canListWorkspaceMembers,
  canRemoveWorkspaceMember,
  canUpdateWorkspaceMember
} from "./workspace-rbac.policy";
import { WorkspaceAuthorizationService } from "./workspace-authorization.service";

const WORKSPACE_SELECT = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
  members: {
    select: { role: true }
  }
} satisfies Prisma.WorkspaceSelect;

type WorkspaceRecord = Prisma.WorkspaceGetPayload<{
  select: typeof WORKSPACE_SELECT;
}>;

const WORKSPACE_MEMBER_SELECT = {
  id: true,
  userId: true,
  role: true,
  createdAt: true,
  user: {
    select: {
      email: true,
      displayName: true
    }
  }
} satisfies Prisma.WorkspaceMemberSelect;

type WorkspaceMemberRecord = Prisma.WorkspaceMemberGetPayload<{
  select: typeof WORKSPACE_MEMBER_SELECT;
}>;

type WorkspaceMemberTarget = {
  id: string;
  userId: string;
  role: WorkspaceRole;
};

const SLUG_BASE_MAX_LENGTH = 80;
const SLUG_RANDOM_SUFFIX_BYTES = 4;
const RANDOM_SLUG_ATTEMPTS = 10;
const DETERMINISTIC_SLUG_SUFFIXES = [2, 3, 4, 5] as const;

function baseSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_BASE_MAX_LENGTH)
    .replace(/-+$/g, "");

  return slug || "workspace";
}

function appendSlugSuffix(base: string, suffix: string): string {
  const maxBaseLength = SLUG_BASE_MAX_LENGTH - suffix.length - 1;
  const boundedBase =
    base.slice(0, maxBaseLength).replace(/-+$/g, "") || "workspace";
  return `${boundedBase}-${suffix}`;
}

function deterministicSlugCandidates(base: string): string[] {
  return [
    base,
    ...DETERMINISTIC_SLUG_SUFFIXES.map((suffix) =>
      appendSlugSuffix(base, String(suffix))
    )
  ];
}

function randomSlugCandidate(base: string): string {
  return appendSlugSuffix(
    base,
    randomBytes(SLUG_RANDOM_SUFFIX_BYTES).toString("hex")
  );
}

function isUniqueConstraint(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function toPublicWorkspace(workspace: WorkspaceRecord): PublicWorkspaceDto {
  const membershipRole = workspace.members[0]?.role;
  if (!membershipRole) {
    throw new NotFoundException({
      message: "Workspace not found",
      code: API_ERROR_CODE.RESOURCE_NOT_FOUND
    });
  }

  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    membershipRole
  };
}

function toPublicWorkspaceMember(
  member: WorkspaceMemberRecord
): PublicWorkspaceMemberDto {
  return {
    id: member.id,
    userId: member.userId,
    email: member.user.email,
    displayName: member.user.displayName,
    role: member.role,
    createdAt: member.createdAt
  };
}

function notFound(message: string): NotFoundException {
  return new NotFoundException({
    message,
    code: API_ERROR_CODE.RESOURCE_NOT_FOUND
  });
}

function forbidden(): ForbiddenException {
  return new ForbiddenException({
    message: "Not authorized for this workspace action",
    code: API_ERROR_CODE.AUTHORIZATION_DENIED
  });
}

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceAuthorization: WorkspaceAuthorizationService
  ) {}

  async create(
    userId: string,
    input: CreateWorkspaceRequestDto
  ): Promise<PublicWorkspaceDto> {
    const name = input.name.trim();
    const base = baseSlug(name);

    for (const slug of deterministicSlugCandidates(base)) {
      try {
        return await this.createWithSlug(userId, name, slug);
      } catch (error: unknown) {
        if (isUniqueConstraint(error)) {
          continue;
        }

        throw error;
      }
    }

    for (let attempt = 0; attempt < RANDOM_SLUG_ATTEMPTS; attempt += 1) {
      try {
        return await this.createWithSlug(
          userId,
          name,
          randomSlugCandidate(base)
        );
      } catch (error: unknown) {
        if (isUniqueConstraint(error)) {
          continue;
        }

        throw error;
      }
    }

    throw new ConflictException({
      message: "Workspace slug is already in use",
      code: API_ERROR_CODE.RESOURCE_CONFLICT
    });
  }

  async list(
    userId: string,
    query: ListWorkspacesQueryDto
  ): Promise<WorkspaceListDataDto> {
    const page = query.page;
    const pageSize = query.pageSize;
    const skip = (page - 1) * pageSize;
    const where = { members: { some: { userId } } };

    const { items, total } = await this.prisma.$transaction(
      async (transaction) => {
        const totalCount = await transaction.workspace.count({ where });
        const workspaces = await transaction.workspace.findMany({
          where,
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          skip,
          take: pageSize,
          select: {
            ...WORKSPACE_SELECT,
            members: {
              where: { userId },
              select: { role: true },
              take: 1
            }
          }
        });

        return {
          total: totalCount,
          items: workspaces.map(toPublicWorkspace)
        };
      }
    );

    return { items, page, pageSize, total };
  }

  async read(userId: string, workspaceId: string): Promise<PublicWorkspaceDto> {
    const workspace = await this.prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        members: { some: { userId } }
      },
      select: {
        ...WORKSPACE_SELECT,
        members: {
          where: { userId },
          select: { role: true },
          take: 1
        }
      }
    });

    if (!workspace) {
      throw new NotFoundException({
        message: "Workspace not found",
        code: API_ERROR_CODE.RESOURCE_NOT_FOUND
      });
    }

    return toPublicWorkspace(workspace);
  }

  async listMembers(
    userId: string,
    workspaceId: string,
    query: ListWorkspaceMembersQueryDto
  ): Promise<WorkspaceMemberListDataDto> {
    const page = query.page;
    const pageSize = query.pageSize;
    const skip = (page - 1) * pageSize;

    const { items, total } = await this.prisma.$transaction(
      async (transaction) => {
        const actor = await this.workspaceAuthorization.requireActor(
          userId,
          workspaceId,
          transaction
        );
        if (!canListWorkspaceMembers(actor.role)) {
          throw forbidden();
        }

        const totalCount = await transaction.workspaceMember.count({
          where: { workspaceId }
        });
        const members = await transaction.workspaceMember.findMany({
          where: { workspaceId },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          skip,
          take: pageSize,
          select: WORKSPACE_MEMBER_SELECT
        });

        return {
          total: totalCount,
          items: members.map(toPublicWorkspaceMember)
        };
      }
    );

    return { items, page, pageSize, total };
  }

  async addMember(
    userId: string,
    workspaceId: string,
    input: AddWorkspaceMemberRequestDto
  ): Promise<PublicWorkspaceMemberDto> {
    return this.prisma.$transaction(async (transaction) => {
      const actor = await this.workspaceAuthorization.requireActor(
        userId,
        workspaceId,
        transaction
      );
      if (!canAddWorkspaceMember(actor.role, input.role)) {
        throw forbidden();
      }

      const targetUser = await transaction.user.findUnique({
        where: { email: input.email },
        select: { id: true }
      });
      if (!targetUser) {
        throw notFound("User is not available to add");
      }

      try {
        const member = await transaction.workspaceMember.create({
          data: {
            workspaceId,
            userId: targetUser.id,
            role: input.role
          },
          select: WORKSPACE_MEMBER_SELECT
        });
        return toPublicWorkspaceMember(member);
      } catch (error: unknown) {
        if (isUniqueConstraint(error)) {
          throw new ConflictException({
            message: "Workspace membership already exists",
            code: API_ERROR_CODE.RESOURCE_CONFLICT
          });
        }

        throw error;
      }
    });
  }

  async updateMember(
    userId: string,
    workspaceId: string,
    memberId: string,
    input: UpdateWorkspaceMemberRequestDto
  ): Promise<PublicWorkspaceMemberDto> {
    return this.prisma.$transaction(async (transaction) => {
      const actor = await this.workspaceAuthorization.requireActor(
        userId,
        workspaceId,
        transaction
      );
      const target = await this.findWorkspaceMember(
        transaction,
        workspaceId,
        memberId
      );
      if (
        !canUpdateWorkspaceMember(
          actor.role,
          target.role,
          input.role,
          target.userId === userId
        )
      ) {
        throw forbidden();
      }

      const member = await transaction.workspaceMember.update({
        where: { id: target.id },
        data: { role: input.role },
        select: WORKSPACE_MEMBER_SELECT
      });
      return toPublicWorkspaceMember(member);
    });
  }

  async removeMember(
    userId: string,
    workspaceId: string,
    memberId: string
  ): Promise<void> {
    try {
      await runSerializableTransaction(
        this.prisma,
        async (transaction) => {
          const actor = await this.workspaceAuthorization.requireActor(
            userId,
            workspaceId,
            transaction
          );
          const target = await this.findWorkspaceMember(
            transaction,
            workspaceId,
            memberId
          );
          if (
            !canRemoveWorkspaceMember(
              actor.role,
              target.role,
              target.userId === userId
            )
          ) {
            throw forbidden();
          }

          await transaction.task.updateMany({
            where: {
              assigneeId: target.userId,
              project: { workspaceId }
            },
            data: { assigneeId: null }
          });
          await transaction.notification.deleteMany({
            where: {
              workspaceId,
              recipientId: target.userId
            }
          });
          await transaction.workspaceMember.delete({
            where: { id: target.id }
          });
        }
      );
    } catch (error: unknown) {
      if (error instanceof SerializableTransactionExhaustedError) {
        throw new ConflictException({
          message: "Workspace membership changed concurrently; retry the request",
          code: API_ERROR_CODE.RESOURCE_CONFLICT
        });
      }
      throw error;
    }
  }

  private async createWithSlug(
    userId: string,
    name: string,
    slug: string
  ): Promise<PublicWorkspaceDto> {
    const workspace = await this.prisma.$transaction((transaction) =>
      transaction.workspace.create({
        data: {
          name,
          slug,
          members: {
            create: {
              userId,
              role: WorkspaceRole.OWNER
            }
          }
        },
        select: {
          ...WORKSPACE_SELECT,
          members: {
            where: { userId },
            select: { role: true },
            take: 1
          }
        }
      })
    );
    return toPublicWorkspace(workspace);
  }

  private async findWorkspaceMember(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
    memberId: string
  ): Promise<WorkspaceMemberTarget> {
    const member = await transaction.workspaceMember.findFirst({
      where: { id: memberId, workspaceId },
      select: { id: true, userId: true, role: true }
    });
    if (!member) {
      throw notFound("Workspace member not found");
    }
    return member;
  }
}

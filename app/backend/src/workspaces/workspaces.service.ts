import {
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import { API_ERROR_CODE } from "../common/errors/api-error-code";
import { PrismaService } from "../database/prisma.service";
import { Prisma, WorkspaceRole } from "../generated/prisma/client";
import type {
  CreateWorkspaceRequestDto,
  ListWorkspacesQueryDto,
  PublicWorkspaceDto,
  WorkspaceListDataDto
} from "./dto/workspace.dto";

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

function baseSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");

  return slug || "workspace";
}

function slugCandidates(name: string): string[] {
  const base = baseSlug(name);
  return [base, ...[2, 3, 4, 5].map((suffix) => `${base}-${suffix}`)];
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

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    input: CreateWorkspaceRequestDto
  ): Promise<PublicWorkspaceDto> {
    const name = input.name.trim();

    for (const slug of slugCandidates(name)) {
      try {
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
}

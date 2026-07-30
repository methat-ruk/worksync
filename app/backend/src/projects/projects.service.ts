import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import { API_ERROR_CODE } from "../common/errors/api-error-code";
import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import { WorkspaceAuthorizationService } from "../workspaces/workspace-authorization.service";
import type {
  CreateProjectRequestDto,
  ListProjectsQueryDto,
  ProjectListDataDto,
  PublicProjectDto,
  UpdateProjectRequestDto
} from "./dto/project.dto";
import {
  canCreateProject,
  canUpdateProject
} from "./project-rbac.policy";

const PROJECT_SELECT = {
  id: true,
  name: true,
  key: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.ProjectSelect;

type ProjectRecord = Prisma.ProjectGetPayload<{
  select: typeof PROJECT_SELECT;
}>;

function toPublicProject(project: ProjectRecord): PublicProjectDto {
  return project;
}

function projectNotFound(): NotFoundException {
  return new NotFoundException({
    message: "Project not found",
    code: API_ERROR_CODE.RESOURCE_NOT_FOUND
  });
}

function projectForbidden(): ForbiddenException {
  return new ForbiddenException({
    message: "Not authorized for this project action",
    code: API_ERROR_CODE.AUTHORIZATION_DENIED
  });
}

function isUniqueConstraint(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceAuthorization: WorkspaceAuthorizationService
  ) {}

  async create(
    userId: string,
    workspaceId: string,
    input: CreateProjectRequestDto
  ): Promise<PublicProjectDto> {
    return this.prisma.$transaction(async (transaction) => {
      const actor = await this.workspaceAuthorization.requireActor(
        userId,
        workspaceId,
        transaction
      );
      if (!canCreateProject(actor.role)) {
        throw projectForbidden();
      }

      try {
        const project = await transaction.project.create({
          data: {
            workspaceId: actor.workspaceId,
            name: input.name,
            key: input.key
          },
          select: PROJECT_SELECT
        });
        return toPublicProject(project);
      } catch (error: unknown) {
        if (isUniqueConstraint(error)) {
          throw new ConflictException({
            message: "Project key is already in use",
            code: API_ERROR_CODE.RESOURCE_CONFLICT
          });
        }
        throw error;
      }
    });
  }

  async list(
    userId: string,
    workspaceId: string,
    query: ListProjectsQueryDto
  ): Promise<ProjectListDataDto> {
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
        const where = { workspaceId: actor.workspaceId };
        const totalCount = await transaction.project.count({ where });
        const projects = await transaction.project.findMany({
          where,
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          skip,
          take: pageSize,
          select: PROJECT_SELECT
        });
        return {
          total: totalCount,
          items: projects.map(toPublicProject)
        };
      }
    );

    return { items, page, pageSize, total };
  }

  async read(
    userId: string,
    workspaceId: string,
    projectId: string
  ): Promise<PublicProjectDto> {
    return this.prisma.$transaction(async (transaction) => {
      const actor = await this.workspaceAuthorization.requireActor(
        userId,
        workspaceId,
        transaction
      );
      const project = await transaction.project.findFirst({
        where: { id: projectId, workspaceId: actor.workspaceId },
        select: PROJECT_SELECT
      });
      if (!project) {
        throw projectNotFound();
      }
      return toPublicProject(project);
    });
  }

  async update(
    userId: string,
    workspaceId: string,
    projectId: string,
    input: UpdateProjectRequestDto
  ): Promise<PublicProjectDto> {
    return this.prisma.$transaction(async (transaction) => {
      const actor = await this.workspaceAuthorization.requireActor(
        userId,
        workspaceId,
        transaction
      );
      if (!canUpdateProject(actor.role)) {
        throw projectForbidden();
      }

      const existing = await transaction.project.findFirst({
        where: { id: projectId, workspaceId: actor.workspaceId },
        select: { id: true }
      });
      if (!existing) {
        throw projectNotFound();
      }

      const project = await transaction.project.update({
        where: { id: existing.id },
        data: { name: input.name },
        select: PROJECT_SELECT
      });
      return toPublicProject(project);
    });
  }
}

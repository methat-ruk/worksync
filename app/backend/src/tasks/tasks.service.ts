import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import { API_ERROR_CODE } from "../common/errors/api-error-code";
import { PrismaService } from "../database/prisma.service";
import {
  runSerializableTransaction,
  SerializableTransactionExhaustedError
} from "../database/serializable-transaction";
import {
  Prisma,
  TaskStatus
} from "../generated/prisma/client";
import { WorkspaceAuthorizationService } from "../workspaces/workspace-authorization.service";
import type {
  CreateTaskRequestDto,
  ListTasksQueryDto,
  PublicTaskAssigneeDto,
  PublicTaskDto,
  SearchTaskAssigneesQueryDto,
  TaskAssigneeListDataDto,
  TaskListDataDto,
  UpdateTaskRequestDto
} from "./dto/task.dto";
import { canMutateTask } from "./task-rbac.policy";
import { canTransitionTaskStatus } from "./task-status.policy";

const TASK_USER_SELECT = {
  id: true,
  displayName: true
} satisfies Prisma.UserSelect;

const TASK_SELECT = {
  id: true,
  projectId: true,
  title: true,
  description: true,
  status: true,
  dueDate: true,
  creator: { select: TASK_USER_SELECT },
  assignee: { select: TASK_USER_SELECT },
  createdAt: true,
  updatedAt: true
} satisfies Prisma.TaskSelect;

type TaskRecord = Prisma.TaskGetPayload<{ select: typeof TASK_SELECT }>;

function toPublicTask(task: TaskRecord): PublicTaskDto {
  return task;
}

function resourceNotFound(message = "Task not found"): NotFoundException {
  return new NotFoundException({
    message,
    code: API_ERROR_CODE.RESOURCE_NOT_FOUND
  });
}

function taskForbidden(): ForbiddenException {
  return new ForbiddenException({
    message: "Not authorized for this task action",
    code: API_ERROR_CODE.AUTHORIZATION_DENIED
  });
}

function invalidTransition(): ConflictException {
  return new ConflictException({
    message: "Task status transition is not allowed",
    code: API_ERROR_CODE.INVALID_TASK_TRANSITION
  });
}

function serializationConflict(): ConflictException {
  return new ConflictException({
    message: "Task assignment changed concurrently; retry the request",
    code: API_ERROR_CODE.RESOURCE_CONFLICT
  });
}

function emptyUpdate(): BadRequestException {
  return new BadRequestException({
    message: "Validation failed",
    code: API_ERROR_CODE.VALIDATION_ERROR,
    fields: {
      body: ["At least one editable task field is required"]
    }
  });
}

function conflictingFilters(): BadRequestException {
  return new BadRequestException({
    message: "Validation failed",
    code: API_ERROR_CODE.VALIDATION_ERROR,
    fields: {
      assigneeId: ["assigneeId cannot be combined with unassigned=true"],
      unassigned: ["unassigned=true cannot be combined with assigneeId"]
    }
  });
}

function taskMutationData(input: UpdateTaskRequestDto): Prisma.TaskUpdateInput {
  return {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined
      ? { description: input.description }
      : {}),
    ...(input.dueDate !== undefined
      ? { dueDate: input.dueDate ? new Date(input.dueDate) : null }
      : {}),
    ...(input.assigneeId !== undefined
      ? {
          assignee: input.assigneeId
            ? { connect: { id: input.assigneeId } }
            : { disconnect: true }
        }
      : {})
  };
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceAuthorization: WorkspaceAuthorizationService
  ) {}

  async create(
    userId: string,
    workspaceId: string,
    projectId: string,
    input: CreateTaskRequestDto
  ): Promise<PublicTaskDto> {
    try {
      return await runSerializableTransaction(
        this.prisma,
        async (transaction) => {
          const actor = await this.requireMutationActor(
            transaction,
            userId,
            workspaceId
          );
          await this.requireProject(transaction, actor.workspaceId, projectId);
          await this.requireAssignee(
            transaction,
            actor.workspaceId,
            input.assigneeId
          );

          const task = await transaction.task.create({
            data: {
              projectId,
              creatorId: actor.userId,
              title: input.title,
              description: input.description ?? null,
              assigneeId: input.assigneeId ?? null,
              dueDate: input.dueDate ? new Date(input.dueDate) : null,
              status: TaskStatus.BACKLOG
            },
            select: TASK_SELECT
          });
          return toPublicTask(task);
        }
      );
    } catch (error: unknown) {
      if (error instanceof SerializableTransactionExhaustedError) {
        throw serializationConflict();
      }
      throw error;
    }
  }

  async list(
    userId: string,
    workspaceId: string,
    projectId: string,
    query: ListTasksQueryDto
  ): Promise<TaskListDataDto> {
    if (query.assigneeId && query.unassigned === true) {
      throw conflictingFilters();
    }

    const page = query.page;
    const pageSize = query.pageSize;
    const skip = (page - 1) * pageSize;

    return this.prisma.$transaction(async (transaction) => {
      const actor = await this.workspaceAuthorization.requireActor(
        userId,
        workspaceId,
        transaction
      );
      await this.requireProject(transaction, actor.workspaceId, projectId);
      const where: Prisma.TaskWhereInput = {
        projectId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
        ...(query.unassigned === true ? { assigneeId: null } : {})
      };
      const [total, tasks] = await Promise.all([
        transaction.task.count({ where }),
        transaction.task.findMany({
          where,
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          skip,
          take: pageSize,
          select: TASK_SELECT
        })
      ]);
      return {
        items: tasks.map(toPublicTask),
        page,
        pageSize,
        total
      };
    });
  }

  async read(
    userId: string,
    workspaceId: string,
    projectId: string,
    taskId: string
  ): Promise<PublicTaskDto> {
    return this.prisma.$transaction(async (transaction) => {
      const actor = await this.workspaceAuthorization.requireActor(
        userId,
        workspaceId,
        transaction
      );
      await this.requireProject(transaction, actor.workspaceId, projectId);
      return this.requireTask(transaction, projectId, taskId);
    });
  }

  async update(
    userId: string,
    workspaceId: string,
    projectId: string,
    taskId: string,
    input: UpdateTaskRequestDto
  ): Promise<PublicTaskDto> {
    if (
      input.title === undefined &&
      input.description === undefined &&
      input.assigneeId === undefined &&
      input.dueDate === undefined
    ) {
      throw emptyUpdate();
    }

    try {
      return await runSerializableTransaction(
        this.prisma,
        async (transaction) => {
          const actor = await this.requireMutationActor(
            transaction,
            userId,
            workspaceId
          );
          await this.requireProject(transaction, actor.workspaceId, projectId);
          const existing = await this.requireTaskIdentity(
            transaction,
            projectId,
            taskId
          );
          await this.requireAssignee(
            transaction,
            actor.workspaceId,
            input.assigneeId
          );
          const task = await transaction.task.update({
            where: { id: existing.id },
            data: taskMutationData(input),
            select: TASK_SELECT
          });
          return toPublicTask(task);
        }
      );
    } catch (error: unknown) {
      if (error instanceof SerializableTransactionExhaustedError) {
        throw serializationConflict();
      }
      throw error;
    }
  }

  async transitionStatus(
    userId: string,
    workspaceId: string,
    projectId: string,
    taskId: string,
    requestedStatus: TaskStatus
  ): Promise<PublicTaskDto> {
    return this.prisma.$transaction(async (transaction) => {
      const actor = await this.requireMutationActor(
        transaction,
        userId,
        workspaceId
      );
      await this.requireProject(transaction, actor.workspaceId, projectId);
      const existing = await this.requireTaskIdentity(
        transaction,
        projectId,
        taskId,
        true
      );
      if (!canTransitionTaskStatus(existing.status, requestedStatus)) {
        throw invalidTransition();
      }

      const result = await transaction.task.updateMany({
        where: {
          id: existing.id,
          projectId,
          status: existing.status
        },
        data: { status: requestedStatus }
      });
      if (result.count !== 1) {
        throw invalidTransition();
      }
      return this.requireTask(transaction, projectId, taskId);
    });
  }

  async searchAssignees(
    userId: string,
    workspaceId: string,
    query: SearchTaskAssigneesQueryDto
  ): Promise<TaskAssigneeListDataDto> {
    const page = query.page;
    const pageSize = query.pageSize;
    const skip = (page - 1) * pageSize;

    return this.prisma.$transaction(async (transaction) => {
      const actor = await this.workspaceAuthorization.requireActor(
        userId,
        workspaceId,
        transaction
      );
      const where: Prisma.WorkspaceMemberWhereInput = {
        workspaceId: actor.workspaceId,
        ...(query.search
          ? {
              user: {
                displayName: {
                  contains: query.search,
                  mode: Prisma.QueryMode.insensitive
                }
              }
            }
          : {})
      };
      const [total, members] = await Promise.all([
        transaction.workspaceMember.count({ where }),
        transaction.workspaceMember.findMany({
          where,
          orderBy: [{ user: { displayName: "asc" } }, { userId: "asc" }],
          skip,
          take: pageSize,
          select: { user: { select: TASK_USER_SELECT } }
        })
      ]);
      return {
        items: members.map(
          ({ user }): PublicTaskAssigneeDto => ({
            id: user.id,
            displayName: user.displayName
          })
        ),
        page,
        pageSize,
        total
      };
    });
  }

  private async requireMutationActor(
    transaction: Prisma.TransactionClient,
    userId: string,
    workspaceId: string
  ) {
    const actor = await this.workspaceAuthorization.requireActor(
      userId,
      workspaceId,
      transaction
    );
    if (!canMutateTask(actor.role)) {
      throw taskForbidden();
    }
    return actor;
  }

  private async requireProject(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
    projectId: string
  ): Promise<void> {
    const project = await transaction.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true }
    });
    if (!project) {
      throw resourceNotFound("Project not found");
    }
  }

  private async requireTaskIdentity(
    transaction: Prisma.TransactionClient,
    projectId: string,
    taskId: string,
    includeStatus: true
  ): Promise<{ id: string; status: TaskStatus }>;
  private async requireTaskIdentity(
    transaction: Prisma.TransactionClient,
    projectId: string,
    taskId: string,
    includeStatus?: false
  ): Promise<{ id: string }>;
  private async requireTaskIdentity(
    transaction: Prisma.TransactionClient,
    projectId: string,
    taskId: string,
    includeStatus = false
  ): Promise<{ id: string; status?: TaskStatus }> {
    const task = await transaction.task.findFirst({
      where: { id: taskId, projectId },
      select: includeStatus ? { id: true, status: true } : { id: true }
    });
    if (!task) {
      throw resourceNotFound();
    }
    return task;
  }

  private async requireTask(
    transaction: Prisma.TransactionClient,
    projectId: string,
    taskId: string
  ): Promise<PublicTaskDto> {
    const task = await transaction.task.findFirst({
      where: { id: taskId, projectId },
      select: TASK_SELECT
    });
    if (!task) {
      throw resourceNotFound();
    }
    return toPublicTask(task);
  }

  private async requireAssignee(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
    assigneeId: string | null | undefined
  ): Promise<void> {
    if (!assigneeId) {
      return;
    }
    const membership = await transaction.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: assigneeId
        }
      },
      select: { id: true }
    });
    if (!membership) {
      throw resourceNotFound("Assignee not found");
    }
  }
}

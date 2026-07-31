import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthGuard } from "../auth/guards/auth.guard";
import type { PublicUser } from "../auth/types/auth.types";
import { ApiErrorResponseDto } from "../common/errors/api-error.dto";
import {
  CreateTaskRequestDto,
  ListTasksQueryDto,
  SearchTaskAssigneesQueryDto,
  TaskAssigneeListResponseDto,
  TaskListResponseDto,
  TaskResponseDto,
  TransitionTaskStatusRequestDto,
  UpdateTaskRequestDto
} from "./dto/task.dto";
import { TasksService } from "./tasks.service";

@ApiTags("tasks")
@ApiBearerAuth("access-token")
@UseGuards(AuthGuard)
@Controller("workspaces/:workspaceId/projects/:projectId/tasks")
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post()
  @ApiOperation({ summary: "Create a task in a visible project" })
  @ApiCreatedResponse({ type: TaskResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  async create(
    @CurrentUser() user: PublicUser,
    @Param("workspaceId") workspaceId: string,
    @Param("projectId") projectId: string,
    @Body() input: CreateTaskRequestDto
  ): Promise<TaskResponseDto> {
    const task = await this.tasks.create(
      user.id,
      workspaceId,
      projectId,
      input
    );
    return {
      success: true,
      message: "Task created",
      data: { task }
    };
  }

  @Get()
  @ApiOperation({ summary: "List tasks in a visible project" })
  @ApiOkResponse({ type: TaskListResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async list(
    @CurrentUser() user: PublicUser,
    @Param("workspaceId") workspaceId: string,
    @Param("projectId") projectId: string,
    @Query() query: ListTasksQueryDto
  ): Promise<TaskListResponseDto> {
    return {
      success: true,
      data: await this.tasks.list(user.id, workspaceId, projectId, query)
    };
  }

  @Get(":taskId")
  @ApiOperation({ summary: "Read a task in a visible project" })
  @ApiOkResponse({ type: TaskResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async read(
    @CurrentUser() user: PublicUser,
    @Param("workspaceId") workspaceId: string,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string
  ): Promise<TaskResponseDto> {
    return {
      success: true,
      data: {
        task: await this.tasks.read(
          user.id,
          workspaceId,
          projectId,
          taskId
        )
      }
    };
  }

  @Patch(":taskId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update editable task details" })
  @ApiOkResponse({ type: TaskResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  async update(
    @CurrentUser() user: PublicUser,
    @Param("workspaceId") workspaceId: string,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Body() input: UpdateTaskRequestDto
  ): Promise<TaskResponseDto> {
    return {
      success: true,
      message: "Task updated",
      data: {
        task: await this.tasks.update(
          user.id,
          workspaceId,
          projectId,
          taskId,
          input
        )
      }
    };
  }

  @Patch(":taskId/status")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Transition task status" })
  @ApiOkResponse({ type: TaskResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  async transitionStatus(
    @CurrentUser() user: PublicUser,
    @Param("workspaceId") workspaceId: string,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Body() input: TransitionTaskStatusRequestDto
  ): Promise<TaskResponseDto> {
    return {
      success: true,
      message: "Task status updated",
      data: {
        task: await this.tasks.transitionStatus(
          user.id,
          workspaceId,
          projectId,
          taskId,
          input.status
        )
      }
    };
  }
}

@ApiTags("task assignees")
@ApiBearerAuth("access-token")
@UseGuards(AuthGuard)
@Controller("workspaces/:workspaceId/task-assignees")
export class TaskAssigneesController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @ApiOperation({ summary: "Search minimal task assignee candidates" })
  @ApiOkResponse({ type: TaskAssigneeListResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async search(
    @CurrentUser() user: PublicUser,
    @Param("workspaceId") workspaceId: string,
    @Query() query: SearchTaskAssigneesQueryDto
  ): Promise<TaskAssigneeListResponseDto> {
    return {
      success: true,
      data: await this.tasks.searchAssignees(user.id, workspaceId, query)
    };
  }
}

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
  CreateProjectRequestDto,
  ListProjectsQueryDto,
  ProjectListResponseDto,
  ProjectResponseDto,
  UpdateProjectRequestDto
} from "./dto/project.dto";
import { ProjectsService } from "./projects.service";

@ApiTags("projects")
@ApiBearerAuth("access-token")
@UseGuards(AuthGuard)
@Controller("workspaces/:workspaceId/projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: "Create a project in a visible workspace" })
  @ApiCreatedResponse({ type: ProjectResponseDto })
  @ApiBadRequestResponse({
    description: "Request validation failed",
    type: ApiErrorResponseDto
  })
  @ApiUnauthorizedResponse({
    description: "A valid active access token is required",
    type: ApiErrorResponseDto
  })
  @ApiForbiddenResponse({
    description: "The caller cannot create projects",
    type: ApiErrorResponseDto
  })
  @ApiNotFoundResponse({
    description: "Workspace is missing or not visible to the caller",
    type: ApiErrorResponseDto
  })
  @ApiConflictResponse({
    description: "The normalized project key is already in use",
    type: ApiErrorResponseDto
  })
  async create(
    @CurrentUser() user: PublicUser,
    @Param("workspaceId") workspaceId: string,
    @Body() input: CreateProjectRequestDto
  ): Promise<ProjectResponseDto> {
    const project = await this.projects.create(user.id, workspaceId, input);
    return {
      success: true,
      message: "Project created",
      data: { project }
    };
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "List projects in a visible workspace" })
  @ApiOkResponse({ type: ProjectListResponseDto })
  @ApiBadRequestResponse({
    description: "Query validation failed",
    type: ApiErrorResponseDto
  })
  @ApiUnauthorizedResponse({
    description: "A valid active access token is required",
    type: ApiErrorResponseDto
  })
  @ApiNotFoundResponse({
    description: "Workspace is missing or not visible to the caller",
    type: ApiErrorResponseDto
  })
  async list(
    @CurrentUser() user: PublicUser,
    @Param("workspaceId") workspaceId: string,
    @Query() query: ListProjectsQueryDto
  ): Promise<ProjectListResponseDto> {
    return {
      success: true,
      data: await this.projects.list(user.id, workspaceId, query)
    };
  }

  @Get(":projectId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Read a project in a visible workspace" })
  @ApiOkResponse({ type: ProjectResponseDto })
  @ApiUnauthorizedResponse({
    description: "A valid active access token is required",
    type: ApiErrorResponseDto
  })
  @ApiNotFoundResponse({
    description: "Workspace or project is missing or not visible to the caller",
    type: ApiErrorResponseDto
  })
  async read(
    @CurrentUser() user: PublicUser,
    @Param("workspaceId") workspaceId: string,
    @Param("projectId") projectId: string
  ): Promise<ProjectResponseDto> {
    const project = await this.projects.read(
      user.id,
      workspaceId,
      projectId
    );
    return {
      success: true,
      data: { project }
    };
  }

  @Patch(":projectId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update a project in a visible workspace" })
  @ApiOkResponse({ type: ProjectResponseDto })
  @ApiBadRequestResponse({
    description: "Request validation failed",
    type: ApiErrorResponseDto
  })
  @ApiUnauthorizedResponse({
    description: "A valid active access token is required",
    type: ApiErrorResponseDto
  })
  @ApiForbiddenResponse({
    description: "The caller cannot update projects",
    type: ApiErrorResponseDto
  })
  @ApiNotFoundResponse({
    description: "Workspace or project is missing or not visible to the caller",
    type: ApiErrorResponseDto
  })
  async update(
    @CurrentUser() user: PublicUser,
    @Param("workspaceId") workspaceId: string,
    @Param("projectId") projectId: string,
    @Body() input: UpdateProjectRequestDto
  ): Promise<ProjectResponseDto> {
    const project = await this.projects.update(
      user.id,
      workspaceId,
      projectId,
      input
    );
    return {
      success: true,
      message: "Project updated",
      data: { project }
    };
  }
}

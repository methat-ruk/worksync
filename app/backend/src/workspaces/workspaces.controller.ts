import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
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
  CreateWorkspaceRequestDto,
  ListWorkspacesQueryDto,
  WorkspaceListResponseDto,
  WorkspaceResponseDto
} from "./dto/workspace.dto";
import { WorkspacesService } from "./workspaces.service";

@ApiTags("workspaces")
@ApiBearerAuth("access-token")
@UseGuards(AuthGuard)
@Controller("workspaces")
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Post()
  @ApiOperation({ summary: "Create a workspace for the authenticated user" })
  @ApiCreatedResponse({ type: WorkspaceResponseDto })
  @ApiBadRequestResponse({
    description: "Request validation failed",
    type: ApiErrorResponseDto
  })
  @ApiUnauthorizedResponse({
    description: "A valid active access token is required",
    type: ApiErrorResponseDto
  })
  @ApiConflictResponse({
    description: "A unique workspace slug could not be generated",
    type: ApiErrorResponseDto
  })
  async create(
    @CurrentUser() user: PublicUser,
    @Body() input: CreateWorkspaceRequestDto
  ): Promise<WorkspaceResponseDto> {
    const workspace = await this.workspaces.create(user.id, input);
    return {
      success: true,
      message: "Workspace created",
      data: { workspace }
    };
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "List workspaces visible to the authenticated user" })
  @ApiOkResponse({ type: WorkspaceListResponseDto })
  @ApiBadRequestResponse({
    description: "Request validation failed",
    type: ApiErrorResponseDto
  })
  @ApiUnauthorizedResponse({
    description: "A valid active access token is required",
    type: ApiErrorResponseDto
  })
  async list(
    @CurrentUser() user: PublicUser,
    @Query() query: ListWorkspacesQueryDto
  ): Promise<WorkspaceListResponseDto> {
    return {
      success: true,
      data: await this.workspaces.list(user.id, query)
    };
  }

  @Get(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Read a workspace visible to the authenticated user" })
  @ApiOkResponse({ type: WorkspaceResponseDto })
  @ApiUnauthorizedResponse({
    description: "A valid active access token is required",
    type: ApiErrorResponseDto
  })
  @ApiNotFoundResponse({
    description: "Workspace is missing or not visible to the caller",
    type: ApiErrorResponseDto
  })
  async read(
    @CurrentUser() user: PublicUser,
    @Param("id") workspaceId: string
  ): Promise<WorkspaceResponseDto> {
    const workspace = await this.workspaces.read(user.id, workspaceId);
    return {
      success: true,
      data: { workspace }
    };
  }
}

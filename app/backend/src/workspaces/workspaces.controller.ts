import {
  Body,
  Controller,
  Delete,
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
  AddWorkspaceMemberRequestDto,
  CreateWorkspaceRequestDto,
  ListWorkspaceMembersQueryDto,
  ListWorkspacesQueryDto,
  UpdateWorkspaceMemberRequestDto,
  WorkspaceMemberListResponseDto,
  WorkspaceMemberMessageResponseDto,
  WorkspaceMemberResponseDto,
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

  @Get(":workspaceId/members")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "List members manageable by the caller" })
  @ApiOkResponse({ type: WorkspaceMemberListResponseDto })
  @ApiBadRequestResponse({
    description: "Request validation failed",
    type: ApiErrorResponseDto
  })
  @ApiUnauthorizedResponse({
    description: "A valid active access token is required",
    type: ApiErrorResponseDto
  })
  @ApiForbiddenResponse({
    description: "The caller does not have member-management access",
    type: ApiErrorResponseDto
  })
  @ApiNotFoundResponse({
    description: "Workspace is missing or not visible to the caller",
    type: ApiErrorResponseDto
  })
  async listMembers(
    @CurrentUser() user: PublicUser,
    @Param("workspaceId") workspaceId: string,
    @Query() query: ListWorkspaceMembersQueryDto
  ): Promise<WorkspaceMemberListResponseDto> {
    return {
      success: true,
      data: await this.workspaces.listMembers(user.id, workspaceId, query)
    };
  }

  @Post(":workspaceId/members")
  @ApiOperation({ summary: "Add an existing user as a workspace member" })
  @ApiCreatedResponse({ type: WorkspaceMemberResponseDto })
  @ApiBadRequestResponse({
    description: "Request validation failed",
    type: ApiErrorResponseDto
  })
  @ApiUnauthorizedResponse({
    description: "A valid active access token is required",
    type: ApiErrorResponseDto
  })
  @ApiForbiddenResponse({
    description: "The caller cannot add the requested member role",
    type: ApiErrorResponseDto
  })
  @ApiNotFoundResponse({
    description: "Workspace or target user is not available to the caller",
    type: ApiErrorResponseDto
  })
  @ApiConflictResponse({
    description: "The user is already a workspace member",
    type: ApiErrorResponseDto
  })
  async addMember(
    @CurrentUser() user: PublicUser,
    @Param("workspaceId") workspaceId: string,
    @Body() input: AddWorkspaceMemberRequestDto
  ): Promise<WorkspaceMemberResponseDto> {
    const member = await this.workspaces.addMember(
      user.id,
      workspaceId,
      input
    );
    return {
      success: true,
      message: "Workspace member added",
      data: { member }
    };
  }

  @Patch(":workspaceId/members/:memberId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update a workspace member role" })
  @ApiOkResponse({ type: WorkspaceMemberResponseDto })
  @ApiBadRequestResponse({
    description: "Request validation failed",
    type: ApiErrorResponseDto
  })
  @ApiUnauthorizedResponse({
    description: "A valid active access token is required",
    type: ApiErrorResponseDto
  })
  @ApiForbiddenResponse({
    description: "The caller cannot change the requested member role",
    type: ApiErrorResponseDto
  })
  @ApiNotFoundResponse({
    description: "Workspace or member is missing or not visible to the caller",
    type: ApiErrorResponseDto
  })
  async updateMember(
    @CurrentUser() user: PublicUser,
    @Param("workspaceId") workspaceId: string,
    @Param("memberId") memberId: string,
    @Body() input: UpdateWorkspaceMemberRequestDto
  ): Promise<WorkspaceMemberResponseDto> {
    const member = await this.workspaces.updateMember(
      user.id,
      workspaceId,
      memberId,
      input
    );
    return {
      success: true,
      message: "Workspace member updated",
      data: { member }
    };
  }

  @Delete(":workspaceId/members/:memberId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Remove a workspace member" })
  @ApiOkResponse({ type: WorkspaceMemberMessageResponseDto })
  @ApiUnauthorizedResponse({
    description: "A valid active access token is required",
    type: ApiErrorResponseDto
  })
  @ApiForbiddenResponse({
    description: "The caller cannot remove the requested member",
    type: ApiErrorResponseDto
  })
  @ApiConflictResponse({
    description: "Concurrent assignment or membership change; retry safely",
    type: ApiErrorResponseDto
  })
  @ApiNotFoundResponse({
    description: "Workspace or member is missing or not visible to the caller",
    type: ApiErrorResponseDto
  })
  async removeMember(
    @CurrentUser() user: PublicUser,
    @Param("workspaceId") workspaceId: string,
    @Param("memberId") memberId: string
  ): Promise<WorkspaceMemberMessageResponseDto> {
    await this.workspaces.removeMember(user.id, workspaceId, memberId);
    return {
      success: true,
      message: "Workspace member removed"
    };
  }
}

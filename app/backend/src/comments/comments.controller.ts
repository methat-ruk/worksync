import {
  Body,
  Controller,
  Get,
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
import { CommentsService } from "./comments.service";
import {
  CommentListResponseDto,
  CommentResponseDto,
  CreateCommentRequestDto,
  ListCommentsQueryDto,
  MentionCandidateListResponseDto,
  SearchMentionCandidatesQueryDto
} from "./dto/comment.dto";

@ApiTags("comments")
@ApiBearerAuth("access-token")
@UseGuards(AuthGuard)
@Controller(
  "workspaces/:workspaceId/projects/:projectId/tasks/:taskId/comments"
)
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  @ApiOperation({ summary: "List comments on a visible task" })
  @ApiOkResponse({ type: CommentListResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async list(
    @CurrentUser() user: PublicUser,
    @Param("workspaceId") workspaceId: string,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Query() query: ListCommentsQueryDto
  ): Promise<CommentListResponseDto> {
    return {
      success: true,
      data: await this.comments.list(
        user.id,
        workspaceId,
        projectId,
        taskId,
        query
      )
    };
  }

  @Post()
  @ApiOperation({ summary: "Create a plain-text comment with mentions" })
  @ApiCreatedResponse({ type: CommentResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  async create(
    @CurrentUser() user: PublicUser,
    @Param("workspaceId") workspaceId: string,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Body() input: CreateCommentRequestDto
  ): Promise<CommentResponseDto> {
    const result = await this.comments.create(
      user.id,
      workspaceId,
      projectId,
      taskId,
      input
    );
    return {
      success: true,
      message: "Comment created",
      data: { comment: result.comment }
    };
  }
}

@ApiTags("mentions")
@ApiBearerAuth("access-token")
@UseGuards(AuthGuard)
@Controller("workspaces/:workspaceId/mention-candidates")
export class MentionCandidatesController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  @ApiOperation({ summary: "Search mentionable workspace members" })
  @ApiOkResponse({ type: MentionCandidateListResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async search(
    @CurrentUser() user: PublicUser,
    @Param("workspaceId") workspaceId: string,
    @Query() query: SearchMentionCandidatesQueryDto
  ): Promise<MentionCandidateListResponseDto> {
    return {
      success: true,
      data: await this.comments.searchMentionCandidates(
        user.id,
        workspaceId,
        query
      )
    };
  }
}

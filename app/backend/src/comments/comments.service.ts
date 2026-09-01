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
import { Prisma } from "../generated/prisma/client";
import { WorkspaceAuthorizationService } from "../workspaces/workspace-authorization.service";
import {
  deriveMentionLabel,
  hasValidMentionOccurrences,
  isCanonicalCommentBody
} from "./comment-contract";
import { canCreateComment } from "./comment.policy";
import type {
  CommentListDataDto,
  CreateCommentRequestDto,
  ListCommentsQueryDto,
  MentionCandidateDto,
  MentionCandidateListDataDto,
  PublicCommentDto,
  SearchMentionCandidatesQueryDto
} from "./dto/comment.dto";

const COMMENT_SELECT = {
  id: true,
  taskId: true,
  body: true,
  author: { select: { id: true, displayName: true } },
  mentions: {
    orderBy: [{ start: "asc" as const }, { end: "asc" as const }],
    select: { start: true, end: true }
  },
  createdAt: true
} satisfies Prisma.CommentSelect;

type CommentRecord = Prisma.CommentGetPayload<{ select: typeof COMMENT_SELECT }>;

export type CommentCreatedEventV1 = Readonly<{
  type: "comment.created";
  version: 1;
  workspaceId: string;
  projectId: string;
  taskId: string;
  commentId: string;
  authorId: string;
  mentionedUserIds: readonly string[];
}>;

export type CreatedCommentResult = Readonly<{
  comment: PublicCommentDto;
  event: CommentCreatedEventV1;
}>;

type CommentCursor = Readonly<{
  v: 1;
  createdAt: string;
  id: string;
}>;

function toPublicComment(comment: CommentRecord): PublicCommentDto {
  return comment;
}

function resourceNotFound(message = "Task not found"): NotFoundException {
  return new NotFoundException({
    message,
    code: API_ERROR_CODE.RESOURCE_NOT_FOUND
  });
}

function commentForbidden(): ForbiddenException {
  return new ForbiddenException({
    message: "Not authorized to create comments",
    code: API_ERROR_CODE.AUTHORIZATION_DENIED
  });
}

function invalidCommentBody(): BadRequestException {
  return new BadRequestException({
    message: "Validation failed",
    code: API_ERROR_CODE.VALIDATION_ERROR,
    fields: { body: ["Comment body is not valid"] }
  });
}

function invalidMentions(): BadRequestException {
  return new BadRequestException({
    message: "One or more mentions is unavailable",
    code: API_ERROR_CODE.VALIDATION_ERROR
  });
}

function invalidCursor(): BadRequestException {
  return new BadRequestException({
    message: "Comment cursor is not valid",
    code: API_ERROR_CODE.VALIDATION_ERROR
  });
}

function serializationConflict(): ConflictException {
  return new ConflictException({
    message: "Comment changed concurrently; retry the request",
    code: API_ERROR_CODE.RESOURCE_CONFLICT
  });
}

function encodeCursor(comment: Pick<CommentRecord, "createdAt" | "id">): string {
  const cursor: CommentCursor = {
    v: 1,
    createdAt: comment.createdAt.toISOString(),
    id: comment.id
  };
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string): CommentCursor {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw invalidCursor();
    }
    const record = parsed as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    if (
      keys.join(",") !== "createdAt,id,v" ||
      record.v !== 1 ||
      typeof record.createdAt !== "string" ||
      typeof record.id !== "string" ||
      record.id.length < 1 ||
      record.id.length > 100
    ) {
      throw invalidCursor();
    }
    const createdAt = new Date(record.createdAt);
    if (
      Number.isNaN(createdAt.getTime()) ||
      createdAt.toISOString() !== record.createdAt
    ) {
      throw invalidCursor();
    }
    return { v: 1, createdAt: record.createdAt, id: record.id };
  } catch (error: unknown) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw invalidCursor();
  }
}

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceAuthorization: WorkspaceAuthorizationService
  ) {}

  async create(
    userId: string,
    workspaceId: string,
    projectId: string,
    taskId: string,
    input: CreateCommentRequestDto
  ): Promise<CreatedCommentResult> {
    if (!isCanonicalCommentBody(input.body)) {
      throw invalidCommentBody();
    }

    try {
      return await runSerializableTransaction(
        this.prisma,
        async (transaction) => {
          const actor = await this.workspaceAuthorization.requireActor(
            userId,
            workspaceId,
            transaction
          );
          if (!canCreateComment(actor.role)) {
            throw commentForbidden();
          }
          await this.requireTask(transaction, workspaceId, projectId, taskId);

          const mentionedUserIds = [
            ...new Set(input.mentions.map(({ userId: mentionedId }) => mentionedId))
          ];
          const members = mentionedUserIds.length
            ? await transaction.workspaceMember.findMany({
                where: {
                  workspaceId,
                  userId: { in: mentionedUserIds }
                },
                select: {
                  user: { select: { id: true, displayName: true } }
                }
              })
            : [];
          const mentionLabels = new Map(
            members.map(({ user }) => [
              user.id,
              deriveMentionLabel(user.displayName)
            ])
          );
          if (
            members.length !== mentionedUserIds.length ||
            !hasValidMentionOccurrences(
              input.body,
              input.mentions,
              mentionLabels,
              actor.userId
            )
          ) {
            throw invalidMentions();
          }

          const comment = await transaction.comment.create({
            data: {
              taskId,
              authorId: actor.userId,
              body: input.body,
              mentions: {
                create: input.mentions.map((mention) => ({
                  mentionedUserId: mention.userId,
                  start: mention.start,
                  end: mention.end
                }))
              }
            },
            select: COMMENT_SELECT
          });

          return {
            comment: toPublicComment(comment),
            event: {
              type: "comment.created",
              version: 1,
              workspaceId,
              projectId,
              taskId,
              commentId: comment.id,
              authorId: actor.userId,
              mentionedUserIds
            }
          };
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
    taskId: string,
    query: ListCommentsQueryDto
  ): Promise<CommentListDataDto> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

    return this.prisma.$transaction(async (transaction) => {
      await this.workspaceAuthorization.requireActor(
        userId,
        workspaceId,
        transaction
      );
      await this.requireTask(transaction, workspaceId, projectId, taskId);

      const comments = await transaction.comment.findMany({
        where: {
          taskId,
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: new Date(cursor.createdAt) } },
                  {
                    createdAt: new Date(cursor.createdAt),
                    id: { lt: cursor.id }
                  }
                ]
              }
            : {})
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        select: COMMENT_SELECT
      });
      const page = comments.slice(0, query.limit);
      const oldestComment = page[page.length - 1];
      return {
        items: [...page].reverse().map(toPublicComment),
        nextCursor:
          comments.length > query.limit && oldestComment
            ? encodeCursor(oldestComment)
            : null
      };
    });
  }

  async searchMentionCandidates(
    userId: string,
    workspaceId: string,
    query: SearchMentionCandidatesQueryDto
  ): Promise<MentionCandidateListDataDto> {
    return this.prisma.$transaction(async (transaction) => {
      const actor = await this.workspaceAuthorization.requireActor(
        userId,
        workspaceId,
        transaction
      );
      const members = await transaction.workspaceMember.findMany({
        where: {
          workspaceId: actor.workspaceId,
          userId: { not: actor.userId },
          user: {
            displayName: {
              contains: query.search,
              mode: Prisma.QueryMode.insensitive
            }
          }
        },
        orderBy: [{ user: { displayName: "asc" } }, { userId: "asc" }],
        take: query.limit,
        select: {
          user: { select: { id: true, displayName: true } }
        }
      });

      return {
        items: members.flatMap(({ user }): MentionCandidateDto[] => {
          const mentionLabel = deriveMentionLabel(user.displayName);
          return mentionLabel
            ? [{ id: user.id, displayName: user.displayName, mentionLabel }]
            : [];
        })
      };
    });
  }

  private async requireTask(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
    projectId: string,
    taskId: string
  ): Promise<void> {
    const project = await transaction.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true }
    });
    if (!project) {
      throw resourceNotFound("Project not found");
    }
    const task = await transaction.task.findFirst({
      where: { id: taskId, projectId },
      select: { id: true }
    });
    if (!task) {
      throw resourceNotFound();
    }
  }
}

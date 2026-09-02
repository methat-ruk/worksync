import { Injectable } from "@nestjs/common";

import type { CommentCreatedEventV1 } from "../comments/comment-created.event";
import {
  NotificationType,
  Prisma
} from "../generated/prisma/client";

function distinctRecipients(event: CommentCreatedEventV1): string[] {
  return [...new Set(event.mentionedUserIds)];
}

@Injectable()
export class NotificationPersistenceService {
  async createForCommentCreated(
    transaction: Prisma.TransactionClient,
    event: CommentCreatedEventV1
  ): Promise<void> {
    if (event.type !== "comment.created" || event.version !== 1) {
      throw new Error("Unsupported comment-created event version");
    }

    const recipientIds = distinctRecipients(event);
    if (recipientIds.length === 0) {
      return;
    }
    if (recipientIds.includes(event.authorId)) {
      throw new Error("Comment author cannot receive a mention notification");
    }

    const [source, recipientCount] = await Promise.all([
      transaction.comment.findFirst({
        where: {
          id: event.commentId,
          authorId: event.authorId,
          task: {
            id: event.taskId,
            project: {
              id: event.projectId,
              workspaceId: event.workspaceId
            }
          }
        },
        select: { id: true }
      }),
      transaction.workspaceMember.count({
        where: {
          workspaceId: event.workspaceId,
          userId: { in: recipientIds }
        }
      })
    ]);

    if (!source || recipientCount !== recipientIds.length) {
      throw new Error("Comment notification source is not valid");
    }

    await transaction.notification.createMany({
      data: recipientIds.map((recipientId) => ({
        type: NotificationType.COMMENT_MENTION,
        eventVersion: event.version,
        recipientId,
        workspaceId: event.workspaceId,
        commentId: event.commentId
      })),
      skipDuplicates: true
    });
  }
}

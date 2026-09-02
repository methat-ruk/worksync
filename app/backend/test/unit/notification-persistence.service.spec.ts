import type { CommentCreatedEventV1 } from "../../src/comments/comment-created.event";
import { NotificationType } from "../../src/generated/prisma/client";
import { NotificationPersistenceService } from "../../src/notifications/notification-persistence.service";

const EVENT: CommentCreatedEventV1 = {
  type: "comment.created",
  version: 1,
  workspaceId: "workspace-1",
  projectId: "project-1",
  taskId: "task-1",
  commentId: "comment-1",
  authorId: "author-1",
  mentionedUserIds: ["recipient-1", "recipient-1", "recipient-2"]
};

describe("NotificationPersistenceService", () => {
  const service = new NotificationPersistenceService();

  it("creates one durable notification for each distinct recipient", async () => {
    const transaction = {
      comment: { findFirst: jest.fn().mockResolvedValue({ id: EVENT.commentId }) },
      workspaceMember: { count: jest.fn().mockResolvedValue(2) },
      notification: { createMany: jest.fn().mockResolvedValue({ count: 2 }) }
    };

    await service.createForCommentCreated(transaction as never, EVENT);

    expect(transaction.comment.findFirst).toHaveBeenCalledWith({
      where: {
        id: EVENT.commentId,
        authorId: EVENT.authorId,
        task: {
          id: EVENT.taskId,
          project: { id: EVENT.projectId, workspaceId: EVENT.workspaceId }
        }
      },
      select: { id: true }
    });
    expect(transaction.notification.createMany).toHaveBeenCalledWith({
      data: [
        {
          type: NotificationType.COMMENT_MENTION,
          eventVersion: 1,
          recipientId: "recipient-1",
          workspaceId: EVENT.workspaceId,
          commentId: EVENT.commentId
        },
        {
          type: NotificationType.COMMENT_MENTION,
          eventVersion: 1,
          recipientId: "recipient-2",
          workspaceId: EVENT.workspaceId,
          commentId: EVENT.commentId
        }
      ],
      skipDuplicates: true
    });
  });

  it("does not query or write when a comment has no mentions", async () => {
    const transaction = {
      comment: { findFirst: jest.fn() },
      workspaceMember: { count: jest.fn() },
      notification: { createMany: jest.fn() }
    };

    await service.createForCommentCreated(transaction as never, {
      ...EVENT,
      mentionedUserIds: []
    });

    expect(transaction.comment.findFirst).not.toHaveBeenCalled();
    expect(transaction.notification.createMany).not.toHaveBeenCalled();
  });

  it("fails closed for a mismatched source or recipient membership", async () => {
    const transaction = {
      comment: { findFirst: jest.fn().mockResolvedValue(null) },
      workspaceMember: { count: jest.fn().mockResolvedValue(1) },
      notification: { createMany: jest.fn() }
    };

    await expect(
      service.createForCommentCreated(transaction as never, EVENT)
    ).rejects.toThrow("Comment notification source is not valid");
    expect(transaction.notification.createMany).not.toHaveBeenCalled();
  });

  it("rejects self-notification events before persistence", async () => {
    const transaction = {
      comment: { findFirst: jest.fn() },
      workspaceMember: { count: jest.fn() },
      notification: { createMany: jest.fn() }
    };

    await expect(
      service.createForCommentCreated(transaction as never, {
        ...EVENT,
        mentionedUserIds: [EVENT.authorId]
      })
    ).rejects.toThrow(
      "Comment author cannot receive a mention notification"
    );
    expect(transaction.notification.createMany).not.toHaveBeenCalled();
  });
});

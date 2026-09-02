import {
  BadRequestException,
  ConflictException,
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
import type {
  ListNotificationsQueryDto,
  MarkAllNotificationsReadDataDto,
  MarkNotificationReadDataDto,
  NotificationListDataDto,
  PublicNotificationDto
} from "./dto/notification.dto";

const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  workspaceId: true,
  readAt: true,
  createdAt: true,
  workspace: { select: { id: true, name: true } },
  comment: {
    select: {
      author: { select: { id: true, displayName: true } },
      task: {
        select: {
          id: true,
          title: true,
          project: {
            select: {
              id: true,
              key: true,
              name: true,
              workspaceId: true
            }
          }
        }
      }
    }
  }
} satisfies Prisma.NotificationSelect;

type NotificationRecord = Prisma.NotificationGetPayload<{
  select: typeof NOTIFICATION_SELECT;
}>;

type NotificationCursor = Readonly<{
  v: 1;
  createdAt: string;
  id: string;
}>;

const ACTIVE_RECIPIENT_WHERE = (userId: string) =>
  ({
    recipientId: userId,
    workspace: { members: { some: { userId } } }
  }) satisfies Prisma.NotificationWhereInput;

function invalidCursor(): BadRequestException {
  return new BadRequestException({
    message: "Notification cursor is not valid",
    code: API_ERROR_CODE.VALIDATION_ERROR
  });
}

function notificationNotFound(): NotFoundException {
  return new NotFoundException({
    message: "Notification not found",
    code: API_ERROR_CODE.RESOURCE_NOT_FOUND
  });
}

function serializationConflict(): ConflictException {
  return new ConflictException({
    message: "Notification state changed concurrently; retry the request",
    code: API_ERROR_CODE.RESOURCE_CONFLICT
  });
}

function encodeCursor(
  notification: Pick<NotificationRecord, "createdAt" | "id">
): string {
  const cursor: NotificationCursor = {
    v: 1,
    createdAt: notification.createdAt.toISOString(),
    id: notification.id
  };
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string): NotificationCursor {
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

function toPublicNotification(
  notification: NotificationRecord
): PublicNotificationDto {
  const project = notification.comment.task.project;
  if (
    notification.workspaceId !== notification.workspace.id ||
    notification.workspaceId !== project.workspaceId
  ) {
    throw new Error("Notification source does not match its workspace");
  }

  return {
    id: notification.id,
    type: notification.type,
    createdAt: notification.createdAt,
    readAt: notification.readAt,
    actor: notification.comment.author,
    workspace: notification.workspace,
    project: {
      id: project.id,
      key: project.key,
      name: project.name
    },
    task: {
      id: notification.comment.task.id,
      title: notification.comment.task.title
    }
  };
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    query: ListNotificationsQueryDto
  ): Promise<NotificationListDataDto> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const activeRecipient = ACTIVE_RECIPIENT_WHERE(userId);

    return this.prisma.$transaction(
      async (transaction) => {
        const [notifications, unreadCount] = await Promise.all([
          transaction.notification.findMany({
            where: {
              ...activeRecipient,
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
            select: NOTIFICATION_SELECT
          }),
          transaction.notification.count({
            where: { ...activeRecipient, readAt: null }
          })
        ]);
        const page = notifications.slice(0, query.limit);
        const lastNotification = page[page.length - 1];
        return {
          items: page.map(toPublicNotification),
          nextCursor:
            notifications.length > query.limit && lastNotification
              ? encodeCursor(lastNotification)
              : null,
          unreadCount
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
  }

  async markRead(
    userId: string,
    notificationId: string
  ): Promise<MarkNotificationReadDataDto> {
    try {
      return await runSerializableTransaction(
        this.prisma,
        async (transaction) => {
          const activeRecipient = ACTIVE_RECIPIENT_WHERE(userId);
          const existing = await transaction.notification.findFirst({
            where: { ...activeRecipient, id: notificationId },
            select: { id: true, readAt: true }
          });
          if (!existing) {
            throw notificationNotFound();
          }

          if (!existing.readAt) {
            await transaction.notification.update({
              where: { id: existing.id },
              data: { readAt: new Date() }
            });
          }

          const [notification, unreadCount] = await Promise.all([
            transaction.notification.findFirst({
              where: { ...activeRecipient, id: existing.id },
              select: NOTIFICATION_SELECT
            }),
            transaction.notification.count({
              where: { ...activeRecipient, readAt: null }
            })
          ]);
          if (!notification) {
            throw notificationNotFound();
          }
          return {
            notification: toPublicNotification(notification),
            unreadCount
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

  async markAllRead(userId: string): Promise<MarkAllNotificationsReadDataDto> {
    try {
      return await runSerializableTransaction(
        this.prisma,
        async (transaction) => {
          const timestamps = await transaction.$queryRaw<Array<{ readAt: Date }>>`
            SELECT transaction_timestamp() AS "readAt"
          `;
          const readAt = timestamps[0]?.readAt;
          if (!readAt) {
            throw new Error("Database transaction timestamp is unavailable");
          }
          const activeRecipient = ACTIVE_RECIPIENT_WHERE(userId);
          const updated = await transaction.notification.updateMany({
            where: {
              ...activeRecipient,
              readAt: null,
              createdAt: { lte: readAt }
            },
            data: { readAt }
          });
          const unreadCount = await transaction.notification.count({
            where: { ...activeRecipient, readAt: null }
          });
          return {
            readAt,
            updatedCount: updated.count,
            unreadCount
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
}

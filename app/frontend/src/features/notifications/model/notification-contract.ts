import { z } from "zod";

export const publicNotificationSchema = z.object({
  id: z.string().min(1),
  type: z.literal("COMMENT_MENTION"),
  createdAt: z.coerce.date(),
  readAt: z.coerce.date().nullable(),
  actor: z.object({
    id: z.string().min(1),
    displayName: z.string().min(1)
  }),
  workspace: z.object({
    id: z.string().min(1),
    name: z.string().min(1)
  }),
  project: z.object({
    id: z.string().min(1),
    key: z.string().min(1),
    name: z.string().min(1)
  }),
  task: z.object({
    id: z.string().min(1),
    title: z.string().min(1)
  })
});

export const notificationListResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(publicNotificationSchema).max(100),
    nextCursor: z.string().min(1).nullable(),
    unreadCount: z.number().int().min(0)
  })
});

export const markNotificationReadResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z.object({
    notification: publicNotificationSchema,
    unreadCount: z.number().int().min(0)
  })
});

export const markAllNotificationsReadResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z.object({
    readAt: z.coerce.date(),
    updatedCount: z.number().int().min(0),
    unreadCount: z.number().int().min(0)
  })
});

export type PublicNotification = z.infer<typeof publicNotificationSchema>;
export type NotificationListData = z.infer<
  typeof notificationListResponseSchema
>["data"];
export type MarkNotificationReadData = z.infer<
  typeof markNotificationReadResponseSchema
>["data"];
export type MarkAllNotificationsReadData = z.infer<
  typeof markAllNotificationsReadResponseSchema
>["data"];

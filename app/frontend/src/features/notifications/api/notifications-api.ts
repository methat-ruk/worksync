import { apiRequest, parseApiError } from "@/lib/api/api-client";

import {
  markAllNotificationsReadResponseSchema,
  markNotificationReadResponseSchema,
  notificationListResponseSchema,
  type MarkAllNotificationsReadData,
  type MarkNotificationReadData,
  type NotificationListData
} from "../model/notification-contract";

export async function listNotifications({
  cursor,
  limit = 20,
  signal
}: {
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
} = {}): Promise<NotificationListData> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) {
    query.set("cursor", cursor);
  }
  const response = await apiRequest(
    `/api/notifications?${query.toString()}`,
    signal ? { signal } : {},
    { authenticated: true }
  );
  if (!response.ok) {
    throw await parseApiError(response);
  }
  return notificationListResponseSchema.parse(await response.json()).data;
}

export async function markNotificationRead(
  notificationId: string,
  signal?: AbortSignal
): Promise<MarkNotificationReadData> {
  const response = await apiRequest(
    `/api/notifications/${encodeURIComponent(notificationId)}/read`,
    { method: "PATCH", ...(signal ? { signal } : {}) },
    { authenticated: true }
  );
  if (!response.ok) {
    throw await parseApiError(response);
  }
  return markNotificationReadResponseSchema.parse(await response.json()).data;
}

export async function markAllNotificationsRead(
  signal?: AbortSignal
): Promise<MarkAllNotificationsReadData> {
  const response = await apiRequest(
    "/api/notifications/read-all",
    { method: "PATCH", ...(signal ? { signal } : {}) },
    { authenticated: true }
  );
  if (!response.ok) {
    throw await parseApiError(response);
  }
  return markAllNotificationsReadResponseSchema.parse(await response.json())
    .data;
}

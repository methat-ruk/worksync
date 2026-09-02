import type { PublicNotification } from "./notification-contract";

function compareNewestFirst(
  left: PublicNotification,
  right: PublicNotification
): number {
  return (
    right.createdAt.getTime() - left.createdAt.getTime() ||
    right.id.localeCompare(left.id)
  );
}

export function mergeNotificationPages(
  existing: readonly PublicNotification[],
  incoming: readonly PublicNotification[],
  preserveAcceptedReadState: boolean
): PublicNotification[] {
  const existingById = new Map(
    existing.map((notification) => [notification.id, notification])
  );
  const merged = new Map<string, PublicNotification>();
  for (const notification of incoming) {
    const current = existingById.get(notification.id);
    merged.set(
      notification.id,
      preserveAcceptedReadState && current?.readAt && !notification.readAt
        ? { ...notification, readAt: current.readAt }
        : notification
    );
  }
  for (const notification of existing) {
    if (!merged.has(notification.id)) {
      merged.set(notification.id, notification);
    }
  }
  return [...merged.values()].sort(compareNewestFirst);
}

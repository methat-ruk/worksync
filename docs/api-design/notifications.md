# Notifications

Notifications are private, recipient-scoped records derived by the server from
validated domain activity. The current source is a version-1 comment-created
event with one `COMMENT_MENTION` notification per distinct mentioned member.

This foundation is stored in-app delivery only. Realtime, email, push,
preferences, and task navigation are separate capabilities.

## Public Shape

Notification responses expose only the information needed to render the item:

- notification ID, type, creation time, and optional read time
- current actor ID and display name
- current workspace ID and name
- current project ID, key, and name
- current task ID and title

Responses never expose `recipientId`, source comment ID or body, event version,
deduplication keys, or mention ranges.

## List Notifications

`GET /api/notifications?limit=<number>&cursor=<opaque>`

- Authentication is required; the recipient is always the authenticated user.
- `limit` defaults to `20` and is bounded to `1..100`.
- Results use `(createdAt, id) DESC` and an opaque versioned cursor.
- The page, next cursor, and count of all currently accessible unread
  notifications are read from one repeatable-read database snapshot.
- Only notifications backed by a source in a workspace where the recipient is
  still a member are visible.

## Mark One Read

`PATCH /api/notifications/:notificationId/read`

- No request body is accepted.
- The operation is idempotent and preserves the first accepted `readAt` value.
- The accepted public notification and authoritative unread count are returned.
- Missing, inaccessible, and another recipient's IDs all use the same
  non-revealing `404 RESOURCE_NOT_FOUND` response.

## Mark All Read

`PATCH /api/notifications/read-all`

- No request body or client timestamp is accepted.
- A serializable transaction uses its database transaction timestamp as both
  cutoff and `readAt`.
- Notifications committed after the transaction's visibility boundary remain
  unread for the next list refresh.
- The response returns `readAt`, `updatedCount`, and the authoritative unread
  count.

## Persistence and Lifecycle

- Comment, mention occurrences, and derived notifications commit in one
  serializable transaction.
- `(recipientId, type, commentId)` is unique, so retries cannot create duplicate
  logical deliveries.
- Removing a member deletes that recipient's notifications for the workspace in
  the same membership-removal transaction.
- Deleting a source comment, workspace, or recipient cascades to its
  notifications.
- No time-based retention job exists yet.

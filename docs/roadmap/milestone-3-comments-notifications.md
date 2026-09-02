# Milestone 3 - Comments, Mentions, and Notifications

Status: In progress - comments, mentions, and stored notifications delivered

## Goal

Users can discuss tasks, mention teammates, receive relevant notifications, and
trust realtime or async delivery does not cross workspace boundaries.

## Foundation Delivered

- workspace-scoped comment list/create APIs and role enforcement
- bounded stable cursor pagination and additive comment indexes
- canonical plain-text comment and durable mention-occurrence persistence
- server-validated mention candidates and UTF-16 ranges
- viewer-accessible task-detail thread and accessible mention composer
- typed versioned `comment.created` event and transaction-coupled notification
  persistence
- private recipient-scoped notification list and idempotent read-state APIs
- app-shell notification panel with unread count, refresh, pagination, and
  recoverable async states
- member-removal cleanup and source lifecycle rules

## Still Required

- realtime notification delivery
- workspace-scoped realtime authorization

Feature plan order:

1. [Comments and Mentions Foundation](feature-plans/completed/comments-mentions-foundation.md) - Done
2. [Notifications Foundation](feature-plans/completed/notifications-foundation.md) - Done

Frontend prerequisites, task policy cleanup, Comments and Mentions Foundation,
and stored Notifications Foundation are complete. Realtime delivery remains a
separate collaboration slice.

## Exit Criteria

- mention and stored-notification rules are tested: Done
- realtime events do not cross workspace boundaries: Not done
- background jobs are idempotent where applicable: Not done

## Related Docs

- [Domain Model](../domain-model.md)
- [API Design](../api-design.md)
- [Security Model](../security-model.md)

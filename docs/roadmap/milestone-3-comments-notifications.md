# Milestone 3 - Comments, Mentions, and Notifications

Status: In progress - comments and mentions delivered

## Goal

Users can discuss tasks, mention teammates, receive relevant notifications, and
trust realtime or async delivery does not cross workspace boundaries.

## Foundation Delivered

- workspace-scoped comment list/create APIs and role enforcement
- bounded stable cursor pagination and additive comment indexes
- canonical plain-text comment and durable mention-occurrence persistence
- server-validated mention candidates and UTF-16 ranges
- viewer-accessible task-detail thread and accessible mention composer
- typed notification-ready `comment.created` result, not yet published

## Still Required

- notification model
- notification creation rules
- notification read/unread state
- realtime notification delivery
- workspace-scoped realtime authorization
- notification and mention tests

Feature plan order:

1. [Comments and Mentions Foundation](feature-plans/completed/comments-mentions-foundation.md) - Done
2. [Notifications Foundation](feature-plans/planned/notifications-foundation.md)

Frontend prerequisites, task policy cleanup, and Comments and Mentions
Foundation are complete. Notifications Foundation is the next ordered
collaboration slice.

## Exit Criteria

- mention and notification rules are tested: Not done
- realtime events do not cross workspace boundaries: Not done
- background jobs are idempotent where applicable: Not done

## Related Docs

- [Domain Model](../domain-model.md)
- [API Design](../api-design.md)
- [Security Model](../security-model.md)

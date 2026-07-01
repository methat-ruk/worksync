# Milestone 3 - Comments, Mentions, and Notifications

Status: Partial foundation only

## Goal

Users can discuss tasks, mention teammates, receive relevant notifications, and
trust realtime or async delivery does not cross workspace boundaries.

## Foundation Already Present

- Prisma `Comment` model
- task/comment/user relations
- planned realtime event names in API documentation

## Still Required

- comment APIs
- comment frontend UI
- mention parsing
- notification model
- notification creation rules
- notification read/unread state
- realtime notification delivery
- workspace-scoped realtime authorization
- notification and mention tests

## Exit Criteria

- mention and notification rules are tested: Not done
- realtime events do not cross workspace boundaries: Not done
- background jobs are idempotent where applicable: Not done

## Related Docs

- [Domain Model](../domain-model.md)
- [API Design](../api-design.md)
- [Security Model](../security-model.md)

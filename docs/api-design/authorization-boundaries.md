# Authorization and Boundaries

This file owns cross-cutting authorization and workspace-boundary rules for API
design. Endpoint-specific contracts may add stricter requirements.

## Authorization

Every protected endpoint must enforce:

- workspace membership
- role authority
- resource ownership or workspace boundary
- action-specific rules

Frontend visibility does not authorize backend actions.

## Workspace Boundary

Workspace is the tenant boundary.

All routes that operate on workspace-scoped resources must derive or validate
workspace scope from trusted backend state, not only from client-provided
identifiers.

High-risk endpoints:

- list/search/count
- exports
- file access
- realtime subscription setup
- background-job-triggering endpoints

## Realtime Events

API mutations that emit realtime updates must:

- persist the authoritative state first
- emit only to authorized workspace members
- avoid exposing sensitive payloads
- keep event payloads compatible with API contracts

Common event names:

- `task.created`
- `task.updated`
- `comment.created`
- `notification.created`

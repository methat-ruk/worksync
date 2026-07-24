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

Missing caller membership should use the same public not-found shape as missing
workspace resources when revealing existence would expose tenant information.
Role-authority failures after membership is proven should return a stable
forbidden error.

High-risk endpoints:

- list/search/count
- exports
- file access
- realtime subscription setup
- background-job-triggering endpoints

### Trusted Workspace Actor Boundary

`WorkspacesModule` owns and exports `WorkspaceAuthorizationService`. A
downstream workspace-scoped use case resolves its current authorization context
with authenticated server-owned `userId` and the requested `workspaceId`.

The returned `WorkspaceActor` is an immutable internal projection containing
only:

- `workspaceId`
- `userId`
- `role`

The resolver proves current workspace membership. It does not authorize a
specific action, return a persistence entity, or replace resource scoping.
Consumers must:

- apply action-specific policy after membership is proven
- constrain every resource query to `actor.workspaceId`
- never accept caller identity or role from request payloads
- never serialize or cache the actor across requests
- pass the active database transaction to the resolver when authorization and
  mutation belong to one transaction

Absent, removed, or cross-workspace membership fails with the same public
`404 RESOURCE_NOT_FOUND` workspace-not-found contract. A proven member without
authority for the requested action receives the stable forbidden contract.

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

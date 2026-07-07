# Workspace Management API

Workspace foundation endpoints require a valid access token and return only
workspaces where the authenticated user has membership.

## Endpoints

- `POST /api/workspaces` creates a workspace from `{ "name": string }`.
  Names are trimmed, required after trimming, and limited to 100 characters.
  Clients do not submit slugs; the backend generates a unique slug and creates
  the creator's `OWNER` membership in the same transaction. Slug generation
  first tries the base slug and `-2` through `-5`; if those deterministic
  candidates are already taken, the backend falls back to bounded random suffix
  attempts.
- `GET /api/workspaces` lists the caller's workspaces with `page` and
  `pageSize`. The default page is `1`, default page size is `20`, and maximum
  page size is `100`. Unknown query fields, non-integer pagination values, and
  out-of-range pagination values return `400` with `VALIDATION_ERROR`.
- `GET /api/workspaces/:id` returns the same public workspace DTO for a visible
  workspace and returns `404` with `RESOURCE_NOT_FOUND` when the workspace does
  not exist or is not visible to the caller.
- `GET /api/workspaces/:workspaceId/members` lists workspace members for
  `OWNER` and `ADMIN` callers. It uses `page` and `pageSize` with the same
  defaults and maximums as workspace lists.
- `POST /api/workspaces/:workspaceId/members` adds an existing user by email
  from `{ "email": string, "role": "ADMIN" | "MEMBER" | "VIEWER" }`.
- `PATCH /api/workspaces/:workspaceId/members/:memberId` updates a member role
  from `{ "role": "ADMIN" | "MEMBER" | "VIEWER" }` when the caller has
  authority over both the current and requested role.
- `DELETE /api/workspaces/:workspaceId/members/:memberId` removes a member when
  the caller has authority over the target member.

## Public Workspace DTO

Public workspace responses expose:

- `id`
- `name`
- `slug`
- `createdAt`
- `updatedAt`
- caller's `membershipRole`

They must not expose Prisma relations or other members by default.

## Public Workspace Member DTO

Workspace member responses expose:

- `id`
- `userId`
- `email`
- `displayName`
- `role`
- `createdAt`

Member email and display name are exposed only through member-management
endpoints available to `OWNER` and `ADMIN` callers.

## List Contract

Workspace and member list responses include `items`, `page`, `pageSize`, and
`total`. Workspace ordering is `updatedAt` descending with `id` as a stable
tie-breaker. Member ordering is `createdAt` ascending with `id` as a stable
tie-breaker.

## Membership Role Rules

Workspace member management is server-authorized:

- `OWNER` can add, update, or remove `ADMIN`, `MEMBER`, and `VIEWER` members.
- `ADMIN` can add, update, or remove `MEMBER` and `VIEWER` members only.
- `MEMBER` and `VIEWER` cannot use member-management endpoints.
- callers cannot remove themselves, demote themselves, create `OWNER` members,
  remove owners, demote owners, or transfer ownership in this slice.

Missing caller membership, missing workspace, and cross-workspace target member
IDs return `404` with `RESOURCE_NOT_FOUND`. Insufficient role authority returns
`403` with `AUTHORIZATION_DENIED`.

## Slug Conflicts

If all bounded slug generation attempts conflict, the create request returns
`409` with `RESOURCE_CONFLICT`. Raw database constraint details must not appear
in public responses.

Duplicate workspace membership returns `409` with `RESOURCE_CONFLICT`. Adding an
email address that is not available to add returns a generic `404` to avoid
exposing extra account detail.

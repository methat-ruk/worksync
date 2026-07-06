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

## Public Workspace DTO

Public workspace responses expose:

- `id`
- `name`
- `slug`
- `createdAt`
- `updatedAt`
- caller's `membershipRole`

They must not expose Prisma relations or other members by default.

## List Contract

Workspace list responses include `items`, `page`, `pageSize`, and `total`.
Ordering is `updatedAt` descending with `id` as a stable tie-breaker.

## Slug Conflicts

If all bounded slug generation attempts conflict, the create request returns
`409` with `RESOURCE_CONFLICT`. Raw database constraint details must not appear
in public responses.

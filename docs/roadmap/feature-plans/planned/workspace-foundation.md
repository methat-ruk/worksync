# Feature Plan: Workspace Foundation

Status: Next

Intended PR: `feat/workspace-foundation`

Milestone: 1 - Identity and Workspace

## Goal

Allow an authenticated user to create and read their own workspace foundation
without weakening tenant isolation.

## Scope

- workspace create API
- current user's workspace list/read API
- owner membership creation when a workspace is created
- public workspace and membership DTOs
- Swagger/API contract documentation
- backend integration, contract, and security tests

## API Contract Decisions

- `POST /api/workspaces` accepts `{ name: string }` only.
- Workspace names are trimmed, required after trimming, and limited to 100
  characters.
- Unknown request fields are rejected by the existing validation pipeline.
- The backend generates the workspace slug from `name`; clients do not submit a
  slug in this slice.
- Slug generation handles unique conflicts with up to five attempts using the
  base slug, then `-2` through `-5`, rather than exposing database errors.
- If all slug attempts conflict, the create request returns `409` with
  `RESOURCE_CONFLICT`.
- `GET /api/workspaces` uses page pagination with `page` and `pageSize`;
  default `page` is 1, default `pageSize` is 20, and maximum `pageSize` is 100.
- Pagination query values must be integers: `page` must be at least 1 and
  `pageSize` must be between 1 and 100. Invalid or unknown query fields return
  `400` with `VALIDATION_ERROR`.
- Workspace list responses include `items`, `page`, `pageSize`, and `total`.
- Workspace list ordering is `updatedAt` descending with `id` as a stable
  tie-breaker.
- `GET /api/workspaces/:id` returns the same public workspace DTO for visible
  workspaces and `404` with `RESOURCE_NOT_FOUND` for missing or non-visible
  workspaces.
- Public workspace DTOs expose only `id`, `name`, `slug`, `createdAt`,
  `updatedAt`, and the caller's `membershipRole`.

## Out of Scope

- invitations
- member management UI
- role editing
- project/task APIs
- realtime workspace events
- billing or organization settings

## Affected Surfaces

- backend API
- Prisma queries against existing workspace models
- Swagger/OpenAPI
- backend integration/contract/security tests
- frontend contract assumptions only if a thin placeholder call is needed

## Security and Data Boundary

Every workspace read must be scoped through authenticated membership. Frontend
route guards or hidden buttons are not authorization evidence.

Direct reads for workspaces outside the authenticated user's memberships must
return `404` rather than reveal cross-workspace existence.

## Required Evidence

- create workspace success
- creator becomes `OWNER`
- list returns only workspaces where the user is a member
- direct cross-user workspace read is rejected
- list pagination default, maximum page size, and stable ordering are covered
- invalid, empty, overlong, and unknown-field create requests are rejected
- slug collisions do not leak raw database errors
- exhausted slug retries return a safe `409` conflict
- invalid pagination and unknown query fields return validation errors
- response/error envelope follows project convention
- Swagger documents success and error contracts
- typecheck, lint, relevant backend tests, and build

## Validation Gate

Before running database-backed validation, confirm:

- `app/backend/.env` exists and defines `TEST_DATABASE_URL`
- local PostgreSQL infrastructure is running
- the `worksync_test` database exists
- committed migrations are applied to `worksync_test`

If any prerequisite is missing, stop and fix the local setup before running the
affected integration, contract, or security tests. Skipped database-backed
integration or security suites are incomplete evidence for this plan.

## Done Criteria

- API contract is stable enough for frontend bootstrap
- IDOR/BOLA tests cover direct workspace ID access
- no project/task behavior is introduced in this PR

## Dependencies

- auth foundation
- session lifecycle
- existing Prisma workspace models

## Follow-up

- workspace membership and RBAC
- workspace frontend bootstrap

# Feature Plan: Workspace Membership and RBAC

Status: Done

Intended PR: `feat/workspace-membership-rbac`

Milestone: 1 - Identity and Workspace

## Goal

Allow workspace owners or admins to manage members and enforce role-based
workspace access consistently across backend routes.

## Scope

- finalize workspace role matrix for workspace-level member management
- membership list/add/update/remove for existing users
- RBAC guard or policy boundary
- workspace-scoped authorization helpers
- API contracts and Swagger docs
- integration/security tests for role and tenant isolation

## API Contract Decisions

- `GET /api/workspaces/:workspaceId/members` lists members for `OWNER` and
  `ADMIN` callers only.
- `POST /api/workspaces/:workspaceId/members` adds an existing user by email
  with `{ email, role }`; invitation token and email delivery are out of scope.
- `PATCH /api/workspaces/:workspaceId/members/:memberId` updates a member role.
- `DELETE /api/workspaces/:workspaceId/members/:memberId` removes a member.
- `OWNER` can manage `ADMIN`, `MEMBER`, and `VIEWER`; `ADMIN` can manage only
  `MEMBER` and `VIEWER`.
- `OWNER` creation, ownership transfer, self-demotion, self-removal, and owner
  removal or demotion are rejected in this slice.
- Missing membership or cross-workspace member targeting returns `404` with
  `RESOURCE_NOT_FOUND`.
- Insufficient role authority returns `403` with `AUTHORIZATION_DENIED`.

## Out of Scope

- full invitation email workflow
- ownership transfer
- project/task-specific role permissions
- frontend settings page polish
- billing roles

## Affected Surfaces

- backend authorization
- API contracts
- Prisma membership queries
- security tests
- frontend assumptions for workspace settings

## Security and Data Boundary

Role checks must be enforced server-side. Every protected query must include
workspace membership or an equivalent authorization proof.

## Required Evidence

- owner/admin allowed actions
- member/viewer denied actions where applicable
- cross-workspace and cross-user access rejected
- deleted or missing membership rejected
- contract tests for 401/403/404 behavior
- log output does not leak sensitive membership data

## Validation Gate

Before running database-backed validation, confirm:

- `app/backend/.env` exists and defines `TEST_DATABASE_URL`
- local PostgreSQL infrastructure is running
- the `worksync_test` database exists
- committed migrations are applied to `worksync_test`

If any prerequisite is missing, stop and fix the local setup before running the
affected integration or security tests. Skipped database-backed integration or
security suites are incomplete evidence for this plan.

## Done Criteria

- role matrix is documented
- RBAC helpers are reusable for project/task routes
- workspace isolation evidence exists before dependent feature work begins

## Dependencies

- workspace foundation

## Follow-up

- workspace frontend bootstrap
- project foundation

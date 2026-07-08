# Feature Plan: Workspace Frontend Bootstrap

Status: Done

Intended PR: `feat/workspace-frontend-bootstrap`

Milestone: 1 - Identity and Workspace

## Goal

Give authenticated users a real workspace entry point instead of a static app
shell placeholder.

## Delivered Scope

- fetch current user's workspaces
- empty state for no workspace
- create workspace flow
- workspace selection shell state
- loading, error, empty, and success states
- frontend tests and browser E2E for the first workspace path
- frontend workspace contract schemas for the existing backend workspace
  envelopes
- shared frontend API access that reuses the existing auth-aware
  request/refresh/token flow

## Out of Scope

- member management UI
- project/task pages
- realtime updates
- advanced workspace settings
- backend API, schema, migration, or authorization changes unless a contract gap
  is found and the plan is reviewed again

## Affected Surfaces

- frontend app shell
- frontend API client
- browser E2E
- backend contract consumption

## Implementation Decisions

- Workspace API calls must reuse the existing frontend auth-aware request,
  refresh, and access-token flow. Do not duplicate access-token state or refresh
  retry logic in a separate workspace module.
- Selected workspace is local UI state only in this slice. Refreshing `/app`
  reselects the first listed workspace unless a workspace was just created in
  the current browser session.
- Backend workspace contracts remain the source of truth. Frontend schemas map
  to the documented `GET /api/workspaces` and `POST /api/workspaces` envelopes
  without changing backend behavior.

## Security and Data Boundary

Frontend state must not be treated as authorization. Backend workspace APIs must
already enforce membership before this plan depends on them.

Workspace visibility, role, and membership are display and navigation inputs in
the frontend. They do not authorize API actions.

## Required Evidence

- authenticated user sees their workspace list: Done
- no-workspace empty state is clear: Done
- create workspace success path: Done
- API error path: Done
- protected route remains protected after refresh: Done
- browser E2E for critical path: Done
- frontend workspace schemas align with the documented backend workspace
  response envelopes: Done
- create/list API errors show safe user feedback and do not leave the UI stuck
  loading: Done
- duplicate workspace create submission is prevented while the request is
  pending: Done

## Evidence

- frontend typecheck
- frontend lint
- frontend unit/component tests for workspace schemas, API client behavior,
  loading/empty/error/success states, create form validation, and duplicate
  submit prevention
- frontend production build
- Playwright browser E2E for authenticated workspace list, no-workspace empty
  state, create workspace success, API error feedback, protected-route refresh,
  console errors, visible content, navigation, auth state, role visibility, and
  responsive layout
- frontend workspace schemas verified against `docs/api-design/workspaces.md`
  and existing backend contract behavior

## Done Criteria

- app shell uses real workspace data: Done
- UI does not fake completed workspace features: Done
- project/task navigation remains disabled or clearly planned: Done
- validation reports passed, failed, skipped, blocked, missing evidence, and
  remaining risk by changed surface: Done

## Dependencies

- workspace foundation
- workspace membership/RBAC

## Follow-up

- project foundation
- frontend shared API client cleanup: move authenticated HTTP request/error
  handling out of the auth feature so workspace, project, and task clients do
  not depend on auth internals for shared transport behavior

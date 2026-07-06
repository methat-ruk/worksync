# Feature Plan: Workspace Frontend Bootstrap

Status: Planned

Intended PR: `feat/workspace-frontend-bootstrap`

Milestone: 1 - Identity and Workspace

## Goal

Give authenticated users a real workspace entry point instead of a static app
shell placeholder.

## Scope

- fetch current user's workspaces
- empty state for no workspace
- create workspace flow
- workspace selection shell state
- loading, error, empty, and success states
- frontend tests and browser E2E for the first workspace path

## Out of Scope

- member management UI
- project/task pages
- realtime updates
- advanced workspace settings

## Affected Surfaces

- frontend app shell
- frontend API client
- browser E2E
- backend contract consumption

## Security and Data Boundary

Frontend state must not be treated as authorization. Backend workspace APIs must
already enforce membership before this plan depends on them.

## Required Evidence

- authenticated user sees their workspace list
- no-workspace empty state is clear
- create workspace success path
- API error path
- protected route remains protected after refresh
- browser E2E for critical path

## Done Criteria

- app shell uses real workspace data
- UI does not fake completed workspace features
- project/task navigation remains disabled or clearly planned

## Dependencies

- workspace foundation
- workspace membership/RBAC if create/list contracts depend on role policy

## Follow-up

- project foundation

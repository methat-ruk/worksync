# Feature Plan: Frontend Structure Boundaries

Status: Planned

Intended PR: `feat/frontend-structure-boundaries`

Milestone: 1 - Identity and Workspace

## Goal

Separate frontend ownership boundaries before project and task work adds more
workspace-scoped clients and screens.

This refactor should preserve browser-visible behavior while making auth,
shared API transport, workspace UI, app shell, brand, and provider ownership
clear enough for the next feature slices.

## Scope

- shared frontend API error and transport boundary under
  `app/frontend/src/lib/api/`
- auth API keeps auth endpoint behavior and wires refresh/session behavior into
  the shared transport without the shared API client importing auth internals
- workspace API uses the shared API client and error types instead of importing
  from the auth feature
- workspace dashboard, create, list, and workspace-home UI move under the
  workspace feature boundary
- app shell remains responsible for layout, navigation, profile menu, selected
  workspace shell state, and session actions
- shared brand and application provider components move out of the auth feature
- frontend unit, component, and browser E2E evidence proves behavior remains
  unchanged
- roadmap and feature-plan status docs stay aligned with the new work order

## Out of Scope

- backend API, DTO, Swagger, Prisma, migration, or authorization changes
- project and task APIs, pages, or workflows
- new server-state, cache, or data-fetching dependency
- Docker, CI, runtime, or environment changes
- visual redesign beyond behavior-preserving component ownership moves

## Affected Surfaces

- frontend module boundaries
- shared frontend API transport and error handling
- auth and workspace frontend clients
- app shell and `/app` composition
- frontend unit/component tests
- frontend browser E2E
- roadmap and feature-plan docs

## Security and Data Boundary

- Frontend state must not be treated as authorization.
- Backend authorization and workspace isolation remain the source of truth.
- The shared API client must not store refresh tokens or read HttpOnly cookies.
- Access-token state remains in memory only.
- `app/frontend/src/lib/api/` must not import from `features/auth`.
- The auth feature may register or provide refresh/session behavior to the
  shared client, but transport/error handling must not depend on auth feature
  internals.
- Workspace API and UI code must not import auth API internals for shared
  transport or error behavior.

## Required Evidence

- shared API client coverage for API base URL handling, JSON content type,
  credentialed requests, bearer token attachment, failed JSON fallback, and
  one-time refresh retry behavior without an infinite retry loop
- auth API or session tests prove access token update, clear, logout, and
  refresh behavior remain equivalent, including concurrent refresh coalescing
  when the existing behavior supports it
- workspace API tests prove list/create calls use the shared API boundary and
  no longer depend on auth feature internals
- workspace home tests prove loading, empty, error, success, create validation,
  pending, and disabled states remain equivalent
- browser E2E proves landing, auth, `/app`, workspace list/create, protected
  route refresh, logout, visible content, navigation, auth state, role
  visibility, responsive layout, and blocking console-error behavior remain
  acceptable
- static review or test coverage confirms no circular import from shared API
  code back into auth feature code
- docs/status updates record the new planned slice before implementation
  closeout

## Done Criteria

- `features/workspaces` does not import `features/auth/api/*` for shared
  transport or API error behavior
- workspace error messaging imports shared API error types
- app shell no longer owns workspace dashboard, create, list, or workspace-home
  UI implementation details
- shared brand and application providers are not owned by the auth feature
  unless they directly implement auth behavior
- browser-visible behavior is unchanged except for any explicitly reviewed
  polish needed to preserve the existing design system
- validation reports passed, failed, skipped, blocked, missing evidence, and
  remaining risk by changed surface
- when the whole PR-sized plan is complete, move this feature plan from
  planned to completed and update affected roadmap and milestone status docs

## Dependencies

- workspace foundation
- workspace membership/RBAC
- workspace frontend bootstrap

## Follow-up

- project foundation
- task foundation
- revisit server-state or cache strategy only after projects and tasks introduce
  shared invalidation or cross-screen data consistency needs

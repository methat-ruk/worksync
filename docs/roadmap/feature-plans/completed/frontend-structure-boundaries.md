# Feature Plan: Frontend Structure Boundaries

Status: Done

Intended PR: `feat/frontend-structure-boundaries`

Milestone: 1 - Identity and Workspace

## Goal

Separate frontend ownership boundaries before project and task work adds more
workspace-scoped clients and screens.

## Delivered Scope

- shared frontend API error, transport, and access-token state under
  `app/frontend/src/lib/api/`
- auth API keeps auth endpoint behavior, refresh coalescing, and refresh
  handler registration without `lib/api` importing auth feature code
- workspace API uses the shared API client and shared API error types instead
  of importing auth API internals
- workspace dashboard, create, list, and workspace-home UI moved under the
  workspace feature boundary
- app shell remains focused on layout, navigation, profile menu, theme, and
  session actions
- shared brand and application provider components moved out of the auth
  feature
- frontend unit/component tests and browser E2E prove behavior remains
  equivalent
- roadmap and feature-plan status docs reflect project foundation as the next
  planned slice

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

## Implementation Decisions

- `app/frontend/src/lib/api/` owns generic API transport, API error parsing, and
  in-memory access-token state.
- `lib/api` stays auth-feature agnostic. It accepts a refresh handler but does
  not import auth feature code.
- Auth API remains responsible for auth endpoint contracts, access-token
  updates, logout clearing, and refresh coalescing.
- Workspace API and workspace UI do not import auth API internals for shared
  transport or error behavior.
- Workspace home accepts only the user display data it needs instead of binding
  the workspace feature to the auth user contract.
- Shared brand and root application providers are not owned by the auth feature.

## Security and Data Boundary

Frontend state remains display and request context only. Backend authorization
and workspace isolation remain the source of truth.

The shared API client does not store refresh tokens or read HttpOnly cookies.
Access-token state remains in memory only. Auth refresh still relies on the
existing cookie-backed refresh endpoint and one-time retry behavior.

## Required Evidence

- shared API client coverage for API base URL handling, JSON content type,
  credentialed requests, bearer token attachment, failed JSON fallback, and
  one-time refresh retry without an infinite retry loop: Done
- auth API/session tests prove concurrent refresh coalescing and access-token
  update behavior remains equivalent: Done
- workspace API tests prove list/create calls use the shared API boundary and
  no longer depend on auth feature internals: Done
- workspace home tests prove loading, empty, error, success, create validation,
  pending, and disabled states remain equivalent: Done
- browser E2E proves landing, auth, `/app`, workspace list/create, protected
  route refresh, logout, visible content, navigation, auth state, role
  visibility, responsive layout, and blocking console-error behavior remain
  acceptable: Done
- static import review confirms no circular import from shared API code back
  into auth feature code: Done

## Evidence

- `corepack pnpm validate:frontend`
- `corepack pnpm test:e2e:frontend`
- pre-push hook: `corepack pnpm typecheck`, `corepack pnpm lint`, and
  `corepack pnpm --filter @worksync/backend test:unit`
- CI: PR review evidence, backend validation, frontend validation, frontend
  E2E, container topology and images, and dependency audit

## Done Criteria

- `features/workspaces` does not import `features/auth/api/*` for shared
  transport or API error behavior: Done
- workspace error messaging imports shared API error types: Done
- app shell no longer owns workspace dashboard, create, list, or workspace-home
  UI implementation details: Done
- shared brand and application providers are not owned by the auth feature:
  Done
- browser-visible behavior remains equivalent: Done
- validation reports passed, failed, skipped, blocked, missing evidence, and
  remaining risk by changed surface: Done

## Dependencies

- workspace foundation
- workspace membership/RBAC
- workspace frontend bootstrap

## Follow-up

- project foundation
- task foundation
- revisit server-state or cache strategy only after projects and tasks introduce
  shared invalidation or cross-screen data consistency needs

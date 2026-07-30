# Feature Plan: Workspace Pagination and Selection

Status: Completed

Plan review: Implemented and validated on 2026-07-23

Intended PR: `fix/workspace-pagination-and-selection`

Milestone: Repository Health Remediation

Impact: Bounded change (Tier 1) because it corrects user-visible list behavior
without changing the existing API contract.

## Goal

Let users discover and select every workspace they can access and display an
accurate total when the account has more workspaces than the first API page.

## Delivered Scope

- parameterized the internal workspace client while preserving the existing
  authenticated endpoint, response schema, and default page size
- accumulated later pages in local `WorkspaceHome` state and deduplicated
  results by workspace identifier
- displayed the API total separately from the number of loaded workspaces
- added a user-triggered Load more action with pending and exhausted states
- preserved selection while pages load and selected a workspace returned on a
  later page
- preserved accumulated items, total, and selection when a workspace is
  created
- retained loaded workspaces after a later-page failure and exposed one inline
  retry action
- detected inconsistent final-page evidence and exposed a bounded refresh
  recovery path instead of requesting the same page indefinitely
- serialized explicit refresh and workspace creation so a stale refresh cannot
  replace a newly created workspace in local state, while preserving safe
  create-and-load-more concurrency
- preserved keyboard-accessible workspace selection, polite count updates, and
  responsive behavior

## Key Decisions

- use Load more rather than numbered pagination, infinite scroll, or URL-owned
  state for this bounded app-shell workflow
- keep pagination and selection state local; no global store or server-state
  dependency was introduced
- use the API `total` as the count authority while never allowing it to fall
  below confirmed unique items or a confirmed local create result during page
  accumulation
- determine page exhaustion from `page * pageSize >= total`
- replace accumulated state on explicit refresh and retain the selected
  identifier only when it exists in the refreshed first page
- prevent explicit refresh and workspace creation from overlapping because
  refresh replaces the collection; allow creation and page accumulation to
  overlap because both reducer paths preserve unique confirmed items
- keep the backend API and authorization boundary unchanged

## Security and Data Boundary

Pagination continues to use the authenticated current-user workspace endpoint.
The frontend displays only returned workspace records and does not infer
membership or use client selection as an authorization decision.

## Validation Evidence

- workspace API tests cover default and later-page query serialization and
  response metadata
- component tests cover accumulation, later-page selection, failure and retry,
  duplicate results, final-page inconsistency recovery, duplicate-request
  prevention, refresh/create mutual exclusion, safe create/load-more
  concurrency, and create-after-pagination behavior
- the full frontend unit/component suite passes
- Playwright covers a 21-workspace mobile journey, page-two loading,
  later-page selection, loaded-versus-total state, and console errors
- frontend typecheck, lint, production build, and diff hygiene pass
- post-implementation review covered maintainability, React state handling,
  partial failure and recovery, accessibility, and the web security baseline

The production dependency audit passes after the CI-driven Next.js security
patch update. Backend, database, Docker, and live-auth suites were not required
for the pagination behavior because their contracts and guarantees did not
change.

## Residual Risk and Recovery

Offset pagination does not provide snapshot consistency while the underlying
list changes. Identifier deduplication, effective-total protection, and the
explicit refresh path keep this recoverable at the current scale. Revisit
cursor pagination only when scale or query evidence justifies an API migration.

There are no schema or backend contract changes. The frontend API, state, UI,
and regression-test slice can be reverted together.

## Dependencies

- [Workspace Frontend Bootstrap](workspace-frontend-bootstrap.md)
- [Frontend Structure Boundaries](frontend-structure-boundaries.md)

## Follow-up

[Workspace Authorization Boundary](workspace-authorization-boundary.md) is
complete. [Project Foundation](project-foundation.md) is complete, and
[Task Foundation](../planned/task-foundation.md) is the next planned slice.

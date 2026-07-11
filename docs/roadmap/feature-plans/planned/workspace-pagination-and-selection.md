# Feature Plan: Workspace Pagination and Selection

Status: Planned

Intended PR: `fix/workspace-pagination-and-selection`

Milestone: Repository Health Remediation

Impact: Bounded change (Tier 1) because it corrects user-visible list behavior
without changing the existing API contract.

## Goal

Let users discover and select every workspace they can access and display an
accurate total when the account has more workspaces than the first API page.

## Source Finding

The frontend requests a fixed first page with `pageSize=20`, renders the length
of that page as the total, and provides no path to later workspaces even though
the backend response already includes pagination metadata.

## Acceptance Criteria

- users with more than 20 workspaces can reach and select later results
- the displayed count uses the API `total`, not the loaded item count
- selected-workspace state remains valid as pages load or a workspace is created
- loading, empty, partial, error, retry, and duplicate-result states are defined
- existing users with 20 or fewer workspaces see no workflow regression

## Assumptions

- the existing page/pageSize response and `total` are stable enough for this
  slice
- cursor pagination is not required for the current scale
- workspace selection remains local frontend state

## Scope

- consume pagination metadata in the workspace frontend API/store boundary
- add a bounded page navigation, load-more, or equivalent selection affordance
- display accurate loaded-versus-total state where relevant
- preserve a valid selection across fetch and create transitions
- add unit, component, and browser regression evidence

## Out of Scope

- changing backend pagination to cursor-based pagination
- workspace search, sorting, favorites, or archival
- changing membership or workspace authorization policy
- project or task navigation

## Affected Surfaces

- workspace frontend API types and query calls
- workspace state/selection owner
- workspace list and app-shell UI
- frontend tests and browser workflow

## Security and Data Boundary

Pagination must continue to use the current-user workspace endpoint. Client
state must not infer membership or construct access from untrusted workspace
identifiers.

## Implementation Slices

1. Define pagination and selection invariants at the frontend store boundary.
2. Consume API pagination metadata and implement the smallest accessible UI
   control for later results.
3. Preserve selection through page changes, retries, and workspace creation.
4. Add large-list regression tests and validate the rendered workflow.

## Required Evidence

- API/store tests where `total` is greater than the returned item count
- component tests for later-page selection, retry, empty, and duplicate handling
- regression test for selection after creating a workspace
- browser evidence with more than 20 workspaces or a deterministic mocked
  equivalent at the browser boundary
- frontend typecheck, lint, unit tests, and production build

## Rollback and Forward Fix

No data or backend contract changes are expected. The UI/store slice can be
reverted together. If the page contract proves insufficient, stop and plan a
separate API pagination migration rather than extending this PR.

## Approval and Decision Gates

- choose and review the pagination interaction before implementation
- re-plan if a backend API contract change becomes necessary

## Done Criteria

- every accessible workspace can be reached through the UI
- count and selection behavior match backend evidence
- all acceptance criteria have mapped passing evidence

## Dependencies

- completed workspace frontend bootstrap
- completed frontend structure boundaries

## Follow-up

- revisit cursor pagination only when repository scale or query evidence
  justifies it

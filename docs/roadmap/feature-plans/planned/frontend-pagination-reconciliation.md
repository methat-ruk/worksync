# Feature Plan: Frontend Pagination Reconciliation

Status: Planned

Intended PR: `refactor/frontend-pagination-reconciliation`

Milestone: Cross-cutting frontend remediation before Milestone 3

Impact: Bounded shared frontend data-contract refactor

## Goal

Replace duplicated project, task, assignee, and eligible workspace page-merging
logic with the smallest explicit, pure reconciliation contract while preserving
each feature's selection, request, and mutation behavior.

## Existing Foundation

- Project, task, and assignee collections implement similar replace/append and
  deduplication behavior in feature-local helpers.
- Workspace pagination also reconciles pages but owns selection and partial-
  failure behavior that may not share the same contract.
- Existing tests cover feature workflows, but the shared collection semantics
  are not named or tested as one contract.

## Acceptance Criteria

- Consumer semantics are inventoried before extraction; intentionally different
  behavior remains feature-local.
- One pure utility is introduced only for replace/append, ID-based
  reconciliation, and total metadata proven common across consumers.
- The utility name, input type, return type, and behavior align; it does not
  return `unknown` or `any`.
- Parser, validator, transformer, fetch, selection, and mutation responsibilities
  do not enter the reconciliation utility.
- Duplicate IDs, updated items, empty pages, total changes, and replacement
  versus append behavior are deterministic and tested.
- Workspace selection and partial-failure behavior remain local unless evidence
  proves they use the exact shared contract.
- Project, task, assignee, and affected workspace browser behavior remains
  unchanged.

## Required Decisions Before Implementation

- Approve the exact common semantics after comparing every current consumer.
- Decide whether workspace pagination is a consumer or a documented exception.
- Approve an explicit contract such as `PaginatedCollection<T>` plus
  `reconcilePaginatedCollection`; rename it if repository terminology provides
  clearer semantics.

## Scope

- characterize current project/task/assignee/workspace page reconciliation
- introduce one pure typed collection reconciliation utility for proven common
  semantics
- migrate eligible consumers one at a time
- retain feature-local selection, request, mutation, and error-state ownership
- focused pure-unit and consumer regression evidence
- affected architecture and roadmap documentation

## Out of Scope

- task component decomposition or accessibility changes
- backend task policy cleanup
- API pagination contract changes
- new cache/state/query library
- cursor migration or a generic data-access framework
- changes to loading, retry, selection, or mutation UX

## Affected Surfaces

- project page reconciliation helper and tests
- task page reconciliation helper and tests
- assignee candidate reconciliation helper and tests
- workspace page reconciliation only if semantics are identical
- smallest appropriate shared frontend model/utility boundary
- affected component and browser regression tests

## Security and Data Boundary

The utility operates only on already validated client models and does not widen
workspace visibility, authorize records, or accept raw transport payloads.
Feature/API boundaries remain responsible for validation and tenant scope. IDs
are used for deterministic reconciliation, not authorization.

## Engineering Improvement Review

### Frontend

- Keep the utility synchronous, pure, and independent of React state/effects.
- Preserve request cancellation, pagination cursor/page state, selection, and
  mutation reconciliation at feature owners.
- Avoid memoization or indexing structures unless measurements justify them for
  current bounded page sizes.

### Code Quality and API Design

- Use explicit generic types and a required `getId` contract.
- Keep validation and transport mapping outside the utility.
- Fail at compile time for invalid modes; avoid boolean flags whose meaning is
  unclear.
- Prefer feature-local duplication over a false abstraction when semantics
  differ.

### Testing

- Cover replace, append, duplicate ID, updated item, empty page, empty current
  collection, stable ordering, and total-count changes.
- Pair pure tests with every migrated consumer's component/browser regression.

## Ordered Implementation Plan

1. Add characterization tests for all four current reconciliation paths.
2. Document identical and intentionally different behavior, including ordering,
   deduplication, updated records, and total metadata.
3. Approve the smallest typed contract and its owner location.
4. Implement the pure utility with complete edge-case unit coverage.
5. Migrate project, task, assignee, and only eligible workspace consumers one at
   a time, rerunning their focused tests after each migration.
6. Remove superseded helpers without moving feature-local state behavior.
7. Update affected architecture/roadmap documentation.
8. Run the post-implementation review gate before final validation.

## Validation Contract

| Guarantee | Required evidence |
|---|---|
| Reconciliation is deterministic | pure unit matrix for replace/append and every edge case |
| Semantics were not forced | documented consumer comparison and retained local exceptions |
| Feature behavior is preserved | project, task, assignee, and affected workspace component tests |
| Race/selection behavior remains local | existing stale-request, mutation, and selection regression tests |
| Browser workflows remain unchanged | critical live project/task/workspace pagination smoke as affected |
| Contract remains clear | typecheck, lint, and API/name review without `any` or avoidable `unknown` |

## Post-Implementation Review Gate

Review for forced abstraction, changed ordering, lost updated records, duplicate
items, incorrect totals, selection leakage into the utility, raw API payloads,
hidden side effects, new global state, and consumers migrated without focused
regression evidence. Resolve in-scope findings and rerun affected checks.

## Rollback and Forward Fix

- Migrate consumers in separate commits where practical.
- Revert an individual consumer to its characterized local helper if semantics
  diverge; do not weaken the shared contract with feature-specific flags.
- Remove the utility entirely if fewer than two consumers retain identical
  behavior after characterization.

## Dependencies

- completed project, task, and workspace pagination foundations
- [Task UI Boundaries](../completed/task-ui-boundaries.md) first to avoid moving the same
  task module concurrently
- existing component and live browser pagination evidence

## Re-plan Conditions

- an API pagination/cursor contract must change
- a state/query/cache dependency is proposed
- consumers require materially different ordering or conflict resolution
- datasets require a measured performance structure beyond current bounded pages

## Follow-up

- revisit cache/invalidation architecture only when a delivered feature proves
  the existing ownership model insufficient

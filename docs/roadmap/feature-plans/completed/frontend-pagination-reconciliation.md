# Feature Plan: Frontend Pagination Reconciliation

Status: Done - implemented and validated 2026-08-27

Intended PR: `refactor/frontend-pagination-reconciliation`

Milestone: Cross-cutting frontend remediation before Milestone 3

Impact: Material Change (Tier 2) - shared internal frontend collection contract
across project, task, and assignee consumers with preserved public behavior

## Completion Evidence

- added the pure typed `reconcilePageCollection` contract under
  `app/frontend/src/lib/pagination/` with deterministic replace/append,
  stable-position updates, duplicate resolution, latest-total clamping,
  exhaustion, and inconsistency behavior
- migrated project, task, and assignee consumers while leaving request,
  filtering, selection, mutation, error, and page-size ownership feature-local
- left the workspace reducer implementation unchanged and added a regression
  proving its intentional previous-total retention when a later page reports a
  lower total
- added pure edge-case coverage and strengthened project, task, and assignee
  component assertions so an existing ID receives its latest value without
  duplication
- on Node.js `22.23.2`, passed the authoritative `validate:frontend` gate: 5
  shared auth-policy tests, frontend typecheck, ESLint and canonical Tailwind
  checks, 176 frontend tests plus 5 Node script tests, and the production
  Next.js build
- passed `corepack pnpm audit --prod --audit-level moderate` with no known
  vulnerabilities and no dependency-file changes
- passed 23 mocked Chromium E2E tests and 3 guarded live Chromium E2E tests;
  the live runner used the isolated test database and released its owned ports
  3000 and 4000 after completion

## Review Evidence

- reviewed against repository commit `4e10540` on branch
  `refactor/frontend-pagination-reconciliation`
- compared the current project, task, assignee, and workspace merge, total,
  ordering, exhaustion, inconsistency, selection, creation, request, and error
  behavior directly in source and existing tests
- on Node.js `22.23.2`, the focused project, task (including assignee-picker
  cases), and workspace component baseline passed: 3 files and 43 tests
- no implementation source changed during plan review

## Goal

Replace the duplicated project, task, and assignee page-merging logic with the
smallest explicit, pure reconciliation contract while preserving every
feature's selection, request, mutation, filtering, and error behavior. Keep
workspace reconciliation local because its append-total and reducer semantics
are intentionally outside the proven common contract.

## Existing Foundation

- Project, task, and assignee collections implement the same replace/append,
  ID-based update, stable-order, latest-total, exhaustion, and inconsistency
  behavior in three feature-local helpers.
- Workspace item merging is similar, but append keeps the maximum of the
  previous total, incoming total, and merged length. Its reducer also owns
  selection, creation, refresh, and partial-failure behavior.
- Existing component tests cover representative pagination and recovery paths,
  but they do not name every shared ordering, duplicate-update, and total-change
  rule as one pure contract.

## Acceptance Criteria

- Consumer semantics are characterized before extraction; intentionally
  different behavior remains feature-local.
- One pure utility is introduced only for the replace/append, ID-based
  reconciliation, latest-total, exhaustion, and inconsistency semantics proven
  common across project, task, and assignee consumers.
- The utility name, input type, return type, and behavior align; it does not
  return `unknown` or `any`.
- Parser, validator, transformer, fetch, selection, and mutation responsibilities
  do not enter the reconciliation utility.
- Existing item order remains stable; an incoming item with an existing ID
  updates that position, a new ID appends in incoming order, and the last value
  for a repeated ID wins without moving its first established position.
- Empty pages, empty current collections, downward or upward incoming totals,
  replacement versus append, exhaustion, and terminal-page inconsistency are
  deterministic and tested.
- Workspace merge, total, selection, creation, refresh, and partial-failure
  behavior remain local and unchanged as a documented exception.
- Project, task, assignee, and workspace browser behavior remains unchanged.

## Reviewed Decisions

- Migrate project, task, and assignee consumers; do not migrate workspace in
  this PR.
- Add the app-wide pure utility at
  `app/frontend/src/lib/pagination/reconcile-page-collection.ts` with colocated
  unit tests.
- Use `ReconciledPageCollection<T>` and `reconcilePageCollection` as the
  reviewed contract names. The implementation may make a mechanical naming
  correction only if the final type shape would otherwise be misleading.
- Accept an already validated page containing `items`, `page`, `pageSize`, and
  `total`, a required `(item) => string` ID selector, and a discriminated
  `replace` or `append` input. Append requires current items; replace does not
  accept or inspect them.
- Return only common derived state: `items`, `total`, `nextPage`, `exhausted`,
  and `inconsistent`. Project and task continue to own stored `pageSize`;
  assignee search continues to own its request page size.
- For repeated IDs across current and incoming items, preserve the first
  established position and use the last value. Append keeps existing positions
  and adds new IDs in incoming order; replace ignores prior items.
- Use the latest page total clamped to the reconciled item count. Do not accept
  previous total or a configurable total policy; that would pull workspace-only
  behavior into the shared contract.
- Derive exhaustion from `page * pageSize >= reconciledTotal` and inconsistency
  from `exhausted && items.length < reconciledTotal`.
- Keep validation, request identity, abort handling, filters, selection,
  creation, mutation, retries, and error presentation outside the utility.

## Scope

- characterize current project/task/assignee/workspace page reconciliation
- introduce one pure typed collection reconciliation utility for proven common
  semantics
- migrate project, task, and assignee consumers one at a time
- retain the workspace reducer and merge helper as an explicit exception
- retain feature-local selection, request, mutation, and error-state ownership
- focused pure-unit and consumer regression evidence
- roadmap completion and only documentation directly affected by the final
  shared utility boundary

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
- workspace reducer and tests for characterization and unchanged-regression
  evidence only
- `app/frontend/src/lib/pagination/` utility and unit tests
- affected project, task, assignee, workspace, and browser regression tests

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
- Keep project/task stored page size and assignee request page size at their
  existing owners; do not expand the shared result merely for shape symmetry.
- Avoid memoization or indexing structures unless measurements justify them for
  current bounded page sizes.

### Code Quality and API Design

- Use explicit generic types and a required `getId` contract.
- Keep validation and transport mapping outside the utility.
- Use a discriminated input so append without current items and replace with
  irrelevant current items fail at compile time; avoid boolean flags whose
  meaning is unclear.
- Prefer feature-local duplication over a false abstraction when semantics
  differ.

### Testing

- Cover replace, append, duplicates within and across pages, updated items,
  empty pages, empty current collections, stable ordering, latest total moving
  up or down, total clamping, exhaustion, and inconsistency.
- Pair pure tests with every migrated consumer's focused component regression.
- Keep the existing mocked and guarded live browser journeys green. Prove
  pagination edge cases in pure/component tests rather than manufacturing
  large live datasets solely for this internal refactor.

## Ordered Implementation Plan

1. Add only missing characterization assertions to the existing project, task,
   assignee, and workspace component suites. Record the shared three-consumer
   contract and workspace exception before moving code.
2. Add the pure utility and its complete edge-case unit matrix under
   `app/frontend/src/lib/pagination/`.
3. Migrate project, task, and assignee one at a time, rerunning the utility and
   focused consumer tests after each migration.
4. Keep workspace source unchanged and rerun its component suite to prove the
   documented exception did not regress.
5. Remove only the three superseded feature-local helpers. Recheck imports and
   confirm no selection, request, filter, mutation, or error state moved.
6. Update roadmap completion evidence and only directly affected boundary
   documentation.
7. Run the post-implementation review gate, resolve in-scope findings, and then
   run final authoritative validation.

## Validation Contract

| Guarantee | Required evidence |
|---|---|
| Reconciliation is deterministic | pure unit matrix for replace/append and every edge case |
| Semantics were not forced | source-backed consumer comparison and unchanged workspace exception |
| Feature behavior is preserved | project, task, assignee, and workspace component regressions |
| Race/selection behavior remains local | existing stale-request, mutation, and selection regression tests |
| Browser workflows remain unchanged | existing mocked browser suite plus guarded live project/task/assignee journeys; no fabricated large live dataset |
| Contract remains clear | typecheck, lint, and API/name review without `any` or avoidable `unknown` |

### Validation Execution

- Verify Node.js satisfies `>=22 <23` from `.nvmrc` before collecting evidence.
- During implementation, run the new pure utility suite plus the focused
  project, task, assignee, and workspace component suites after each affected
  migration.
- Run `corepack pnpm validate:frontend` for authoritative typecheck, lint,
  unit/component, Node-script, and production-build evidence.
- Run `corepack pnpm test:e2e:frontend` for the existing mocked browser
  regression suite.
- Run `corepack pnpm --filter @worksync/frontend test:e2e:live` only through its
  guarded `_test` database path with required local services available. Treat
  existing live journeys as integration smoke, not proof of every pagination
  edge case.

## Post-Implementation Review Gate

Review for forced abstraction, changed ordering, lost updated records, duplicate
items, incorrect totals, selection leakage into the utility, raw API payloads,
hidden side effects, new global state, and consumers migrated without focused
regression evidence. Resolve in-scope findings and rerun affected checks.

## Rollback and Forward Fix

- Migrate consumers in separate commits where practical.
- Revert an individual consumer to its characterized local helper if semantics
  diverge; do not weaken the shared contract with feature-specific flags or
  workspace total policy.
- Remove the utility entirely if fewer than two consumers retain identical
  behavior after characterization.

## Dependencies

- completed project, task, and workspace pagination foundations
- completed [Task UI Boundaries](task-ui-boundaries.md), now
  present at the reviewed baseline, to avoid moving the same task module
  concurrently
- existing component pagination and browser journey evidence

## Re-plan Conditions

- an API pagination/cursor contract must change
- a state/query/cache dependency is proposed
- consumers require materially different ordering or conflict resolution
- project, task, or assignee requires previous-total retention like workspace
- datasets require a measured performance structure beyond current bounded pages

## Follow-up

- revisit cache/invalidation architecture only when a delivered feature proves
  the existing ownership model insufficient

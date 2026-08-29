# Feature Plan: Task UI Boundaries

Status: Done - implemented and validated 2026-08-24

Intended PR: `refactor/task-ui-boundaries`

Milestone: 2 - Projects and Tasks remediation before Milestone 3

Impact: Material task frontend refactor with behavior preservation

## Completion Evidence

- extracted `AssigneePicker`, `TaskFormSheet`, and `TaskCard` into cohesive
  task-feature modules while retaining list, filter, pagination, transition,
  cancellation, and composition ownership in `TaskSection`
- corrected the assignee combobox contract so closed state has no broken popup
  references, every open async state keeps a mounted listbox, active-descendant
  references resolve to mounted options, options stay out of the Tab order, and
  leaving the composite closes it without trapping focus
- preserved the form-only `TaskFormSheet` boundary and documented the separate,
  viewer-accessible future `TaskDetailSheet` decision for comments
- added create, edit, filter, loading, empty, error, keyboard, focus, and ARIA
  regression evidence; the mocked Chromium task journey verifies Sheet focus
  return after close and successful save, combobox relationships, closed-state
  and no-active-option Enter handling without form submission, two-stage Escape
  behavior, and terminal cancellation
- on Node.js 22, passed the authoritative `validate:frontend` gate: 5 shared
  auth-policy tests, frontend typecheck, ESLint and canonical Tailwind checks,
  169 frontend tests plus 5 Node script tests, and the production Next.js build
- passed 23 mocked Chromium E2E tests and 3 guarded live Chromium E2E
  tests against the real backend and `worksync_test` PostgreSQL database; the
  live task journey also verifies the assignee combobox relationships, option
  Tab behavior, Escape close, and successful-save focus restoration
- passed `git diff --check` and the production dependency audit with no known
  vulnerabilities; no package or lockfile dependency changed

## Goal

Make the delivered task feature easier to understand, test, and extend before
comments are added by separating frontend responsibilities and correcting
task-assignee accessibility without changing the task product, API, or
authorization contract.

## Verified Problem

- `task-section.tsx` owns assignee search, form state, task cards, sheet
  behavior, filtering, mutation orchestration, and section rendering in one
  large module.
- The assignee combobox exposes `aria-controls` while closed and while its
  listbox is absent for empty or error states. A later-page error can also hide
  the retained options while leaving `aria-activedescendant` pointed at one of
  them.
- The comments plan needs a clear task-detail host boundary before adding a
  discussion surface.

## Acceptance Criteria

- Task UI components have clear, named responsibilities and no new god module
  replaces the old one.
- Existing task create, edit, filter, assignment auto-search, pagination, and
  status behavior remains unchanged.
- Assignee search has correct combobox/listbox relationships for loading,
  results, empty, error, retry, closed, and keyboard navigation states.
- The current `TaskFormSheet` remains form-only and is not treated as a
  task-detail host.
- The next comments slice uses a viewer-accessible `TaskDetailSheet` composed
  from the existing Sheet primitive. This refactor documents that boundary but
  does not add the Sheet, its opening affordance, or a new route.
- Existing critical live task workflow evidence remains green.

## Scope

- split task-section responsibilities into cohesive task feature components
  and, only when warranted, hooks without moving ownership outside the task
  feature unnecessarily
- correct assignee combobox ARIA and focus behavior across all states
- decide and document the task-detail host assumed by comments
- add focused unit/component/browser regression evidence
- reconcile affected feature-plan and architecture documentation after the
  refactor

## Out of Scope

- task API, authorization, lifecycle, or database changes
- shared project/task/assignee/workspace pagination reconciliation
- backend task policy cleanup
- new state-management or query-cache library
- a generic data-access or pagination framework
- visual redesign
- task-detail Sheet implementation or an open-details affordance
- comments, mentions, notifications, board view, or project update UI
- a new task route unless separately planned and approved

## Affected Surfaces

- task feature components and hooks
- component, accessibility, and browser tests
- task architecture and roadmap documentation

## Security and Data Boundary

This is a frontend behavior-preserving refactor. Task reads and writes retain
their existing backend authorization, tenant-hiding, and response contracts.
Frontend component boundaries must not make hidden actions available or trust
client state as authorization.

## Design Constraints

### Component boundaries

- Keep task list loading, filtering, pagination, status transitions,
  cancellation confirmation, and feature composition at the `TaskSection`
  boundary.
- `AssigneePicker` owns assignee-search state, debounce, cancellation,
  pagination reconciliation, keyboard interaction, focus, and ARIA.
- `TaskFormSheet` owns create/edit form state, validation, submission, and
  create/update request feedback. It remains separate from task-detail display.
- `TaskCard` remains presentational and receives only task data, capability
  state, pending state, and explicit action callbacks.
- Keep these modules inside the task feature. Do not introduce a hook merely to
  move code; extract one only when it owns a coherent state/effect lifecycle
  without duplicating server state or coupling sibling hooks.

### Task-detail host decision

- Reject `TaskFormSheet` as the comments host because it is a mutation-oriented
  form and is unavailable to `VIEWER` users.
- The comments slice will introduce `TaskDetailSheet` using the existing Sheet
  primitive. It must support every role allowed to read comments while keeping
  task mutation affordances conditional on the existing role contract.
- This refactor creates no dormant component or prop for that future UI. The
  named `TaskCard` and `TaskSection` boundaries are the extension seam.
- A dedicated task route is not required by the current decision. If that
  changes, stop and create a separate prerequisite plan.

## Engineering Improvement Review

### UX/UI and Accessibility

- Preserve the existing approximately 300 ms auto-search debounce and stale
  request cancellation.
- Ensure IME composition, Escape, Arrow keys, Enter, Tab, focus return, loading,
  empty, and retry behavior are intentional.
- Keep one explicit combobox state contract: while closed, no absent popup is
  referenced; while open, the controlled listbox exists for loading, results,
  empty, error, and retry states; `aria-activedescendant` references only a
  mounted option; async status is announced without a broken ARIA relationship.
- Keep DOM focus on the input for Arrow-key navigation. Options do not become
  separate Tab stops; auxiliary retry or pagination actions remain keyboard
  reachable; leaving the composite closes it without trapping focus.
- Preserve responsive sheet/card behavior and touch targets.

### Frontend

- Keep server state ownership within existing feature patterns.
- Avoid a new global cache/state dependency for a refactor-only slice.
- Memoize or abstract only where profiling or render behavior warrants it.
- Prevent effects from hiding request cancellation or mutation state.

### Code Quality and API Design

- Prefer discriminated unions for state that can be loading, ready, empty,
  error, or retrying.
- Keep component props and hook return types explicit and aligned with their
  behavior.

### Testing

- Characterize only behavior that must be preserved before moving code. Do not
  encode the known ARIA/focus defect as desired behavior.
- Add accessibility regression tests that fail against the known defect before
  applying the behavior fix.
- Pair component tests with real-browser DOM, keyboard, focus, network timing,
  and composition-event evidence plus the live task workflow. Browser-dispatched
  composition events do not claim to reproduce an operating-system IME.

## Ordered Implementation Plan

1. Record the `TaskDetailSheet` decision in this plan and the comments plan
   before changing frontend code. Do not add a route, dormant detail component,
   or opening affordance in this refactor.
2. On the repository-supported Node.js 22 runtime, inventory the current task
   tests and add only missing characterization evidence for preserved
   create/edit/status, filter, pagination, assignee-search cancellation,
   empty/error/retry, and Sheet focus-return behavior.
3. Split `AssigneePicker`, `TaskFormSheet`, and `TaskCard` into the named
   feature-local modules one responsibility at a time. Keep the characterization
   suite green after each move and retain `TaskSection` orchestration ownership.
4. Add failing regression tests for the explicit combobox state and focus
   contract, then correct ARIA relationships, async announcements, keyboard
   navigation, pointer selection, composite focus exit, and request-race
   behavior across every state.
5. Move focused tests to the owning module where that improves failure
   localization, retain TaskSection journey coverage, and update affected
   architecture/roadmap documentation.
6. Run the post-implementation review gate before final validation.

## Validation Contract

| Guarantee | Required evidence |
|---|---|
| Task behavior is preserved | unit/component tests and critical live task E2E |
| Component boundaries remain explicit | typecheck, lint, focused component contracts, and import review |
| Assignee picker is accessible | accessibility assertions plus real-browser keyboard, focus, network-state, and composition-event flow |
| Request races remain controlled | fake-timer/unit evidence plus browser stale-response scenario |
| Refactor has no dependency drift | typecheck, lint, build, and lockfile inspection |
| Task-detail host decision is unambiguous | reconciled task-boundary and comments plans showing `TaskFormSheet` and `TaskDetailSheet` as separate responsibilities |

### Validation execution

- Verify Node.js satisfies `>=22 <23` from `.nvmrc` and pnpm resolves through
  Corepack before collecting evidence.
- Run the focused task component suites during characterization, after each
  structural move, and after the accessibility fix.
- Run `corepack pnpm validate:frontend` for the authoritative local frontend
  typecheck, lint, unit/component, and production-build evidence.
- Run `corepack pnpm test:e2e:frontend` for mocked browser network, keyboard,
  focus, stale-response, and composition-event scenarios.
- Run `corepack pnpm --filter @worksync/frontend test:e2e:live` only against the
  guarded `_test` database with the required local services and ports available;
  do not point it at development, shared, or production data.
- Run `corepack pnpm audit --prod --audit-level moderate` at the pre-CI handoff
  and inspect `package.json` plus `pnpm-lock.yaml` to confirm this refactor did
  not add or drift dependencies.

## Post-Implementation Review Gate

Review the complete diff for behavior drift, circular imports, prop drilling,
hidden side effects, ARIA references to absent elements, lost abort/debounce
behavior, and test doubles without live-boundary evidence. Resolve in-scope
findings and rerun affected validation.

## Rollback and Forward Fix

- Migrate one responsibility/consumer at a time so changes can be reverted
  without reverting unrelated task behavior.
- Keep structural extraction and the accessibility behavior fix independently
  revertible.
- If a task-detail component, opening affordance, or route becomes necessary in
  this PR, stop and re-plan rather than hiding the behavior change in the
  refactor.

## Dependencies

- [Frontend UI Runtime Compatibility](../completed/frontend-ui-runtime-compatibility.md)
- completed Task Foundation and Frontend Structure Boundaries
- existing task unit, component, mocked browser, and live browser harnesses

## Re-plan Conditions

- task API or authorization behavior must change
- a new route or state-management dependency is required
- task-detail UI or an opening affordance must be implemented in this refactor
- shared pagination or backend policy cleanup enters the current diff
- refactor reveals a user-visible behavior defect whose fix expands acceptance
  criteria

## Follow-up

- [Frontend Pagination Reconciliation](frontend-pagination-reconciliation.md)
- [Task Authorization Policy Cleanup](task-authorization-policy-cleanup.md)
- [Comments and Mentions Foundation](../planned/comments-mentions-foundation.md)

# Feature Plan: Task UI Boundaries

Status: Planned

Intended PR: `refactor/task-ui-boundaries`

Milestone: 2 - Projects and Tasks remediation before Milestone 3

Impact: Material task frontend refactor with behavior preservation

## Goal

Make the delivered task feature easier to understand, test, and extend before
comments are added by separating frontend responsibilities and correcting
task-assignee accessibility without changing the task product, API, or
authorization contract.

## Verified Problem

- `task-section.tsx` owns assignee search, form state, task cards, sheet
  behavior, filtering, mutation orchestration, and section rendering in one
  large module.
- The assignee combobox can expose `aria-controls` and expanded state while its
  listbox is absent during loading, empty, or error states.
- The comments plan needs a clear task-detail host boundary before adding a
  discussion surface.

## Acceptance Criteria

- Task UI components have clear, named responsibilities and no new god module
  replaces the old one.
- Existing task create, edit, filter, assignment auto-search, pagination, and
  status behavior remains unchanged.
- Assignee search has correct combobox/listbox relationships for loading,
  results, empty, error, retry, closed, and keyboard navigation states.
- The task-detail host for the next comments slice is explicitly selected as an
  existing Sheet or a separately planned route. A new route is not hidden in
  this refactor.
- Existing critical live task workflow evidence remains green.

## Scope

- split task-section responsibilities into cohesive task feature components and
  hooks without moving ownership outside the task feature unnecessarily
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
- comments, mentions, notifications, board view, or project update UI
- a new task route unless separately planned and approved

## Affected Surfaces

- task feature components and hooks
- component, accessibility, and browser tests

## Security and Data Boundary

This is a frontend behavior-preserving refactor. Task reads and writes retain
their existing backend authorization, tenant-hiding, and response contracts.
Frontend component boundaries must not make hidden actions available or trust
client state as authorization.

## Design Constraints

### Component boundaries

- Keep orchestration at the task-section boundary.
- Separate assignee picker, task form sheet, and task card into named modules
  whose props express the minimum required contract.
- Extract hooks only when they own coherent state/effects; do not trade one
  large component for hidden cross-hook coupling.

## Engineering Improvement Review

### UX/UI and Accessibility

- Preserve the existing approximately 300 ms auto-search debounce and stale
  request cancellation.
- Ensure IME composition, Escape, Arrow keys, Enter, Tab, focus return, loading,
  empty, and retry behavior are intentional.
- Mount and reference a listbox only when its relationship is valid; announce
  async state without leaving broken ARIA references.
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

- Characterize current behavior before moving code.
- Pair component tests with real browser keyboard and live task workflow
  evidence.

## Ordered Implementation Plan

1. Add characterization tests for task create/edit/status, filters, pagination,
   assignee search, cancellation, empty/error/retry, and sheet focus behavior.
2. Decide whether comments will attach to the current task Sheet. If a dedicated
   route is required, stop and create a prerequisite PR-sized plan.
3. Split AssigneePicker, TaskFormSheet, TaskCard, and orchestration into cohesive
   modules while preserving public feature behavior.
4. Correct combobox/listbox ARIA, async announcements, keyboard navigation, and
   focus management across every state.
5. Update affected tests and architecture/roadmap documentation.
6. Run the post-implementation review gate before final validation.

## Validation Contract

| Guarantee | Required evidence |
|---|---|
| Task behavior is preserved | unit/component tests and critical live task E2E |
| Component boundaries remain explicit | typecheck, lint, focused component contracts, and import review |
| Assignee picker is accessible | accessibility assertions plus real-browser keyboard/IME/focus flow |
| Request races remain controlled | fake-timer/unit evidence plus browser stale-response scenario |
| Refactor has no dependency drift | typecheck, lint, build, and lockfile inspection |

## Post-Implementation Review Gate

Review the complete diff for behavior drift, circular imports, prop drilling,
hidden side effects, ARIA references to absent elements, lost abort/debounce
behavior, and test doubles without live-boundary evidence. Resolve in-scope
findings and rerun affected validation.

## Rollback and Forward Fix

- Migrate one responsibility/consumer at a time so changes can be reverted
  without reverting unrelated task behavior.
- If the task-detail route decision expands scope, stop this plan at the current
  Sheet boundary and plan the route separately.

## Dependencies

- [Frontend UI Runtime Compatibility](../completed/frontend-ui-runtime-compatibility.md)
- completed Task Foundation and Frontend Structure Boundaries
- existing task unit, component, mocked browser, and live browser harnesses

## Re-plan Conditions

- task API or authorization behavior must change
- a new route or state-management dependency is required
- shared pagination or backend policy cleanup enters the current diff
- refactor reveals a user-visible behavior defect whose fix expands acceptance
  criteria

## Follow-up

- [Frontend Pagination Reconciliation](frontend-pagination-reconciliation.md)
- [Task Authorization Policy Cleanup](task-authorization-policy-cleanup.md)
- [Comments and Mentions Foundation](comments-mentions-foundation.md)

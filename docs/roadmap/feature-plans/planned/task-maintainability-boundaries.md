# Feature Plan: Task Maintainability Boundaries

Status: Planned

Intended PR: `refactor/task-maintainability-boundaries`

Milestone: 2 - Projects and Tasks remediation before Milestone 3

Impact: Material task-feature refactor with behavior preservation

## Goal

Make the delivered task feature easier to understand, test, and extend before
comments are added by separating frontend responsibilities, clarifying
pagination reconciliation semantics, correcting task-assignee accessibility,
and removing misleading dead policy abstractions without changing the task
product or authorization contract.

## Verified Problem

- `task-section.tsx` owns assignee search, form state, task cards, sheet
  behavior, filtering, mutation orchestration, and section rendering in one
  large module.
- Project, task, assignee, and workspace pagination each implement similar but
  not identical collection replacement/append behavior.
- The assignee combobox can expose `aria-controls` and expanded state while its
  listbox is absent during loading, empty, or error states.
- A task read-policy abstraction is not used by production authorization and
  obscures the actual membership-based read guarantee.
- The comments plan needs a clear task-detail host boundary before adding a
  discussion surface.

## Acceptance Criteria

- Task UI components have clear, named responsibilities and no new god module
  replaces the old one.
- Existing task create, edit, filter, assignment auto-search, pagination, and
  status behavior remains unchanged.
- A small pure pagination reconciliation contract is shared only where all
  consumers have the same semantics; feature-specific selection and mutation
  rules stay local.
- Shared utility names, parameter types, and return types state their behavior;
  no `any`, avoidable `unknown`, or mixed parser/transformer/validator behavior
  is introduced.
- Assignee search has correct combobox/listbox relationships for loading,
  results, empty, error, retry, closed, and keyboard navigation states.
- The task-detail host for the next comments slice is explicitly selected as an
  existing Sheet or a separately planned route. A new route is not hidden in
  this refactor.
- Dead authorization abstractions are removed or justified by a real caller and
  a documented contract.
- Existing critical live task workflow evidence remains green.

## Scope

- split task-section responsibilities into cohesive task feature components and
  hooks without moving ownership outside the task feature unnecessarily
- inventory pagination consumers and extract one pure generic reconciliation
  utility only for identical page/append semantics
- preserve workspace selection and mutation reconciliation as local behavior
- correct assignee combobox ARIA and focus behavior across all states
- clarify or remove production-dead task read-policy code
- decide and document the task-detail host assumed by comments
- add focused unit/component/browser regression evidence
- reconcile affected feature-plan and architecture documentation after the
  refactor

## Out of Scope

- task API, authorization, lifecycle, or database changes
- new state-management or query-cache library
- a generic data-access or pagination framework
- visual redesign
- comments, mentions, notifications, board view, or project update UI
- a new task route unless separately planned and approved

## Affected Surfaces

- task feature components and hooks
- project/task/assignee page reconciliation helpers
- workspace page reconciliation only if semantics are proven identical
- shared frontend utility boundary
- task policy code and tests
- component, accessibility, and browser tests

## Security and Data Boundary

This is a behavior-preserving refactor. Task reads remain authorized by current
workspace membership through the production service boundary, and task writes
retain their existing role matrix. Removing an unused policy helper must not
weaken tenant hiding, introduce client-authoritative roles, or change API
responses. Existing real-database task isolation evidence remains required.

## Design Constraints

### Component boundaries

- Keep orchestration at the task-section boundary.
- Separate assignee picker, task form sheet, and task card into named modules
  whose props express the minimum required contract.
- Extract hooks only when they own coherent state/effects; do not trade one
  large component for hidden cross-hook coupling.

### Pagination reconciliation

Use an explicit contract such as:

```ts
type PaginatedCollection<T> = {
  items: T[];
  total: number;
};

function reconcilePaginatedCollection<T>(input: {
  current: PaginatedCollection<T>;
  page: PaginatedCollection<T>;
  mode: "replace" | "append";
  getId: (item: T) => string;
}): PaginatedCollection<T>;
```

The exact name may change during implementation, but Name, Return Type, and
Behavior must remain aligned. The utility reconciles collections; it does not
validate API payloads, manage selection, fetch data, or mutate feature state.

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
- Prevent effects from hiding request cancellation or mutation reconciliation.

### Code Quality and API Design

- Separate parser, transformer, validator, and state-reducer responsibilities.
- Prefer discriminated unions for state that can be loading, ready, empty,
  error, or retrying.
- Keep pure collection reconciliation deterministic and independently tested.
- Delete unused policy abstractions rather than preserving speculative reuse.

### Testing

- Characterize current behavior before moving code.
- Test the shared collection contract with replacement, append, duplicate ID,
  updated item, empty page, and total-count cases.
- Pair component tests with real browser keyboard and live task workflow
  evidence.

## Ordered Implementation Plan

1. Add characterization tests for task create/edit/status, filters, pagination,
   assignee search, cancellation, empty/error/retry, and sheet focus behavior.
2. Decide whether comments will attach to the current task Sheet. If a dedicated
   route is required, stop and create a prerequisite PR-sized plan.
3. Inventory the four page reconciliation implementations; document identical
   and intentionally different semantics.
4. Introduce the smallest pure, typed reconciliation utility for proven common
   behavior and migrate consumers one at a time.
5. Split AssigneePicker, TaskFormSheet, TaskCard, and orchestration into cohesive
   modules while preserving public feature behavior.
6. Correct combobox/listbox ARIA, async announcements, keyboard navigation, and
   focus management across every state.
7. Remove or justify the unused task read-policy abstraction and keep the real
   membership-based authorization semantics explicit.
8. Update affected tests and architecture/roadmap documentation.
9. Run the post-implementation review gate before final validation.

## Validation Contract

| Guarantee | Required evidence |
|---|---|
| Task behavior is preserved | unit/component tests and critical live task E2E |
| Shared reconciliation is deterministic | focused pure unit tests for every mode and edge case |
| Consumers retain local semantics | project, task, assignee, and workspace regression tests as affected |
| Assignee picker is accessible | accessibility assertions plus real-browser keyboard/IME/focus flow |
| Request races remain controlled | fake-timer/unit evidence plus browser stale-response scenario |
| Authorization contract is unchanged | backend policy/unit and task integration/security regression gates |
| Refactor has no dependency drift | typecheck, lint, build, and lockfile inspection |

## Post-Implementation Review Gate

Review the complete diff for behavior drift, circular imports, prop drilling,
hidden side effects, over-generalized utilities, ARIA references to absent
elements, lost abort/debounce behavior, and test doubles without live-boundary
evidence. Resolve in-scope findings and rerun affected validation.

## Rollback and Forward Fix

- Migrate one responsibility/consumer at a time so changes can be reverted
  without reverting unrelated task behavior.
- If common pagination semantics cannot be proven, keep explicit feature-local
  helpers rather than forcing reuse.
- If the task-detail route decision expands scope, stop this plan at the current
  Sheet boundary and plan the route separately.

## Dependencies

- [Frontend UI Runtime Compatibility](frontend-ui-runtime-compatibility.md)
- completed Task Foundation and Frontend Structure Boundaries
- existing task unit, component, mocked browser, and live browser harnesses

## Re-plan Conditions

- task API or authorization behavior must change
- a new route or state-management dependency is required
- pagination consumers require materially different contracts
- refactor reveals a user-visible behavior defect whose fix expands acceptance
  criteria

## Follow-up

- [Comments and Mentions Foundation](comments-mentions-foundation.md)
- revisit workspace membership-removal lifecycle orchestration only before a
  second downstream resource needs a distinct cleanup policy; do not create a
  generic lifecycle framework in this slice

# Feature Plan: Frontend Recovery and App-Shell Copy Consistency

Status: Planned

Intended PR: `fix/frontend-recovery-shell-copy`

Milestone: Cross-cutting frontend remediation before Milestone 3

Impact: Bounded frontend UX and copy correction

## Goal

Make auth recovery and app-shell messages describe only verified application
state, remain actionable without redundant text, and reflect the workflows and
routes that actually exist.

## Existing Foundation

- Auth recovery already provides a Retry action and explicit recoverable state.
- The recovery component can receive a title and description that duplicate or
  contradict each other.
- Some recovery copy claims a connection problem even when the client has not
  established that cause.
- Projects and Tasks are available as Home workflows, but app-shell entries can
  label them “Soon” while dedicated routes do not exist.
- The shared Alert layout is owned by the preceding runtime-compatibility plan.

## Acceptance Criteria

- Auth recovery presents one concise message and one Retry action without a
  redundant session-verification title.
- Recovery copy does not claim connectivity, authentication, or session failure
  unless the client has an explicit typed state proving that cause.
- The recovery component contract prevents independently supplied title and
  description from contradicting each other.
- Icon, message, and Retry presentation remains readable at desktop and mobile
  widths after the shared Alert compatibility fix.
- App-shell navigation describes workflows available today without enabling or
  promising nonexistent routes.
- App-shell security/help summary matches the current delivered auth and
  workspace behavior.
- Keyboard, focus, ARIA, light/dark, and responsive browser evidence passes.

## Required Decisions Before Implementation

- Approve the default recoverable message, recommended as “We couldn't load
  this page.” unless a more specific typed state is available.
- Decide whether non-routable Projects and Tasks entries should be hidden or
  presented as Home workflow labels. Do not render them as disabled future
  routes when the workflows already exist.
- Confirm the concise security/help summary from current project documentation.

## Scope

- simplify the auth recovery presentation API to one message plus Retry
- remove speculative “Check your connection and try again.” and redundant “We
  couldn't verify your session.” combinations
- reconcile app-shell Projects/Tasks labels and disabled state with current
  routing
- update app-shell security/help summary from verified delivered behavior
- focused component, accessibility, and real-browser evidence
- affected frontend and roadmap/workflow documentation

## Out of Scope

- Tailwind/shadcn dependency or shared primitive migration
- new Projects, Tasks, or task-detail routes
- authentication, session, redirect, API, or authorization behavior changes
- new recovery categories without a typed product requirement
- visual redesign of the app shell

## Affected Surfaces

- auth recovery component contract and call sites
- public/protected auth transition presentation
- app-shell navigation labels, disabled state, and summary copy
- component, accessibility, and browser tests
- affected frontend and roadmap/workflow documentation

## Security and Data Boundary

Messages must not reveal session internals, tokens, provider details, or tenant
state. Presentation must not grant or imply access beyond the router and backend
authorization contract. Existing same-origin redirect and protected-route
behavior remains unchanged.

## Engineering Improvement Review

### UX/UI and Accessibility

- Distinguish recoverable failure from loading and terminal access denial.
- Keep Retry visible, keyboard reachable, and disabled only while retrying.
- Return focus predictably after Retry and announce the state without repeating
  the same message through multiple live regions.
- Keep icon and message aligned while long copy wraps below predictably.

### Frontend and Code Quality

- Prefer a small explicit contract such as `message` and `onRetry` over title
  plus description fields that can contradict each other.
- Use typed recovery causes only when behavior differs; do not parse user-facing
  strings to infer state.
- Keep route availability as the authority for navigation state rather than a
  second feature-availability list.

### Testing

- Cover loading, recoverable error, retrying, success redirect, and repeated
  failure without relying only on text snapshots.
- Pair component assertions with real-browser keyboard, responsive, and theme
  evidence using the compiled shared styles.

## Ordered Implementation Plan

1. Approve the default recovery message, navigation representation, and current
   security/help summary.
2. Characterize existing recovery and app-shell states with focused tests.
3. Replace the title/description recovery API with one explicit message contract
   and update call sites without changing auth transitions.
4. Reconcile Projects/Tasks presentation with current Home workflows and
   existing routes.
5. Update the app-shell security/help summary from verified project behavior.
6. Add component, accessibility, and real-browser regression evidence.
7. Reconcile affected documentation.
8. Run the post-implementation review gate before final validation.

## Validation Contract

| Guarantee | Required evidence |
|---|---|
| Recovery copy is accurate and nonredundant | component tests for every caller and typed state |
| Retry behavior is preserved | component test plus real-browser repeated-failure/recovery flow |
| Navigation reflects actual routes | route/navigation tests and keyboard browser flow |
| Presentation remains accessible | ARIA, focus, desktop/mobile, and light/dark browser evidence |
| Auth behavior is unchanged | critical live auth, redirect, and protected-route regression smoke |

## Post-Implementation Review Gate

Review for speculative root-cause copy, duplicated announcements, internal
session detail, Retry behavior drift, navigation promises without routes,
independent route-availability lists, and unrelated style/runtime changes.
Resolve in-scope findings and rerun affected validation.

## Rollback and Forward Fix

- Keep the component contract change and copy/navigation updates reviewable in
  small commits.
- Revert presentation changes without reverting the shared runtime migration.
- Forward-fix a caller only when the single-message contract remains valid and
  auth behavior is unchanged.

## Dependencies

- [Frontend UI Runtime Compatibility](../completed/frontend-ui-runtime-compatibility.md)
- completed frontend auth/app-shell foundations
- current route and security documentation

## Re-plan Conditions

- a new route is required
- recovery behavior, authentication, session handling, or redirect contracts
  must change
- different messages require a new typed recovery-state model
- the work requires shared primitive/runtime changes beyond the completed
  compatibility plan

## Follow-up

- broader app-shell information architecture or visual redesign
- dedicated Projects/Tasks routes as separate feature plans

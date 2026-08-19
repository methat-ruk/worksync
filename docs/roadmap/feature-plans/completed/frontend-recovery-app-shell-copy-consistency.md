# Feature Plan: Frontend Recovery and App-Shell Copy Consistency

Status: Done - implemented and validated 2026-08-19

Intended PR: `fix/frontend-recovery-shell-copy`

Milestone: Cross-cutting frontend remediation before Milestone 3

Impact: Bounded Change (Tier 1) - observable, reversible frontend UX and copy
correction with no auth, session, redirect, API, or authorization behavior
change

## Goal

Make auth recovery and app-shell messages describe only verified application
state, remain actionable without redundant text, and expose only workflows,
routes, and actions that actually exist.

## Existing Foundation

- Auth recovery already provides a Retry action and explicit recoverable state.
- The recovery component can receive a title and description that duplicate or
  contradict each other.
- Some recovery copy claims a connection problem even when the client has not
  established that cause.
- Retry already transitions each caller to its existing loading state, which
  removes the recovery screen until the attempt resolves.
- `/app` is the only authenticated frontend route. Workspaces, Projects, and
  Tasks are sections of that Home workflow rather than dedicated routes.
- Primary navigation, the header, and the profile menu currently advertise
  disabled Workspaces, Projects, Tasks, Notifications, Profile, Settings,
  Security, and Sessions entries whose routes or actions do not exist.
- The shared Alert layout is owned by the preceding runtime-compatibility plan.

## Acceptance Criteria

- Generic route-guard recovery presents “We couldn't load this page.” and one
  Retry action without a redundant session-verification title.
- Google OAuth completion recovery presents the accurate contextual message
  “We couldn't finish signing you in.” through the same single-message
  component contract.
- Recovery copy does not claim connectivity, authentication, or session failure
  unless the client has an explicit typed state proving that cause.
- The recovery component contract prevents independently supplied title and
  description from contradicting each other.
- Retry preserves each caller's existing transition to an announced loading
  state; repeated failure returns to one alert and one keyboard-reachable Retry
  action without adding a second retry-state owner.
- Icon, message, and Retry presentation remain readable at desktop and mobile
  widths after the shared Alert compatibility fix.
- Primary navigation contains only an actual `/app` Home link with current-page
  semantics. Workspaces, Projects, and Tasks remain visible in Home content
  rather than as disabled navigation, and nonexistent notification or
  account-management actions are not advertised as controls.
- The app-shell summary reads “Workspace access” and “Workspaces, projects, and
  tasks are limited by your current membership and role.”, matching current
  backend-enforced behavior without exposing auth or session internals.
- Keyboard traversal, visible focus, ARIA, light/dark, and responsive browser
  evidence passes.

## Required Decisions Before Implementation

Implementation approval confirms these reviewed decisions:

- use “We couldn't load this page.” for generic route-guard recovery and keep
  “We couldn't finish signing you in.” for the known OAuth completion context
- remove non-routable Workspaces, Projects, Tasks, and Notifications entries
  from primary navigation; remove the disabled notification header control and
  Profile, Settings, Security, and Sessions menu entries until their actions
  exist; retain Home, theme selection, logout, and logout-all
- replace the engineering-status summary with “Workspace access” and
  “Workspaces, projects, and tasks are limited by your current membership and
  role.”

## Plan Review - 2026-08-19

- No blocking finding remains after this revision.
- The original plan under-scoped misleading app-shell controls by naming only
  Projects and Tasks; the reviewed scope now covers every nonexistent route or
  action currently advertised by the same shell.
- The original retry guidance implied a local disabled state even though every
  caller already transitions to a loading screen. The reviewed plan preserves
  that single state owner and tests the loading announcement and repeated
  failure instead.
- One universal recovery string would lose accurate OAuth context. The reviewed
  contract permits one explicit message while preventing independently supplied
  title and description from contradicting each other.
- A live-backend auth run is disproportionate while auth/session/redirect
  behavior remains unchanged. Existing component, mocked-browser, and
  current-engine compatibility boundaries provide the required evidence; any
  auth behavior change triggers re-planning.

## Implementation Outcome - 2026-08-19

- Replaced the recovery title/description API with one `message` plus `onRetry`
  contract, using the approved generic and OAuth-context messages.
- Preserved caller-owned loading transitions and added repeated-failure,
  announcement, keyboard, and Retry evidence without changing auth behavior.
- Made Home a real `/app` link with current-page semantics and removed
  nonexistent navigation, notification, and account-management controls.
- Replaced the engineering-status copy with the approved workspace-access
  summary and retained theme, logout, and logout-all actions.
- Frontend typecheck, full lint, canonical Tailwind checking, 160 frontend
  unit/component tests, 5 auth-policy tests, 5 frontend script tests,
  production build, and all 23 mocked Chromium E2E tests passed.
- Required production compatibility CI passed in Chromium, Firefox, and WebKit,
  including desktop/mobile, light/dark recovery, current navigation, profile
  actions, visible keyboard focus, and console checks. This supplied the
  Firefox evidence that the local headless graphics runtime could not produce.
- Repository Playwright also supplied the approved local Chromium browser
  fallback and screenshot evidence when the in-app Browser runtime was
  unavailable.
- No production, backend, API, auth, session, redirect, data, dependency, or
  deployment change was made.

## Scope

- simplify the auth recovery presentation API to one message plus Retry
- remove speculative “Check your connection and try again.” and redundant “We
  couldn't verify your session.” combinations
- remove app-shell navigation, header, and profile-menu controls whose routes or
  actions do not exist
- update app-shell security/help summary from verified delivered behavior
- focused component, accessibility, and real-browser evidence
- affected frontend and roadmap/workflow documentation

## Out of Scope

- Tailwind/shadcn dependency or shared primitive migration
- new Projects, Tasks, or task-detail routes
- authentication, session, redirect, API, or authorization behavior changes
- new recovery categories without a typed product requirement
- visual redesign of the app shell
- new route-availability registry or navigation architecture
- theme, logout, or logout-all behavior changes

## Affected Surfaces

- auth recovery component contract and call sites
- public/protected auth transition presentation
- app-shell primary navigation, notification placeholder, pending profile-menu
  entries, and summary copy
- component, accessibility, and browser tests
- affected frontend and roadmap/workflow documentation

## Security and Data Boundary

Messages must not reveal session internals, tokens, provider details, tenant
existence, or failure diagnostics. Presentation must not grant or imply access
beyond the router and backend authorization contract. Frontend route protection
remains UX only; existing same-origin redirect, protected-route, workspace
membership, role, and tenant-isolation behaviors remain unchanged.

## Engineering Improvement Review

### UX/UI and Accessibility

- Distinguish recoverable failure from loading and terminal access denial.
- Keep Retry keyboard reachable, then use each caller's existing loading screen
  and status announcement while the attempt is in flight.
- Let the recovery Alert announce a repeated failure once; do not add automatic
  focus movement or another live region without browser evidence that it is
  needed.
- Keep icon and message aligned while long copy wraps below predictably.
- Remove nonexistent actions instead of leaving disabled controls that promise
  unshipped routes or account-management features.

### Frontend and Code Quality

- Prefer the small `message` and `onRetry` contract over title plus description
  fields that can contradict each other. A default generic message plus an
  OAuth-specific caller message is sufficient; no recovery-cause abstraction
  is justified while behavior does not differ.
- Use typed recovery causes only when behavior differs; do not parse user-facing
  strings to infer state.
- With only `/app` available, keep one explicit Home link with `aria-current`
  semantics rather than adding a second route-availability list or speculative
  navigation model.
- Do not add effects, memoization, or client state for copy-only presentation;
  the reviewed React surface has no performance-specific requirement.

### Testing

- Cover loading, recoverable error, retry, success redirect, repeated failure,
  and the exact retained app-shell controls without relying only on snapshots.
- Pair component assertions and Chromium mocked-flow coverage with the existing
  compiled-production compatibility suite in Chromium, Firefox, and WebKit for
  responsive and theme evidence.

Engineering Improvement Review:

- Current scope: the single-message recovery contract, caller-owned loading
  transition, removal of nonexistent app-shell controls, accurate membership
  summary, and mapped component/browser evidence are tightly coupled to the
  stated correctness and accessibility outcome.
- Future enhancements: dedicated workflow routes and broader app-shell
  information architecture remain independent feature plans.
- Scope effect: still a Bounded Change (Tier 1); implementation must stop and
  re-plan if auth behavior, route architecture, or shared runtime primitives
  need to change.

## Ordered Implementation Plan

1. Obtain approval for the reviewed messages, removal of nonexistent controls,
   exact workspace-access summary, scope, and validation contract.
2. Characterize current generic recovery, OAuth recovery, caller-owned loading,
   repeated failure, and app-shell controls with focused tests.
3. Replace the title/description recovery API with one explicit message contract
   and update all three call sites without changing auth transitions.
4. Make Home an actual `/app` link with current-page semantics, keep it as the
   only primary destination, and remove navigation, header, and profile-menu
   controls whose routes or actions do not exist.
5. Replace the engineering-status summary with the approved workspace-access
   copy grounded in current membership and role enforcement.
6. Add component, mocked-browser, accessibility, and current-engine production
   compatibility regression evidence.
7. Reconcile affected roadmap and workflow documentation.
8. Run the post-implementation review gate before final validation.

## Validation Contract

| Guarantee | Required evidence |
|---|---|
| Recovery copy is accurate and nonredundant | focused component contract and caller tests for generic and OAuth recovery |
| Retry and caller-owned loading are preserved | component tests plus mocked Chromium repeated-failure and recovery flows |
| App shell exposes only current routes and actions | Home link and current-page component assertions plus desktop/mobile keyboard browser flows |
| Presentation remains accessible and compatible | single Alert announcement, loading status, keyboard reachability, responsive light/dark production evidence in Chromium, Firefox, and WebKit |
| Auth behavior is unchanged | existing public/protected redirect, OAuth completion, and recovery mocked E2E regression suite |
| Frontend remains valid and buildable | frontend typecheck, lint including canonical Tailwind classes, unit/component tests, and production build |

Required final commands are the repository-owned frontend validation, mocked
E2E, and compatibility E2E commands. A live-backend auth run is not required
unless implementation changes auth, session, redirect, API, or authorization
behavior; that change would first trigger re-planning.

## Post-Implementation Review Gate

Review for speculative root-cause copy, duplicated announcements, internal
session detail, Retry/loading behavior drift, automatic focus stealing,
navigation or menu promises without routes/actions, independent
route-availability lists, unnecessary React state/effects, and unrelated
style/runtime changes. Resolve in-scope findings and rerun affected validation.

## Rollback and Forward Fix

- Keep the component contract change and app-shell cleanup reviewable in small
  commits.
- Revert presentation changes without reverting the shared runtime migration.
- Restore removed placeholders only with a delivered route/action, not as a
  rollback substitute.
- Forward-fix a caller only when the single-message contract and caller-owned
  loading transition remain valid and auth behavior is unchanged.

## Dependencies

- [Frontend UI Runtime Compatibility](frontend-ui-runtime-compatibility.md)
- completed frontend auth/app-shell foundations
- current route and security documentation

## Re-plan Conditions

- a new route is required
- recovery behavior, authentication, session handling, or redirect contracts
  must change
- different messages require a new typed recovery-state model
- the work requires shared primitive/runtime changes beyond the completed
  compatibility plan
- removing a placeholder exposes a broader app-shell information-architecture
  or layout requirement

## Follow-up

- broader app-shell information architecture or visual redesign
- dedicated Projects/Tasks routes as separate feature plans

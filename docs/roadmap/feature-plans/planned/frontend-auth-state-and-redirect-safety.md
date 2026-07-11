# Feature Plan: Frontend Auth State and Redirect Safety

Status: Planned

Intended PR: `fix/frontend-auth-state-and-redirect-safety`

Milestone: Repository Health Remediation

Impact: Material change (Tier 2) because authentication state and navigation
behavior are user-visible security boundaries.

## Goal

Make frontend authentication transitions explicit and consistent so protected
and public-only routes distinguish an invalid session from a temporary refresh
failure, and post-login navigation cannot escape the application origin.

## Source Findings

- refresh failure handling clears the in-memory token without consistently
  updating the auth store
- bootstrap treats invalid sessions and transient server failures as the same
  unauthenticated result
- public-only routes do not bootstrap an existing session before rendering
- `safeNextPath` accepts backslash-prefixed input that a browser can resolve as
  an external destination
- the Google OAuth setup guide still describes the implemented callback landing
  page as future work
- the frontend auth client contains an unused `currentUser` helper

## Acceptance Criteria

- a refresh `401` produces one explicit unauthenticated transition and protected
  routes redirect to login without a loop
- refresh throttling, network failures, and `5xx` responses remain recoverable
  errors and do not silently present the user as logged out
- a valid session visiting login or signup is bootstrapped and redirected to the
  authenticated app
- `next` accepts only application-local paths and rejects absolute, protocol-
  relative, backslash, encoded bypass, and non-HTTP scheme inputs
- access tokens remain memory-only and existing cookie protections are unchanged
- auth documentation describes the implemented OAuth landing behavior
- the unused `currentUser` helper is either consumed by the selected state
  transition contract or removed

## Assumptions

- backend auth endpoints and response contracts do not need to change
- the existing auth store remains the single frontend owner of authenticated,
  unauthenticated, loading, and recoverable-error state
- refresh concurrency across browser tabs is handled by the separate Auth
  Session Concurrency Hardening plan

## Scope

- define typed refresh/bootstrap outcomes for invalid session versus recoverable
  failure
- route all frontend auth success and failure paths through shared store
  transitions
- bootstrap public-only routes before deciding whether login/signup may render
- harden and centralize local redirect validation
- update affected unit, component, and browser tests
- correct the Google OAuth setup guide and remove or intentionally adopt the
  unused auth helper

## Out of Scope

- refresh-token rotation or replay policy changes
- cross-tab refresh coordination
- backend API, cookie, token, or database schema changes
- account recovery, verification, device management, or auth UI redesign

## Affected Surfaces

- frontend auth API and store
- shared API client retry integration
- protected and public-only route guards
- login/signup redirect handling
- auth unit, component, and browser tests
- Google OAuth setup documentation

## Security and Data Boundary

Redirect validation must be performed on the final decoded value used for
navigation and must fail closed to the normal app destination. Error handling
must not persist tokens, expose refresh cookies, or weaken origin and cookie
controls.

## Implementation Slices

1. Specify the refresh/bootstrap outcome type and store transition table.
2. Route API-client refresh, bootstrap, login, logout, and OAuth completion
   through those transitions.
3. Make public-only and protected route decisions consume the same initialized
   auth state.
4. Replace redirect validation with a same-origin, application-path-only rule.
5. Add regression tests, resolve the unused helper, and update OAuth docs.

## Required Evidence

- unit tests for every auth outcome and store transition
- component tests for protected and public-only routes across loading,
  authenticated, unauthenticated, and recoverable-error states
- redirect tests covering valid local paths and encoded, slash, backslash,
  scheme, and external-host bypass attempts
- browser evidence for direct login/signup navigation with both valid and
  invalid sessions and for post-login `next` handling
- frontend typecheck, lint, unit tests, and production build

## Rollback and Forward Fix

The slice has no data migration. A revert restores the previous client behavior.
If the route bootstrap introduces a navigation loop, the forward fix is to
disable only the public-only bootstrap decision while retaining the hardened
redirect validator.

## Approval and Decision Gates

- approve the state transition table before implementation
- re-plan if implementation requires a backend auth contract or token-storage
  change
- implementation requires explicit approval because it changes authentication
  behavior

## Done Criteria

- all acceptance criteria have mapped passing evidence
- invalid and temporarily unavailable sessions are observably distinct
- no open redirect path remains in the exercised navigation surface
- auth documentation matches runtime behavior

## Dependencies

- completed frontend auth and app shell
- completed auth session lifecycle

## Follow-up

- [Auth Session Concurrency Hardening](auth-session-concurrency-hardening.md)

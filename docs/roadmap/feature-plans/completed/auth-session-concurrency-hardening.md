# Feature Plan: Auth Session Concurrency Hardening

Status: Completed

Plan review: Implemented and validated on 2026-07-21

Intended PR: `fix/auth-session-concurrency-hardening`

Milestone: Repository Health Remediation

Impact: Material change (Tier 2) because refresh rotation and replay response
control account access and session revocation.

## Goal

Prevent legitimate parallel refreshes, including separate browser tabs, from
revoking a newly successful session while preserving deterministic replay
protection for stolen or reused refresh tokens.

## Source Finding

The frontend deduplicates refresh only within one JavaScript module instance.
The backend treats a concurrent rotation compare-and-swap loser as replay and
revokes the session family. Existing integration evidence therefore permits one
refresh to succeed, one to fail, and the successful access token to be rejected
afterward.

## Approved Decision

Use a combined client-and-server strategy without a schema migration or new
dependency:

- serialize refresh, logout, and logout-all across same-origin tabs with the
  browser Web Locks API when available
- propagate session invalidation across tabs with BroadcastChannel messages
  that contain no credential or user data
- preserve the PostgreSQL compare-and-swap rotation boundary
- treat a losing rotation or reuse within a fixed 5-second grace window as a
  retryable conflict that neither mints credentials nor revokes the session
- treat reuse outside the grace window as replay and revoke the affected
  session family

The grace window is the fixed code policy
`REFRESH_CONCURRENCY_GRACE_MS = 5_000`; it is not runtime-configurable.

Client-only coordination is insufficient because unsupported browsers,
separate contexts, copied credentials, or non-browser clients can still race.
Schema-backed idempotency is rejected because returning the same successor
credential would require a larger persistence and credential-handling design
than this remediation needs.

## Existing Architecture to Preserve

- refresh credentials are signed JWTs delivered through a scoped HttpOnly
  cookie; PostgreSQL stores only their cryptographic hashes
- access tokens remain memory-only in the frontend
- PostgreSQL remains the source of truth for refresh rotation, revocation,
  logout, and immediate access-token invalidation
- refresh sessions retain an absolute expiry and do not become sliding sessions
- origin validation, cookie attributes, rate limits, token hashing, and
  session-family controls remain in force

## Acceptance Criteria

- two legitimate near-simultaneous refreshes do not invalidate the session that
  successfully rotates
- a refresh token reused within 5 seconds of the latest successful rotation is
  rejected without receiving credentials and without revoking that rotation
- the same stale token reused after 5 seconds revokes the affected session
  family
- logout and logout-all leave the affected session or sessions revoked whether
  they win or lose a race with refresh
- behavior works across at least two tabs in one browser context, not only
  within one JavaScript module instance
- only an authoritative auth `401` from refresh or current-session validation
  is definitive unauthenticated state; exhausted retryable conflicts remain
  recoverable
- concurrency semantics, timing bounds, mixed-version behavior, and residual
  replay risk are documented
- logs, responses, browser messages, and test artifacts do not disclose access
  tokens, refresh tokens, cookies, token hashes, or authorization headers

## Public API Contract

`POST /api/auth/refresh` keeps its existing `200` success response and existing
`401` behavior for missing, malformed, expired, revoked, wrongly bound, or
replayed-outside-grace credentials.

Add one expected failure:

- status: `409 Conflict`
- code: `REFRESH_CONCURRENCY_CONFLICT`
- safe message: `Session refresh conflicted; retry shortly`
- header: `Retry-After: 1`
- response effects: no credential issuance, no `Set-Cookie`, and no revocation

Expose only `Retry-After` through CORS so the configured frontend origin can
honor the contract. The frontend retries only the exact status/code pair; other
`409` responses remain ordinary recoverable failures.

An active session state that cannot be classified safely returns the existing
recoverable `503 SERVICE_NOT_READY` contract without issuing credentials or
revoking the session. Document both `409` and `503` as expected refresh
failures in Swagger.

## Backend State and Concurrency Contract

Keep refresh rotation as a conditional update of the currently stored refresh
hash. Classify each outcome as follows:

1. Verify the signed refresh credential and load its bound active session.
2. If the presented hash matches, issue successor credentials and attempt the
   existing compare-and-swap rotation.
3. If the rotation loses, re-read the session. Return `409` only when the
   session is still active and a successful rotation is within the grace
   window; return `401` when it is revoked or expired.
4. If the presented hash does not match, compare `lastUsedAt` with the current
   backend clock. Elapsed time `<= 5,000 ms` is a conflict; elapsed time
   `> 5,000 ms` is replay.
5. Revoke replay with a conditional update bound to the observed current hash,
   `lastUsedAt`, user, active state, and expiry. If that update loses to a new
   rotation, re-read and classify the result instead of revoking newer state
   from a stale observation.

An unexpected active state that cannot be classified returns
`503 SERVICE_NOT_READY`, emits a safe diagnostic event, and must not issue
credentials or trigger an unconditional revoke.

Refresh racing with logout or logout-all may return a refresh success if the
rotation commits first, but the final persisted session state must be revoked
and every issued access token must fail subsequent session validation. If
logout wins first, refresh returns `401`.

## Frontend Coordination Contract

- add one client-only coordinator owning the exclusive Web Lock
  `worksync-auth-session`
- keep the current in-module refresh promise inside that cross-tab boundary
- hold the lock through the refresh request and all bounded conflict retries
- abort lock acquisition after 10 seconds so a stalled tab cannot queue auth
  operations indefinitely; never run an operation later after that timeout
- when `navigator.locks` is absent before execution, call the operation once
  without a lock and rely on the backend conflict contract
- if lock acquisition rejects, do not repeat an operation whose execution is
  uncertain; refresh enters recoverable-error while logout and logout-all use
  their existing action-error behavior
- for `409 REFRESH_CONCURRENCY_CONFLICT`, parse `Retry-After` as integer seconds,
  clamp each delay to at most 1 second, and default to 1 second when the header
  is missing or malformed
- retry at most two times, bound total retry delay to 2 seconds, and do not
  clear the current memory access token during intermediate conflict retries
- after retry exhaustion, clear the memory access token and enter the existing
  recoverable-error state
- continue to treat only an authoritative auth `401` as unauthenticated

Use a lazy singleton BroadcastChannel named `worksync-auth-session`. After a
successful logout or logout-all, or a definitive refresh `401`, publish only:

```json
{ "type": "session-invalidated" }
```

Receiving tabs hide protected content while they validate the current
memory-only access token through `/api/auth/me` without refresh. They clear the
token and publish the existing unauthenticated snapshot only when that request
returns `401`; a newer active login is retained, while a transient or malformed
validation failure clears the token and enters recoverable-error. The receiver
does not rebroadcast. Failed logout does not publish invalidation and preserves
the existing authenticated UI behavior. If
BroadcastChannel is absent or construction fails before publication, continue
without cross-tab messaging: the initiating tab still updates immediately and
other tabs become unauthenticated on their next authoritative API or refresh
failure. Do not add localStorage credential or coordination fallback.

## Operational Signals

Add structured business events:

- `refresh_concurrency_conflict` at info level with a stable reason code and
  correlation ID
- `refresh_replay_revoked` at warn level with a stable reason code and
  correlation ID
- an unexpected-classification event at warn level for investigation

Expected `503 SERVICE_NOT_READY` responses are not emitted as
`unhandled_request_error`; a specific originating service event when emitted,
plus the normal HTTP request log, remains the operational evidence.

Do not include session IDs, user IDs, tokens, cookies, hashes, authorization
headers, or other account identifiers. A rise in conflict events is an
observation signal; repeated replay-revocation events require security
investigation. Alert or dashboard infrastructure is outside this PR because no
production monitoring target is selected.

## Implementation Slices

1. Add deterministic reuse classification and the backend conditional
   conflict/revocation state machine, public error code, safe telemetry, Swagger
   documentation, and `Retry-After` CORS exposure.
2. Add the cross-tab lock, bounded exact-code retry, invalidation channel, and
   frontend state integration without persisting credentials.
3. Add deterministic unit, contract, real-PostgreSQL integration, security, and
   multi-tab browser evidence.
4. Update authentication and security documentation, then run the
   post-implementation review/fix gate before authoritative final validation.
5. After all required evidence passes, move this plan to completed and update
   the feature-plan index and roadmap priority.

## Required Evidence

### Deterministic and Contract Evidence

- unit evidence for 4,999 ms, 5,000 ms, and 5,001 ms using a pure classifier or
  injected clock rather than wall-clock sleeps
- contract evidence for `409`, `REFRESH_CONCURRENCY_CONFLICT`, safe message,
  `Retry-After: 1`, CORS exposure, absence of `Set-Cookie`, and recoverable
  `503 SERVICE_NOT_READY` for an unclassifiable active state
- frontend unit evidence for Web Lock serialization, API-absent fallback,
  bounded acquisition timeout, lock-rejection behavior, bounded `Retry-After`
  parsing, exact-code retries, retry exhaustion, authoritative
  BroadcastChannel invalidation reconciliation including newer-login and
  overlapping-event races, and channel-unavailable fallback

### Real PostgreSQL and Security Evidence

- at least 20 repeated simultaneous refresh pairs; each pair produces one
  `200` and one `409`, and the successful access token remains usable
- recent stale-token reuse returns `409` without revocation
- a token with session `lastUsedAt` backdated by at least 10 seconds returns
  `401`, revokes the session, and invalidates the latest access token
- conditional replay revocation racing a newer valid rotation does not revoke
  the newer state from a stale observation
- repeated refresh-versus-logout and refresh-versus-logout-all races end with
  the required sessions revoked and all resulting access tokens unusable
- security evidence that conflicts never mint credentials and responses and
  logs contain no credential material

### Live Browser and CI Evidence

- retain the existing mocked frontend E2E suite for fast UI regression evidence
- add a dedicated live Playwright flow using the actual frontend, backend,
  migrated PostgreSQL test database, and Chromium
- with Web Locks available, two tabs bootstrap concurrently and both reach the
  authenticated app while the persisted session remains active
- with Web Locks shadowed as unavailable before application code loads, the same
  two-tab flow uses a context-level route barrier to hold the first two actual
  refresh requests until both arrive, then continues rather than fulfills them
  to the real backend; the first pair must produce one `200` and one `409`, and
  both tabs then recover through the actual cookie rotation and retry contract
- successful logout in one tab invalidates protected UI in both tabs
- browser traces and videos remain disabled; tests must not print or persist
  credentials or cookies

Extend the existing `frontend-e2e` CI job with a PostgreSQL service, migration
step, and a separate live concurrency command after the mocked suite. Set its
timeout to 20 minutes. The live runner supplies explicit test auth environment,
sets `AUTH_RATE_LIMIT_ENABLED=false`, and does not require a working Redis
connection. PostgreSQL integration suites and the live browser command must
fail rather than skip when prerequisites are unavailable in CI.

Final validation includes backend unit, integration, contract, security,
typecheck, lint, and build; frontend unit, typecheck, lint, build, existing E2E,
and live concurrency E2E; PR evidence checks; and `git diff --check`.

## Post-Implementation Review Gate

Before final validation, review the working-tree-inclusive change against:

- coding standards and maintainability
- backend service and error placement
- frontend async state and browser coordination
- PostgreSQL compare-and-swap and conditional-revocation correctness
- API and mixed-version consumer compatibility
- authentication, replay, leakage, CORS, and browser security
- operational signal safety and diagnostic usefulness

Fix or explicitly disposition every in-scope finding, re-review materially
changed portions, then run the authoritative final validation. Required
PostgreSQL, security, or live-browser evidence that is skipped leaves the plan
incomplete.

## Mixed-Version, Rollback, and Stop Conditions

Deploy backend before frontend if the components are released separately. An
old frontend treats the new `409` as recoverable; a new frontend talking to the
old backend still benefits from Web Locks but cannot rely on the server grace
fallback.

Because this design has no migration, rollback reverts the backend state
machine, API/CORS contract, frontend coordinator, tests, and documentation as
one bounded slice. A partial rollback is not completion evidence.

Stop and re-plan before expanding implementation if any of these becomes
necessary:

- a schema migration, shared service, or new dependency
- a different grace duration or runtime-configurable security policy
- a breaking success or authentication contract change beyond the additive
  `409` and recoverable `503`
- live browser evidence cannot exercise the real backend and PostgreSQL seam
- backend topology expands to replicas whose clock skew could approach the
  5-second grace window

## Residual Risk

An attacker who has copied the current refresh token and wins the first
rotation is indistinguishable from the legitimate holder. The selected policy
does not silently authorize the losing or stale request: it issues no credential
during grace and revokes detected replay after grace. Frequent legitimate
rotation can delay replay revocation, so conflict and replay events remain
explicit observation and investigation signals. Browsers without
BroadcastChannel retain server-side revocation guarantees but may show stale
authenticated UI in another tab until its next authoritative request.

## Out of Scope

- session/device management UI or single-device revocation controls
- replacing the authentication architecture or introducing a broad BFF layer
- access-token persistence
- account linking, password recovery, or OAuth provider expansion
- production monitoring infrastructure, deployment, or traffic changes
- unrelated auth state cleanup owned by the preceding plan

## Approval and Completion

The reviewed combined no-schema strategy and fixed 5-second grace policy were
approved and implemented. No schema, shared-infrastructure, new-dependency, or
breaking success/authentication contract change was required.

Completion evidence on 2026-07-21 includes deterministic boundary tests,
public contract and CORS tests, frontend coordinator and retry tests, 20 real
PostgreSQL concurrent refresh pairs, conditional-revocation and logout race
tests, security coverage, and live Chromium two-tab flows with and without Web
Locks. Backend and frontend validation, existing mocked E2E, live E2E, build,
lint, typecheck, PR evidence self-test, and diff hygiene were run before
closeout.

## Dependencies

- [Frontend Auth State and Redirect Safety](frontend-auth-state-and-redirect-safety.md)
- completed auth session lifecycle

## Follow-up

- production session retention and cleanup remains in Production Deployment
  Foundation

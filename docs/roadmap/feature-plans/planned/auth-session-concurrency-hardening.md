# Feature Plan: Auth Session Concurrency Hardening

Status: Planned

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

## Acceptance Criteria

- two legitimate near-simultaneous refreshes do not invalidate the session that
  successfully rotates
- a refresh token reused outside the accepted concurrency contract revokes or
  contains the affected session as defined by the security policy
- logout and logout-all remain deterministic during refresh races
- behavior works across tabs or browser contexts, not only within one module
  instance
- concurrency semantics, timing bounds, and residual replay risk are documented
- logs and responses do not disclose refresh tokens or token hashes

## Assumptions

- rotating opaque refresh tokens and memory-only access tokens remain the target
  architecture
- PostgreSQL remains the source of truth for refresh-session state
- the frontend state contract from Frontend Auth State and Redirect Safety is
  available before client coordination is added

## Decision Gate

Before implementation, compare these bounded strategies against the repository
threat model and browser constraints:

1. cross-tab client coordination only
2. a bounded server-side idempotency or grace contract for concurrent rotation
3. a combined client and server strategy

Select the smallest strategy that covers legitimate multi-context concurrency
without converting real replay into silent success. Record why rejected options
are insufficient. If the selected strategy requires a schema migration or a new
shared service, stop and re-plan its rollout and rollback separately.

## Scope

- define the legitimate-concurrency and malicious-replay contract
- implement the selected refresh coordination/rotation behavior on the minimum
  required frontend and backend surfaces
- preserve origin, cookie, token hashing, and session-family controls
- update integration, security, concurrency, and browser evidence
- document the selected contract and operational signals

## Out of Scope

- session/device management UI
- replacing the authentication architecture or introducing a broad BFF layer
- access-token persistence
- account linking, password recovery, or OAuth provider expansion
- unrelated auth state cleanup owned by the preceding plan

## Affected Surfaces

- backend session rotation service and persistence contract
- frontend refresh coordinator if required by the selected strategy
- auth integration and security tests
- multi-context browser tests
- auth workflow and security documentation
- database migration only if explicitly approved after the decision gate

## Security and Data Boundary

The solution must model the attacker who has copied a refresh token separately
from a legitimate user opening multiple tabs. Any grace window must be bounded,
single-purpose, auditable, and unable to mint an unbounded token chain.

## Implementation Slices

1. Reproduce and classify same-client, cross-tab, and replay race timelines.
2. Complete the decision gate and approve the concurrency contract.
3. Implement the minimum coordination and rotation changes.
4. Add database-backed concurrency, replay, logout, and browser-context tests.
5. Update security/workflow documentation and operational logging guidance.

## Required Evidence

- real PostgreSQL integration tests for simultaneous rotation and transaction
  outcomes
- security tests showing a token outside the legitimate concurrency contract is
  contained
- tests for refresh racing with logout and logout-all
- browser evidence using at least two independent tabs or contexts
- repeated concurrency runs sufficient to expose nondeterministic failures
- backend and frontend typecheck, lint, unit/contract/security suites, and builds
- migration apply/rollback evidence if the approved design changes schema

## Rollback and Forward Fix

If no schema changes are selected, revert the coordinator/rotation contract as
one bounded slice. If schema changes are selected, the reviewed plan must define
expand/contract compatibility and a forward-fix path before approval; a simple
code revert is not sufficient.

## Approval and Decision Gates

- explicit approval is required for the selected authentication/security policy
- schema, shared-infrastructure, or public-contract changes require re-planning
- unresolved replay semantics block implementation completion

## Done Criteria

- legitimate multi-context concurrency preserves a usable session
- replay protection remains evidenced against the documented threat model
- all acceptance criteria have mapped passing tests and no required concurrency
  suite is skipped

## Dependencies

- [Frontend Auth State and Redirect Safety](frontend-auth-state-and-redirect-safety.md)
- completed auth session lifecycle

## Follow-up

- production session retention and cleanup remains in Production Deployment
  Foundation

# Feature Plan: Production Deployment Foundation

Status: Planned - blocked on production target decision

Intended PR: Split into target-specific PR plans after the required decisions

Milestone: 5 - Production Readiness

Impact: High-risk deployment and persistent-data readiness change

## Goal

Make WorkSync deployable to one named production target through a repeatable,
observable, recoverable release path whose readiness decision is backed by
target-specific evidence.

## Existing Foundation

- Core workspace, project, and task workflows are stable enough for critical
  smoke coverage.
- CI, Docker image targets, artifact validation, runtime smoke, environment
  documentation, and local topology exist.
- The production target, secret owner, hosted service contracts, deployment
  promotion path, and recovery evidence remain unresolved.

## Acceptance Criteria

- One production target and operating model are approved before target-specific
  configuration is implemented.
- Build/publish/deploy identifies an immutable artifact and its source revision.
- Environment and secret validation fails before serving traffic when required
  configuration is missing or unsafe.
- Auth cookie, CORS/origin, proxy, TLS, database, Redis, and object-storage
  assumptions match the selected target.
- Health separates liveness from dependency readiness without leaking secrets.
- Post-deploy smoke covers login/session refresh plus workspace, project, and
  task critical paths; notification, queue, and storage paths are added when
  those dependencies are part of the release.
- Basic structured logs, request/error correlation, health, and critical journey
  metrics support a ready/not-ready decision.
- PostgreSQL backup ownership, retention, encryption, and a restore drill are
  required release-readiness evidence rather than a follow-up.
- Rollback, forward fix, database compatibility, traffic containment, and failed
  migration handling are documented and rehearsed at appropriate depth.
- Secret scanning ownership and evidence are explicit.
- No production-ready claim is made without a real target and real-environment
  verification.

## Required Decisions Before Implementation

- production compute/deployment target and image/build ownership
- managed PostgreSQL, Redis, and object-storage providers used by delivered
  features
- DNS/TLS/reverse-proxy and network boundary
- secret manager and CI identity/permissions model
- artifact registry and environment promotion model
- deployment migration strategy and rollback compatibility window
- logs/metrics/alert destination and operational owner
- backup provider, retention, restore destination, and recovery objectives

Once these decisions are known, split Redis hardening, refresh-session cleanup,
secret-scanning fallback, worker deployment, or backup automation into separate
PR-sized plans when they need independent rollout or evidence. This document is
not authorization for one broad infrastructure PR.

## Scope

- target decision record and production topology
- immutable artifact publish/promotion path
- environment and secret ownership/validation
- hosted or repository-owned secret scanning evidence
- production health/readiness and basic observability
- refresh-session retention/cleanup disposition
- production Redis client/transport requirements for delivered dependencies
- deployment-safe migration procedure
- PostgreSQL backup and restore evidence
- critical post-deploy smoke and release readiness checklist
- rollback, containment, and forward-fix procedure
- deployment, infrastructure, validation, and roadmap documentation

## Out of Scope

- multi-region, zero-downtime-at-all-costs, or advanced autoscaling
- full incident automation or enterprise compliance program
- observability dashboards beyond the minimum critical signals
- deploying undelivered notifications, jobs, or files
- unrelated application feature work

## Affected Surfaces

- CI/CD identity, artifact publishing, and environment promotion
- deployment target configuration, network, TLS, and health checks
- PostgreSQL migration, backup, restore, and recovery workflow
- Redis, object storage, and worker deployment only for delivered dependencies
- runtime logs, metrics, correlation, and release smoke
- deployment, infrastructure, security, validation, workflow, and roadmap docs

## Security and Data Boundary

- Use short-lived workload identity where the target supports it; otherwise
  document scoped credentials, rotation, and access ownership.
- Do not expose secrets to untrusted builds, client bundles, health responses,
  logs, or smoke output.
- Preserve secure cookie, trusted proxy, origin/CORS, authentication, and tenant
  isolation assumptions under the target network topology.
- Run migrations as an explicit release step with compatible application
  sequencing and a recorded recovery path.
- Treat backup success as incomplete until restoration is proven into an
  isolated environment and core data integrity is checked.
- Bound and observe session cleanup; never remove active sessions due to a clock,
  selection, or concurrency error.
- Match Redis TLS, authentication, reconnect, pooling, timeout, and failure
  behavior to the selected provider when Redis is a release dependency.

## Engineering Improvement Review

### UX and Release Safety

- Prefer maintenance/containment behavior that is explicit to users over partial
  success with corrupted state.
- Smoke tests should report actionable step failure without printing secrets or
  user data.

### Backend and Infrastructure

- Separate liveness, readiness, and deep smoke concerns.
- Apply bounded timeouts and retry policies to every hosted dependency.
- Correlate deployment revision, request, and critical background job where
  applicable.
- Avoid target abstractions until a second target is a real requirement.

### Database and Recovery

- Define backup frequency/retention/encryption, restore ownership, recovery
  point/time objectives, and integrity checks.
- Exercise restore in isolation and prove workspace/project/task relationships,
  not only database connectivity.
- Keep schema changes backward-compatible through the rollback window or require
  forward-fix-only approval explicitly.

### Security and Testing

- Validate secret scanning, least-privilege CI/deploy identity, dependency
  transport security, and production-safe logging.
- Pair local image/config tests with staging/target evidence.

## Ordered Implementation Plan

1. Approve the production target, operating owners, hosted dependencies,
   promotion model, and recovery objectives.
2. Revise this plan into target-specific PR slices with dependency order and
   independent rollback. At minimum assess artifact/promotion, environment and
   secrets, data recovery, observability, and deployment verification slices.
3. Establish immutable artifact publishing and environment/secret validation.
4. Configure target network, health/readiness, dependency transports, and
   minimum observability.
5. Establish migration sequencing plus PostgreSQL backup/restore ownership and
   execute an isolated restore drill.
6. Implement critical post-deploy smoke and the evidence-based release
   readiness checklist.
7. Rehearse failure containment, rollback or forward fix, and failed migration
   recovery at the approved depth.
8. Reconcile deployment, infrastructure, security, validation, workflow, and
   roadmap docs.
9. Run a post-implementation review for each delivery slice before its final
   validation and again across the assembled release path.

## Validation Contract

| Guarantee | Required evidence |
|---|---|
| Immutable reproducible release | artifact digest/source revision and clean build/promotion evidence |
| Safe configuration and secrets | startup validation, CI permission review, and secret-scanning evidence |
| Target network/auth correctness | staging/target TLS, proxy, cookie, origin/CORS, auth-refresh tests |
| Critical product availability | target smoke for login, workspace, project, and task; conditional feature paths when delivered |
| Dependency failure behavior | target-shaped DB/Redis/storage timeout, reconnect, and readiness evidence as applicable |
| Data recoverability | provider backup evidence plus isolated restore drill and relational integrity checks |
| Operability | logs/metrics/health can identify revision and critical journey failure without sensitive data |
| Release reversibility | rehearsed containment and rollback/forward-fix path with migration compatibility evidence |

## Post-Implementation Review Gate

Review for mutable artifacts, overprivileged credentials, secret exposure,
incorrect trusted-proxy/cookie/origin behavior, false-positive readiness,
unbounded retries, unsafe migration order, untested restore, missing critical
smoke paths, rollback claims without rehearsal, and local-only evidence. Resolve
in-scope findings; re-plan target or architecture changes.

## Rollback and Forward Fix

- Preserve the last known-good immutable artifact and target configuration.
- Stop/contain traffic before rollback when data or contract compatibility is
  uncertain.
- Roll back application code only across a schema-compatible window; otherwise
  use the approved forward-fix path.
- Never use destructive database rollback without separately reviewed and
  approved recovery steps.

## Dependencies

- core workspace/project/task workflows: satisfied
- selected production target and accountable owners: unresolved
- [Background Jobs Foundation](background-jobs-foundation.md) only if session
  cleanup or another required operation uses a scheduled worker
- Notifications/File Upload foundations only when those features are included
  in the first production release

## Re-plan Conditions

- target or provider changes
- new public network boundary, service, worker, or datastore enters the release
- release requires breaking migration or difficult-to-reverse data operation
- recovery objectives cannot be met by the selected provider
- one plan slice crosses independent ownership or rollback boundaries

## Follow-up

- incident runbook automation and operational exercises
- advanced dashboards, SLOs, and alert tuning based on production signals
- periodic dependency and provider currentness review

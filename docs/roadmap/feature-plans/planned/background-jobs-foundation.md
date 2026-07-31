# Feature Plan: Background Jobs Foundation

Status: Planned

Intended PR: `feat/background-jobs-foundation`

Milestone: 4 - File Uploads and Background Jobs

Impact: Material asynchronous runtime and operational boundary

## Goal

Integrate the already selected BullMQ/Redis stack around one concrete WorkSync
job and prove bounded retry, idempotency, failure visibility, and graceful
worker operation without building a speculative generic job framework.

## Existing Foundation

- Redis is available in local Docker modes.
- Project documentation selects BullMQ/Redis, but BullMQ is not installed or
  integrated and no worker runtime exists.
- Potential first jobs include refresh-session cleanup, notification email, and
  file scanning/cleanup; the first use case is not yet selected.

## Acceptance Criteria

- One concrete job with a real business/operational need is selected before
  infrastructure code is added.
- BullMQ and Redis configuration validate startup inputs and use the selected
  production provider's TLS, credentials, retry, and connection requirements.
- Every payload has a versioned strict schema and server-derived tenant/resource
  authority; invalid or unknown versions fail explicitly.
- The first job has a stable idempotency key and is safe under duplicate
  delivery, retry, worker restart, and partial failure.
- Attempts, exponential/backoff policy, timeout, and poison/dead-letter behavior
  are bounded and observable.
- Producer and worker shutdown stop accepting work, drain/close within a bounded
  period, and do not silently lose acknowledged jobs.
- Local hybrid/full Docker and direct-development run instructions identify how
  Redis and the worker start and stop.
- Real Redis/BullMQ integration evidence covers success, invalid payload,
  duplicate, retry, terminal failure, crash/restart, and shutdown.

## Required Decision: First Job

Select exactly one production-shaped use case:

- file malware scan or orphan cleanup, if File Upload requires it
- bounded refresh-session cleanup, if production readiness prioritizes session
  retention
- notification email only after notifications and email delivery become
  approved scope

The first use case owns the foundation's concrete semantics. Do not create a
“representative” no-op job. If File Upload requires scanning, first approve and
deliver the minimal attachment metadata/storage lifecycle slice, then run this
worker plan before the attachment availability/UI slice.

## Scope

- BullMQ dependencies and minimal producer/worker composition
- versioned typed payload for the selected job
- strict runtime validation and server-derived authority
- job identity, idempotency, retry/backoff/timeout, terminal-failure policy
- worker topology, concurrency, graceful shutdown, and local run modes
- structured logs and basic queue/job health signals
- selected job implementation and real integration evidence
- deployment, Docker, validation, and roadmap documentation

## Out of Scope

- multiple unrelated job types
- queue technology comparison or Redis replacement
- generic workflow engine, cron platform, dashboard product, or autoscaling
- email/reminders/digests unless one is the explicitly approved first job
- production deployment itself

## Affected Surfaces

- backend dependencies, configuration, and process composition
- producer and worker runtime boundaries
- selected job's owning module and persistence side effect
- Redis/BullMQ local Docker topology and environment validation
- deployment, operations, validation, and roadmap documentation
- unit and real Redis/BullMQ integration tests

## Security and Data Boundary

Queue payloads are untrusted transport data and never permanent authority.
Workers strictly validate the payload version, re-resolve current server-side
state and tenant scope, and use least-privilege Redis credentials. Jobs and logs
must not carry secrets, access tokens, signed URLs, or unnecessary private data.

## Runtime and Job Contract

- Define a discriminated payload with `type`, `version`, stable job identity,
  and only the identifiers required to re-resolve current state.
- Do not embed trusted roles, permissions, secrets, or large mutable snapshots in
  the payload.
- The worker re-resolves records and authorization/lifecycle preconditions; a
  queued user action is not permanent authority.
- Use BullMQ job IDs and a persistence-side idempotency guard where side effects
  need stronger guarantees than queue deduplication.
- Classify retryable versus terminal failures. Invalid payloads and permanent
  authorization/state failures do not churn through retries.
- Define attempt count, backoff with jitter where appropriate, timeout/stall
  handling, retention of completed/failed records, and replay procedure.
- Emit structured job type/version/id/attempt/outcome/duration without payload
  secrets or private content.

## Engineering Improvement Review

### Operations and Reliability

- Expose connection readiness separately from process liveness.
- Bound worker concurrency based on the first job's downstream limits.
- Define poison/dead-letter inspection and manual replay ownership.
- Monitor backlog age, attempts, terminal failures, processing duration, and
  worker/Redis connection state before adding advanced dashboards.

### Security

- Validate all payloads and re-resolve server-side authority.
- Use least-privilege Redis credentials and TLS in production.
- Rate-limit or deduplicate producer entry points to prevent queue flooding.
- Redact secrets, tokens, signed URLs, and private content from jobs and logs.

### Code Quality and Testing

- Keep transport/bootstrap separate from the first job handler.
- Handler names and result types state the side effect and terminal outcome.
- Avoid a universal base class or plugin system until a second real job proves
  the abstraction.

## Ordered Implementation Plan

1. Approve the first job, its ownership, side effect, idempotency key, retry
   policy, and operational success/failure definition.
2. Define Redis/BullMQ environment validation, producer/worker topology, and
   local/production connection lifecycle.
3. Implement the versioned payload schema, minimal queue adapter, and graceful
   startup/shutdown.
4. Implement the first job with state re-resolution, idempotency, bounded retry,
   and terminal-failure behavior.
5. Add structured observability and documented inspect/replay procedure.
6. Wire direct, hybrid, and full Docker development modes without changing
   unrelated services.
7. Add unit and real Redis/BullMQ integration tests for all required failure and
   recovery paths.
8. Reconcile deployment, Docker, validation, environment, and roadmap docs.
9. Run the post-implementation review gate before final validation.

## Validation Contract

| Guarantee | Required evidence |
|---|---|
| Strict versioned payload | unit and integration tests for missing/invalid/unknown fields and versions |
| Idempotent side effect | real-Redis duplicate, retry, and concurrent-worker tests plus persistence evidence |
| Bounded failure behavior | retry/backoff/timeout/stall and terminal-failure integration tests |
| Crash and restart recovery | worker termination/restart test against queued/active work |
| Operational lifecycle | readiness, graceful shutdown, and documented run-mode smoke |
| Secure production shape | TLS/auth/config validation and secret-redaction tests or target evidence |

## Post-Implementation Review Gate

Review for trusted payload authority, unbounded retries/concurrency, duplicate
side effects, swallowed failures, shutdown races, reconnect storms, secret
logging, queue-record leaks, and abstractions not required by the selected job.
Resolve in-scope findings and rerun affected validation.

## Rollback and Forward Fix

- Keep producer enablement separable from worker deployment.
- Stop enqueueing before rolling back a worker contract. Version payloads so an
  older worker never misinterprets newer jobs.
- Define how queued incompatible jobs are drained, migrated, or quarantined;
  never discard them silently.

## Dependencies

- selected first job use case
- local Redis foundation and approved production Redis assumptions
- an approved and delivered minimal source contract when the selected job reads
  or mutates notification/file state; do not depend on the entire downstream
  feature plan when that would create a cycle

## Re-plan Conditions

- more than one unrelated first-use case is required
- Redis/BullMQ selection changes
- worker must be deployed independently with new infrastructure ownership
- exactly-once external side effects require a broader transaction/outbox design

## Follow-up

- add the second job only after reviewing which abstractions are genuinely
  shared
- production scaling, dashboards, and alert tuning based on observed load

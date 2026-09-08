# Feature Plan: Background Jobs Foundation

Status: Implemented and locally validated; Draft PR #54 awaiting review

Current executed evidence and remaining gaps:
[`background-jobs-validation.md`](../../../workflows/background-jobs-validation.md).

PR: [#54](https://github.com/methat-ruk/worksync/pull/54) from
`feat/background-jobs-foundation`

Implementation completed: 2026-09-08

Milestone: 4 - File Uploads and Background Jobs

Reviewed against: `5a3fa628a21d7207045d3226c142ab3b1483c03f` (2026-09-08)

Impact: Material asynchronous runtime and session-retention change. Production
apply performs irreversible deletion and requires a separate release decision.
Implementation was subsequently authorized. Production data mutation remains
outside that approval and requires the separate release decision above.

## Goal and First Job Decision

Deliver one complete BullMQ/Redis workflow: bounded cleanup of **AuthSession
records whose absolute expiry is at least 30 days in the past**. PostgreSQL
remains authoritative; Redis is a recoverable maintenance trigger, never session
storage. Remove obsolete token hashes/metadata without changing login, refresh,
replay detection, logout, access-token checks, or public API/UI contracts.

| Candidate | Decision and evidence |
| --- | --- |
| Expired-session cleanup | **Selected.** Existing absolute expiry, expiry index, and expired/missing-session rejection provide a small authoritative boundary. No cleanup exists; the production plan already identifies retention/cleanup as an operational need. |
| Attachment reconciliation | Real existing operation, but `reconcile()` combines stale upload inspection/promotion, failed-record retention, and object-delete recovery. Several storage failures increment counters instead of throwing; there is no whole-run deadline and up to three batches of storage calls. Wrapping it unchanged could report queue success after partial failure. Automating it needs an attachment lifecycle/recovery review. Keep its manual command. |
| Malware scan | Requires scanner/provider, quarantine and availability contracts. The delivered attachment policy does not select one. No scan guarantee is introduced here. |
| Notification email | Requires delivery/provider and duplicate-send semantics beyond existing in-app notifications. Defer until approved. |

A bounded manual cleanup command would be simpler if ad-hoc retention were the
only requirement. Select BullMQ because this milestone explicitly requires
recurring execution, retries, restart recovery and worker operation; do not
claim this cleanup algorithm alone requires a broker for correctness.

## Review Findings and Resolutions

| Severity | Original gap | Resolution |
| --- | --- | --- |
| Blocker | First job, side effect and retention were deferred to implementation step 1. | Fixed job and eligibility policy below; no first-job choice left to implementers. |
| Blocker | “Stable idempotency key” did not explain DB commit followed by lost acknowledgment. | Guarded deletion converges under replay; queue deduplication does not protect data correctness. |
| Major | Retry, timeout, scheduling, shutdown and replay lacked limits/ownership. | Numerical budgets, terminal/retryable classes, schedule identity, ordered teardown and process-fault evidence. |
| Major | Production provider was assumed despite being undecided. Auth Redis transport only supports `redis://`. | Separate jobs transport/config; production provider and auth transport hardening stay in the deployment plan. |
| Major | Root `AppModule` would load auth, attachment/OAuth configuration and unrelated providers into the worker. | Dedicated worker composition requiring no JWT/OAuth/S3 secrets. |
| Major | Eviction, persistence, job-record privacy, backlog and Redis loss were unspecified. | No-eviction/persistence contract, bounded safe records and reconstruction from DB state. |
| Major | Real Redis alone cannot prove DB eligibility, auth races, cancellation or process shutdown. | Real DB/queue/process matrix, CI prerequisites and artifact checks below. |
| Minor | Generic DLQ, tenant payload, outbox or framework could expand scope without need. | Failed set, global maintenance payload, no outbox/framework or speculative second job. |

These are plan findings, not findings proven in a future implementation. This
episode is source-based plan review by the plan author, not independent review
or executed runtime validation.

## Repository Evidence and Impact

- `app/backend/prisma/schema.prisma`: `AuthSession` has `expiresAt`, token hash,
  revocation and metadata, `@@index([expiresAt])`, and no child records requiring
  cascading cleanup.
- `app/backend/src/auth/services/session.service.ts`: creation sets absolute
  expiry; refresh preserves it; refresh and active-access checks reject expired
  or missing sessions. Revocation is not a deletion/retention policy.
- `app/backend/src/auth/services/auth-rate-limit.service.ts`: custom Redis
  transport rejects `rediss://`. Do not reuse it for BullMQ or replace it here.
- `app/backend/package.json`: BullMQ is absent. Node 22, pnpm, Prisma/pg, Pino
  and NestJS are already selected. Use the existing workspace lockfile.
- `app/backend/src/database/prisma.service.ts`: connection timeout exists, but
  cleanup statement deadlines and a worker-specific pool do not.
- `docker/compose.yml`: Redis 7 with AOF/volume. Test Compose disables persistence;
  it is not durability evidence.
- `.github/workflows/ci.yml`: backend quality/service shards, real DB/Redis
  prerequisites, exact Compose service lists and shard-result validation exist.
- `scripts/validate-backend-artifact.cjs`: requires `dist/main.js` and generated
  Prisma, rejects compiled tests/nested API entrypoints. Preserve these checks.

Direct scope: auth cleanup, jobs transport, worker/control/configuration,
dependencies and tests. Coupled scope: existing session/auth-rate-limit behavior.
Operational scope: dev/Docker, artifact/CI checks, logs/health and runbooks. No
frontend, attachment lifecycle, auth algorithm, schema migration or email provider
change is selected.

## Auth Cleanup Contract v1

### Retention and authority

1. Delete only when `expiresAt <= cutoff`, where
   `cutoff = databaseNow - 30 * 24 hours`. Equality is eligible. Keep revoked but
   unexpired sessions and sessions expired less than 30 days ago. Do not use
   `revokedAt`, `lastUsedAt`, or `createdAt` as alternate deletion criteria.
2. Thirty days is a **proposed application policy for approval**, not an existing
   policy or legal/compliance claim. Before production apply, confirm session
   records have no investigation/retention hold requirement. If a hold is needed,
   re-plan before deletion; do not invent a hold platform in this feature.
3. Read PostgreSQL `CURRENT_TIMESTAMP` once per attempt and freeze that cutoff.
   No payload/control argument supplies time, cutoff, retention, SQL, user,
   workspace or batch size. A retry may use a later cutoff: the semantic request
   is “clean currently eligible rows,” not a historical snapshot.
4. Before mutation, reject DB/process UTC clock skew over 5 minutes. Use monotonic
   elapsed time for budgets. This catches one faulty clock, not two equally wrong
   clocks; production requires synchronized clocks and clock-health ownership.
   No local timezone/DST dependency exists. A backward clock delays cleanup.
5. This is privileged global **system maintenance**, not delegated user work.
   Tenant payloads and user impersonation would be misleading. The guarantee is
   that active/ineligible sessions across all users remain intact.

### Persistence and bounds

- Place the handler in `auth/services/session-cleanup.service.ts`, separate from
  `SessionService`. Inject the worker Prisma client and safe logger; no BullMQ
  import. The jobs adapter classifies transport errors.
- Each short Prisma transaction uses explicit Read Committed isolation and
  selects only up to **500 IDs**, ordered by
  `expiresAt, id`, with the expiry predicate, then `deleteMany` constrained by
  **both the selected IDs and the same expiry predicate**. Stop on empty selection;
  maximum **10 batches / 5,000 selected rows per attempt**. Report actual deletes.
- The repeated predicate protects a concurrently changed expiry. Read no token
  hashes/user agents/user relations. Do not use offset pagination or keep a
  transaction open across a Redis call.
- Use Prisma for record operations. Fixed tagged/parameterized raw queries are
  permitted only for DB time/transaction-local settings if the adapter needs
  them; no string-concatenated SQL or new generic persistence layer.
- Dry-run uses the same eligibility and bounds with `(expiresAt, id)` keyset
  pagination; otherwise it would repeatedly count the first 500 undeleted rows.
  It returns `wouldDelete`, never mutates, and never claims enforcement succeeded.
- A row/time cap is a successful **bounded partial pass**, `capped=true`; remaining
  work waits for the next interval. A query error is failure even after earlier
  batches committed. Do not treat capped success as “backlog drained.”
- No schema/index change is planned. Measure the existing expiry index on
  representative data; add an index only if that evidence requires re-planning.

### Idempotency and concurrency

Semantic identity: `auth-session-cleanup-v1`; delivery identity: generated
BullMQ job ID. Guarded deletion is the durable idempotency boundary. Missing rows
and concurrent zero-delete results are successful no-ops.

Launch one worker replica, concurrency 1; set queue global concurrency 1 to
limit normal load. Correctness must also hold with two workers or lost queue
locks: overlapping selection cannot delete an ineligible row. Queue concurrency
is not a fencing guarantee. Short DB transactions and bounded lock/deadlock
retries handle contention.

Crash before batch commit rolls back that batch. Crash after commit/before queue
acknowledgment can replay and delete more eligible rows but cannot revive a
session. Limits apply **per attempt**, not exactly 5,000 rows over every retry.
No idempotency table, data-correctness Redis lock, outbox or exactly-once claim.

## Architecture and Dependencies

- Use BullMQ directly in narrow Nest providers. Add BullMQ **5.x, at least 5.16**
  (Job Schedulers) and compatible direct ioredis **5.x** for explicitly owned
  connection lifecycle. Resolve/pin exact patched versions and lockfile integrity
  at install time, validate Node 22/CommonJS, licenses/transitive runtime closure
  and the production audit. Do not use unqualified `latest` or switch major to
  bypass a failure. Patch resolution is verification, not a deferred design choice.
- No `@nestjs/bullmq`, `@nestjs/schedule`, generic broker interface, base class,
  plugin registry, sandbox processor or separate scheduler service is needed.
- `src/worker.ts` bootstraps a dedicated `WorkerModule` application context with
  worker config, Pino, worker Prisma provider, handler and jobs providers. Do not
  import `AppModule`, `AuthModule`, S3 or OAuth. API startup creates no jobs clients.
- Reuse generated Prisma/PrismaPg through a worker-only client factory for the
  pool/deadlines below. Preserve API database defaults and API environment checks;
  do not make required auth variables optional just to start a worker.

### Worker configuration

Validate before opening connections; no implicit fallback to API/developer URLs.

| Variable | Contract |
| --- | --- |
| `NODE_ENV`, `LOG_LEVEL` | Existing enums; JSON Pino output outside development. |
| `JOBS_DATABASE_URL` | Required PostgreSQL URL; tests require database name ending `_test`; production uses a restricted maintenance identity. |
| `JOBS_REDIS_URL` | Required `redis://` or `rediss://`; validate host, port, decoded credentials, integer DB index. Reject query/fragment overrides; never echo the URL. Production requires TLS plus nonempty ACL username/password. |
| `JOBS_REDIS_CA_FILE` | Optional readable provider CA; require certificate/hostname verification, never `rejectUnauthorized=false`. |
| `JOBS_QUEUE_PREFIX` | Required 1–64 ASCII letters/digits/hyphen/underscore, environment-specific. Tests use unique prefixes. Use BullMQ `prefix`, not ioredis `keyPrefix`. |
| `JOBS_SESSION_CLEANUP_MODE` | `dry-run` (default) or `apply`, from trusted process config only. All replicas in one namespace use the same mode; drain before mode change. |
| `JOBS_SCHEDULER_ENABLED` | Explicit boolean. True registers the fixed schedule at startup; false consumes without registration. False does not remove an existing scheduler. |
| `JOBS_HEALTH_PORT` | Integer 1–65535, default 4001, loopback bind only. Independent local/test workers select different ports; no host port publication in Compose. |

Keep retention, batch, concurrency and deadline constants fixed for v1, not a
tuning platform. Test-only constructors may inject shorter validated budgets.

Queue/control client: offline queue disabled, `maxRetriesPerRequest=1`, connect
and command timeout 3 seconds; whole control operation 5 seconds, closing its
connection on deadline. A timed-out add/upsert has unknown acknowledgment:
inspect/idempotently upsert the same identity rather than claim nothing was saved.
Worker clients: `maxRetriesPerRequest=null`, no timeout applied to blocking
consumption, capped jittered reconnect delays of 1–10 seconds. Install error
listeners before connecting. Reconnect may last for process lifetime; it is not
a business retry. Shutdown interrupts reconnect/blocking waits.

Local jobs may share Redis with rate limiting under a separate prefix. Explicitly
configure `maxmemory-policy=noeviction` and preserve dev AOF. Production requires
a separately provisioned jobs Redis endpoint/instance with no-eviction and
documented persistence/RPO to isolate queue pressure from auth rate protection.
A different Redis DB number alone is not capacity/security isolation. Production
provider selection, provisioning and auth Redis TLS hardening belong to the
deployment plan and do not block isolated implementation/testing.

## Queue and Scheduling Contract

- Queue `auth-session-maintenance-v1`; job name `auth-session-cleanup`; data is
  exactly `{ "type": "auth-session-cleanup", "version": 1 }`.
- Producer accepts only this <=256-byte payload. Consumer requires a non-null
  plain object, exact fields/values/types and matching name before DB access.
  No coercion; reject unknown fields, names/versions with sanitized
  `UnrecoverableError`. Control CLI accepts no arbitrary JSON/queue names.
- Scheduler ID `auth-session-cleanup-v1`, `every: 900000` (15 minutes). With
  scheduling enabled, upsert this identity and global concurrency before starting
  consumption. Repeated startup creates one schedule. Use Job Schedulers, not
  legacy repeatable jobs or `QueueScheduler`.
- Scheduler-generated IDs belong to BullMQ; do not supply a custom job ID in its
  template. Manual enqueue uses `auth-session-cleanup-manual-v1`, returning the
  existing retained job. An operator may remove that selected completed record
  before another manual run.
- Timing is approximate; delayed or immediate first execution is acceptable.
  No calendar/DST requirement or replay of every missed interval. Recovery makes
  a current bounded pass. Verify scheduler production does not accumulate an
  unlimited history of missed ticks when no worker is running.
- Only worker bootstrap/control CLI produces work; no HTTP enqueue or DB/enqueue
  dual write. Redis history/trigger loss cannot lose DB eligibility. Re-register
  the schedule after data loss and reconcile current rows. Do not promise that
  AOF never loses an acknowledged queue write.

## Failure, Retry, Timeout and Shutdown

| Boundary | Fixed v1 policy |
| --- | --- |
| Attempt | 30-second hard process watchdog; 20-second batch-admission budget; stop admitting a batch when fewer than 7 seconds remain in that budget. |
| Worker DB pool | Max 2 connections; acquisition/connection timeout 2 seconds. |
| Transaction | Prisma `maxWait=2000`, `timeout=5000`; worker-connection server `statement_timeout=2000`, `lock_timeout=500`, `idle_in_transaction_session_timeout=5000`. |
| Network query wait | pg `query_timeout=3000` on worker connections; verify propagation through PrismaPg. Client timeout is not proof of server cancellation. |
| Business retries | 3 total attempts; exponential base 5 seconds, jitter 0.5: approximately 2.5–5 seconds then 5–10 seconds. No nested application retry loop. |
| Lease/stall | `lockDuration=30000`, renewal 15000, `stalledInterval=30000`, `maxStalledCount=1`. Lease/stall controls do not replace job deadlines. |
| Bootstrap | Ready within 15 seconds, otherwise safe fatal event, partial-resource cleanup and nonzero exit; deployment owns bounded restart/backoff policy. |
| Shutdown | 30-second total deadline; force-disconnect unresolved clients at 20 seconds, finish by 30 with nonzero exit on incomplete drain. Compose stop grace 40 seconds. |

Await/settle DB work before reporting normal timeout failure. Never win a
`Promise.race` and mark failure while the handler continues writing. If a DB
operation cannot settle, the hard watchdog terminates the worker process without
fake acknowledgment; server timeouts/disconnect and stalled redelivery provide
recovery. Verify real adapter behavior, not an assumed Prisma AbortSignal.
Clear watchdogs/timers on completion. Earlier commits are not rolled back.

Retryable: transient DB connectivity, serialization/deadlock, lock/query timeout.
Terminal: contract/version/configuration, DB permissions/schema, excessive clock
skew, unclassified programmer errors. Classify known codes into safe reason codes;
do not blanket-retry exceptions. Redis loss during acknowledgment may cause
redelivery rather than a counted business failure. Stall recovery is separately
bounded; business attempts alone do not cap all executions.

SIGTERM/SIGINT is idempotent: mark not ready; stop bootstrap/control admission and
local consumption; let the active handler finish its current bounded batch and
return a partial result; close Worker, Queue, owned Redis clients, Prisma, then
Nest context. Do not disconnect DB through a Nest hook before worker drain.
Normal shutdown does not globally pause or remove the shared scheduler.

| Failure case | Outcome/recovery |
| --- | --- |
| Redis down at startup | Bounded startup failure; API gains no jobs dependency. |
| Redis loss after DB commit | Unknown acknowledgment; safe redelivery, committed deletion remains. |
| DB down/slow/locked | Bounded retry then failed record; restore dependency and use next pass or explicit retry. |
| Kill before/after commit | Uncommitted batch rolls back; committed cleanup remains; restarted worker recovers stall. |
| Duplicate/two workers/lost lease | Repeated DB predicate and no-op deletes preserve eligibility; no exactly-once counts. |
| More than 5,000 rows/time cap | Successful partial pass, visible backlog; no unbounded continuation enqueue. |
| Empty/no eligible rows | Successful zero count. |
| Revoked-unexpired/recently expired | Preserve rows. |
| Redis data loss | Report lost history, restart/upsert scheduler, sweep current DB. |
| Malformed/unsupported job | Terminal before DB access; inspect and explicitly dispose selected bad record. |
| Version mismatch on rollback | Pause, retain incompatible work, deploy compatible consumer or reviewed migration; no silent discard. |

## Observability and Operator Experience

Use Pino and allowlisted fields: event/component, queue/type/version, job ID,
attempt, mode, safe reason code, duration, batches, deleted/would-delete counts,
`capped`, queue counts and readiness. No user/session IDs, hashes, user agents,
payload dumps, connection URLs or raw provider/Prisma error objects. Sanitize
thrown errors too: BullMQ stores failedReason/stack in Redis, outside log redaction.

Retain completed jobs up to 24 hours/100 records, failed jobs up to 7 days/1,000
records using both age and count policies. Age cleanup is lazy, not a wall-clock
erasure guarantee. Results contain counts only. The failed set is sufficient;
no separate DLQ, dashboard, telemetry backend or permanent history table.

Provide `jobs:control`: default `inspect`, plus `enqueue`, `pause`, `resume`,
`disable-schedule`, `retry <id>`, `remove-completed <id>`, `remove-failed <id>`.
Mutations require `--apply`, exact state/ID checks and a reason for retry/removal.
Inspect paginates at most 20 records, prints safe fields, has a deadline and
reliable exit codes. Operator shell/deployment identity is the authorization
boundary, not workspace roles. No bulk wipe, arbitrary queues or payload editing.

Pause is global and does not undo active work. Before disabling the scheduler,
set registration false in every deploying replica; otherwise startup recreates
it. Removing the scheduler does not promise to delete all already-produced work.
Resume does not recreate a removed schedule. Prefer one fresh pass over replaying
many obsolete housekeeping ticks. Record actor/reason/selected scope/outcome for
manual mutation; keep reasons bounded and free of secrets.

Worker health: loopback-only port 4001 by default, `/health/live` and
`/health/ready`, no business routes/ingress. Live means responding; ready needs fresh DB/Redis probes,
successful initial schedule registration when enabled, no shutdown/permanent
runtime error or overload pause. Probe every 10 seconds with 3-second bound,
cache at most 15 seconds, fail readiness when stale. Health uses the spare bounded
DB connection, not an unbounded new pool. Container probes the actual worker
process, not a separate program whose PING only proves Redis is alive.

Emit a bounded snapshot each minute: queue state counts, oldest due age (exclude
future delayed jobs), last successful apply versus dry-run times, capped passes,
oldest eligible expiry using an indexed bounded query. Recover last-run evidence
from retained queue records on restart; report unknown if history was lost.
Dry-run must never be displayed as retention enforcement success.

Initial signals, to measure rather than claim as production SLOs: no successful
scheduled pass for 45 minutes, three capped passes, terminal failure, dependency
unready for 60 seconds or oldest due age over 45 minutes. Age alone warns and
allows automatic recovery. If due waiting/retrying work exceeds 10 jobs,
globally pause, mark not ready, log overload and require operator inspection/resume.
This contains unexpected admission; it is not a hard
Redis memory bound or a substitute for private access/ACLs.

Backend maintainer owns code/replay; deployment operator owns dependencies,
clocks, capacity and alert response. Production must name actual people and an
alert destination. Log events alone are not a production monitoring service.

## Security and Production Enablement

- Threat model: a forged queue payload must not control eligibility or SQL.
  A valid repeated trigger can consume bounded resources but cannot change the
  expiry rule. ACL/network admission protects against flooding; payload checks
  do not protect a compromised database credential.
- Production worker DB identity: connection/schema usage and only necessary
  SELECT/DELETE on `AuthSession`; no creation/update, DDL or user-table mutation.
  Table-wide DELETE remains broader than the application predicate; document
  that residual risk rather than claiming DB-enforced row eligibility.
- Redis ACLs must support the pinned BullMQ commands/scripts and namespace while
  denying unrelated keys/admin actions. Prove a real ACL fixture instead of
  publishing an untested guessed command list. Test TLS hostname/CA rejection.
- Before production apply: approve retention/no-hold disposition, inspect bounded
  target dry-run/count estimates/query plan, confirm clock health, DB/Redis
  credentials/TLS/ACL/persistence, private health exposure, capacity, alert owner
  and backup/recovery policy. Before mode change, disable schedule registration
  across replicas, remove the schedule, drain produced work and stop consumers;
  restart all consumers with the new mode and re-register. Do not drain a still
  producing schedule or mix dry-run/apply replicas.
- Rollback does not restore deleted sessions. Recover investigation data only
  into an isolated environment if approved; never automatically restore removed
  sessions into live authentication. No production deletion, deployment or
  credential provisioning is authorized by this implementation plan alone.

## PR Boundary Decision

**One vertical implementation PR**: auth-owned cleanup, queue delivery, isolated
worker, packaging, operations and real evidence. Splitting dependency/transport/
handler/tests PRs would create incomplete technical layers with no independently
proved outcome. No upstream attachment, notification or schema PR is required.

Production Redis provisioning/auth transport hardening and worker rollout already
belong to [Production Deployment Foundation](production-deployment-foundation.md).
That release consumes this tested artifact; this implementation does not wait
for the production provider. Keep the dependency one-way.

Split/re-plan only for a required auth behavior change, retention hold model,
schema migration, second domain/job, or distinct production infrastructure rollout.
Do not split just because the implementation touches several technical layers.

## Ordered Implementation and File Ownership

1. On approval, verify current session consumers/schema still match this contract;
   install the selected compatible dependencies in backend and `pnpm-lock.yaml`.
2. Implement/test auth cleanup, dry-run, DB-derived cutoff, guard and transactions
   with a worker-only Prisma client. Preserve `SessionService` rules and schema.
3. Add `src/jobs/` contract, connections, configuration, consumer, schedule/control,
   health and lifecycle providers; `src/worker.ts`, `src/jobs/control.ts`. No jobs
   import into API composition, no shared generic job framework.
4. Add backend `dev:worker`, `start:worker`, `jobs:control` scripts with existing
   dotenv conventions/explicit env files. Artifacts: `dist/worker.js` and
   `dist/jobs/control.js`; API stays `dist/main.js`. Tests spawn compiled workers
   with explicit test env, not watch mode.
5. Extend `scripts/dev.mjs` with opt-in `--with-worker`, owned child cleanup and
   signal forwarding; hybrid/direct can also run `dev:worker` separately. Starting
   API or importing test modules must not silently start cleanup.
6. Full Compose adds `worker` using the backend image, jobs-only env, explicit
   command, DB/Redis dependencies, loopback health and 40-second stop grace.
   Default dry-run. Preserve hybrid DB port 5433/container 5432; no worker MinIO
   dependency. Update exact service-list CI assertions/orchestration self-tests.
   Update Dockerfile/bake only for required artifact packaging; no embedded secrets.
7. Extend existing Jest integration/security/E2E projects for real DB/queue and
   process faults. Update test Compose/env validators/examples and service-shard
   setup with jobs URLs/unique prefixes. Fault harness owns child workers; no
   competing always-on worker in test Compose. Use a disposable AOF-enabled Redis
   fixture for restart durability, separate from ordinary ephemeral test Redis.
   Preserve shard coverage/result checks and fail-closed prerequisites.
8. Extend artifact/runtime/orchestration checks. Update deployment/security,
   environment examples, setup/Docker/validation docs and roadmap. Add
   `docs/workflows/background-jobs.md` for exact commands, operator recovery,
   configuration and rollout; no references to personal tooling.
9. Review actual diff and affected auth/security/runtime paths, fix findings and
   run final checks. Record candidate/review provenance, executed evidence and
   gaps; no merge-ready claim from build or empty PR comments alone.

## Validation Contract

This matrix is **required future evidence**, not tests executed during plan review.

| Guarantee | Scenarios and oracle |
| --- | --- |
| Input/config | Wrong name/version, null/array/coerced/unknown fields, oversized producer payload, missing/invalid URL/credentials/prefix/CA, plaintext production transport; no DB access for invalid jobs, no secret-bearing diagnostics. |
| Retention | Real PG before/at/after cutoff, active, revoked-unexpired, recently expired, multiple users, empty; only eligible rows removed, other tables intact. Dry-run does not mutate or duplicate keyset counts. |
| Capacity/performance | >5,000 eligible rows, equal expiry, mostly-active large fixture, row/time cap; <=500 selection/transaction and <=10 batches, visible remainder. Record expiry-index plan, timing/pool/lock impact and process bound; caps alone prove no throughput claim. |
| Auth regression | Existing refresh/replay/grace/concurrent refresh, logout/all, active-access and expired/missing-session suites. Race with cleanup/revocation and test-only expiry extension; active sessions remain valid, expired sessions remain rejected. |
| Idempotency | Same scheduled/manual identity, distinct jobs, two workers, overlapping DB selection, commit-before-ack crash. Final DB state converges; no exactly-once count assertion. |
| Retry/poison | Real lock/deadlock/transport failure; bounded attempts/delay ranges, retained terminal state, no retry for permission/schema/contract errors, sanitized Redis failedReason/stack. Label controlled fault injection vs real boundaries. |
| Deadline | Block SQL from another connection, delay/drop network replies; verify server/client limits through PrismaPg, no long-running abandoned query/unbounded pool wait. Watchdog actually exits and restarted process recovers. |
| Schedule/recovery | Repeated upsert creates one schedule; no missed-tick explosion; pause/resume/disable/re-registration; current-pass outage recovery; AOF restart separately from queue data loss/reconstruction. |
| Lifecycle | Actual child SIGTERM idle/active/backoff/disconnected, repeated signals, SIGKILL before/after commit, stall exhaustion; no new local admission, DB closes after drain, bounded exit/redelivery, live vs ready vs stale/paused health. |
| TLS/ACL/privacy | Local Redis TLS/ACL fixture: valid/wrong auth, invalid CA/hostname, namespace isolation/required scripts. Secret canaries absent in logs, queue records, artifacts; worker starts without JWT/OAuth/S3 secrets. Target provider remains separately unverified. |
| Operator behavior | Inspect read-only/paginated, explicit mutations, unknown ID/state errors, safe bounded reasons, no arbitrary payload/queue input, dry-run not confused with apply. |
| Packaging/topology | API/worker/control artifacts, built image startup/health/stop, direct/hybrid/full runtime smoke, exact service assertions/self-tests; API starts with no jobs config. |

Authoritative existing commands after implementation:

- `corepack pnpm validate:backend:quality`
- `corepack pnpm --filter @worksync/backend test:services` with isolated
  PostgreSQL/Redis/MinIO; CI shards must collectively execute jobs suites, no skip.
- `corepack pnpm validate:backend:artifact` after build and
  `corepack pnpm smoke:backend:runtime` for the API regression.
- `corepack pnpm docker:test:backend` and
  `corepack pnpm test:docker-orchestration` for disposable runtime orchestration.
- `docker compose -f docker/compose.yml config --quiet`
- `docker compose --env-file docker/.env.development.example -f docker/compose.yml -f docker/compose.app.yml config --quiet`
- Existing image-build CI targets and `corepack pnpm audit:production`.

Wire new worker/fault/TLS evidence into these suites or explicit CI-invoked scripts
in the same PR. Missing prerequisites fail closed. Reuse `_test` database guards,
unique test prefixes and owned child processes. Never FLUSHALL shared Redis or
run mutation/fault fixtures against development/production data. Config validation
is not runtime smoke; nonpersistent Redis is not restart-durability evidence.

Browser + Full CDP is not required: no browser behavior changes, and it cannot
prove queue leases, DB cancellation or process shutdown. Existing auth service
evidence protects the unchanged contract. Add targeted browser auth QA only if
implementation exposes a user-visible/cross-boundary gap; review scope then.
Production failover, actual capacity, alerts and backup restoration need target
evidence; local tests cannot certify them.

## Acceptance, Approval and Recovery

Implementation completion requires one real scheduled job, fixed retention,
strict payload/configuration, convergent DB effects, bounded work/retry/drain,
observable partial/terminal outcomes, usable controls and the real-boundary
matrix without auth/API regression. Green CI is not a zero-bug guarantee.

No architectural selection remains for this slice. The next approval covers
this concrete plan, including proposed 30-day retention and dependencies.
Exact package resolution/adapter capability tests remain execution verification;
if they disprove the specified contract, re-plan rather than weaken guarantees.
Production apply remains separately gated by policy/provider/credential/clock/
capacity/monitoring/recovery evidence. This does not block isolated implementation.

Rollback: globally pause; set registration false across replicas; remove the
schedule; drain/stop workers. Inspect/retain queued and failed work before version
changes. Existing API can run without jobs and schema stays unchanged. Prefer
compatible forward fix over silent discard; queue migrations/disposal need exact
scope/reason. Code rollback cannot undo committed deletion.

Revisit if retention holds, expiry mutability/session lifetime changes, sustained
capped passes/auth contention, a second job, provider incompatibility, repeated
permanent failures or transactional/external side effects become requirements.

## Engineering Improvement Review

- Current scope: dry-run and irreversible-apply boundary (auth/data); worker-only
  secrets/pool and health (runtime/security); partial-pass and safe failed-record
  evidence (jobs/observability). Each closes a concrete gap mapped to validation.
- Future: attachment automation after lifecycle review; email after delivery
  approval; production dashboard/alert tuning after selecting a target. No generic
  workflow engine, outbox, autoscaling or retention-hold platform without need.
- Scope effect: one vertical implementation slice; production rollout stays in
  its existing plan. Current work edits plans only.

## External Contract References

Checked for this review; confirm against the exact installed 5.x package because
unversioned docs evolve:

- [Job Schedulers](https://docs.bullmq.io/guide/job-schedulers/): stable upsert,
  generated IDs and scheduling cadence.
- [Connections](https://docs.bullmq.io/guide/connections): producer/worker
  differences, prefix and no-eviction.
- [Retry behavior](https://docs.bullmq.io/guide/retrying-failing-jobs): attempts,
  exponential jitter and stalled failures.
- [Timeout jobs](https://docs.bullmq.io/patterns/timeout-jobs) and
  [graceful shutdown](https://docs.bullmq.io/guide/workers/graceful-shutdown):
  application-owned cancellation/deadlines and close bounds.
- [PostgreSQL 16 timeouts](https://www.postgresql.org/docs/16/runtime-config-client.html)
  and [node-postgres configuration](https://node-postgres.com/apis/client):
  server/client query, lock, idle-transaction and connection limits.

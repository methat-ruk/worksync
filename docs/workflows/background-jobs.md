# Background Jobs Operations

The isolated worker runs `auth-session-cleanup`: it deletes only AuthSession
records expired for at least 30 days. Revocation alone does not make a row
eligible. PostgreSQL time supplies the cutoff; a DB/process skew over five
minutes fails the attempt. Public authentication behavior is unchanged.

## Run locally

Copy the jobs variables from `app/backend/.env.example` into your local backend
environment. Start PostgreSQL/Redis with `pnpm docker:infra:up`, then run:

```sh
corepack pnpm --filter @worksync/backend dev:worker
# Or start frontend, API and worker together:
corepack pnpm dev --with-worker
```

The worker is opt-in for direct/hybrid development; plain `pnpm dev` starts no
worker. Full Docker (`pnpm docker:full:up`) includes a worker from the backend
image, dry-run by default. Local database port is 5433; containers use 5432.
Worker health binds only to loopback (default 4001) and is not published by
Compose. Inside the worker container, `/health/live` checks process response and
`/health/ready` checks fresh DB/Redis status and queue pause state.

## Configuration

| Variable | Meaning |
| --- | --- |
| `NODE_ENV`, `LOG_LEVEL` | Worker environment and Pino level; production uses structured JSON. |
| `JOBS_DATABASE_URL` | Explicit PostgreSQL URL; no API URL fallback. Use a maintenance identity in production. |
| `JOBS_REDIS_URL` | Explicit Redis URL, database 0–15; production requires `rediss://` and ACL username/password. No URL query overrides. |
| `JOBS_REDIS_CA_FILE` | Optional readable CA certificate file; certificate and hostname verification remain mandatory. |
| `JOBS_QUEUE_PREFIX` | Environment-isolated prefix, 1–64 letters/digits/hyphen/underscore. |
| `JOBS_SESSION_CLEANUP_MODE` | `dry-run` (default) or `apply`; never supplied in job data. |
| `JOBS_SCHEDULER_ENABLED` | Required boolean; startup registration only. False does not delete a stored schedule. |
| `JOBS_HEALTH_PORT` | Loopback port, default 4001. Use distinct ports for local replicas. |

The worker does not require JWT, OAuth, or object-storage credentials. Do not
disable API security validation to accommodate it. Redis must use `noeviction`.
Production jobs Redis is separate from auth rate protection, with documented
persistence/RPO, TLS/ACL and capacity. A logical DB number is not isolation.

## Scheduling, limits and failure

Queue `auth-session-maintenance-v1`, scheduler `auth-session-cleanup-v1`, every
15 minutes. Registration is idempotent. Timing is approximate; no replay of all
missed intervals is required. Each attempt selects at most ten batches of 500
rows, with short Read Committed transactions and a repeated expiry predicate at
deletion. Dry-run uses keyset pagination and returns `wouldDelete` without writes.

`capped=true` means a bounded partial pass; later runs handle remaining rows.
Duplicates/commit-before-ack crashes are safe but counts are not exactly-once.
Three attempts use 5-second exponential backoff with jitter. Permanent failures
do not automatically retry within that job. Failed records are retained for
inspection; later scheduled jobs remain separate attempts at current maintenance.

The worker has two DB connections, two-second statement limits, a five-second
transaction limit, and a 30-second process watchdog. It never acknowledges a
timeout while an abandoned handler continues writing. SIGTERM stops local
admission, drains the current batch and closes queue connections before DB.
Incomplete shutdown forces disconnect at 20 seconds and exits by 30 seconds;
Compose grants 40 seconds. Forced death may cause stalled redelivery.

## Inspect and control

Build before running the local control script:

```sh
corepack pnpm --filter @worksync/backend build
corepack pnpm --filter @worksync/backend jobs:control inspect
corepack pnpm --filter @worksync/backend jobs:control inspect --page=1
corepack pnpm --filter @worksync/backend jobs:control enqueue --apply
corepack pnpm --filter @worksync/backend jobs:control pause --apply
corepack pnpm --filter @worksync/backend jobs:control resume --apply
corepack pnpm --filter @worksync/backend jobs:control disable-schedule --apply
```

The script above loads local `.env`. On deployment, inject the jobs environment
and run `node dist/jobs/control.js ...` directly from the backend artifact; do
not run a local-environment wrapper against production. `start:worker` loads
`.env.production`; containers run `node dist/worker.js` with injected env.

`retry <id>`, `remove-completed <id>` and `remove-failed <id>` require `--apply`
and one of these `--reason=` codes: `dependency-recovered`, `planned-maintenance`,
`invalid-job`, `investigation-complete`. They validate selected state/ID; retry
also revalidates the payload. No arbitrary queue, payload editing or bulk deletion
is offered. Mutation output/audit identifies the selected operation and actor.
A timeout can mean unknown acknowledgment: inspect before repeating a mutation.

Manual enqueue uses a stable ID while its record is retained. Remove that one
completed record to request another manual pass. Prefer a fresh bounded pass to
replaying many historical maintenance ticks. Pause is global but does not undo
active commits; normal process shutdown never globally pauses the queue.

Before disabling or changing mode, set registration false in **all** replicas,
remove the scheduler, drain produced work and stop consumers. Start all replicas
with the same new mode and re-register. Resume alone does not recreate a removed
schedule. Do not attempt to drain a schedule that keeps producing.

## Signals and recovery

Structured events distinguish started/completed passes, capped results, stalled/
failed jobs, connection problems and shutdown. A minute snapshot includes queue
counts, due age, oldest eligible expiry, last apply versus dry-run and capped
passes. Unknown history after Redis loss must not appear as success.

When scheduling is enabled, investigate 45 minutes without a scheduled pass;
also investigate terminal failures, three capped passes, dependency unready for
a minute, or due age over 45 minutes. Excess due
backlog (>10) pauses the queue for operator inspection/resume. Check DB/Redis
reachability, capacity, clock health and permission/schema errors first. A
permanent runtime error requires a corrected worker restart.

Completed records retain at most 100/24 hours, failed records 1,000/7 days.
BullMQ age cleanup is lazy. Logs and queue results omit session IDs, hashes,
user agents, payload dumps and connection secrets. Failed reasons/stacks are
sanitized before being stored, not only when printed. Operators must route alerts
to named responders; stdout is not a monitoring service.

Redis loss may lose triggers/history; PostgreSQL eligibility remains. Restart
with schedule registration enabled and run a current pass. Do not flush shared
Redis. Before worker-version rollback, pause and retain incompatible jobs for
reviewed migration/forward fix. Code rollback cannot restore deleted sessions.

## Production gate and evidence

Apply needs explicit retention/no-hold approval, target dry-run/query-plan and
capacity evidence, synchronized clocks, private endpoints, restricted DB
SELECT/DELETE identity, Redis TLS/ACL/persistence, alert owner and recovery plan.
Never automatically restore deleted sessions into live authentication; inspect
approved backup data only in an isolated recovery environment.

Automated evidence lives in the jobs unit/integration/process suites. Each DB
fixture applies real migrations to a generated schema in a `_test` database and
cleans only its own schema/queue prefix. `pnpm test:jobs:redis` requires host Docker
and OpenSSL and tests TLS, ACL and AOF restart in a disposable container; CI runs
it in the backend service lane. It is separate from ephemeral Docker test Redis.
Local evidence is not certification of production failover, capacity or backups.

Run suites through the package scripts (`pnpm test:services`, `pnpm test:e2e`),
not bare Jest: Prisma requires the runner's VM-modules flag. Process tests use
the compiled artifact; the scripts build it first. Test-owned child wrappers
inject a non-settling handler or kill after the real cleanup commit, without
adding production fault switches. Recovery tests intentionally wait for the
production 30-second lease/stall timing and can take several minutes.

The development worker uses the Nest compiler with `tsconfig.worker.json` and a
separate `dist-worker` output. This preserves normal Prisma compilation and keeps
the worker watcher from deleting or replacing the API watcher's `dist` output.

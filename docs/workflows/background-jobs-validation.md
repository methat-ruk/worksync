# Background jobs implementation evidence

Candidate: `feat/background-jobs-foundation` (PR
[#54](https://github.com/methat-ruk/worksync/pull/54)). Evidence date:
2026-09-08. This is a local implementation record, not PR approval, a
zero-defect claim, or production rollout approval.

## Executed successfully

| Command/check | Evidence |
| --- | --- |
| `corepack pnpm validate:backend:quality` | Prisma validation/generation, environment self-test, typecheck, lint, 33 unit suites / 173 tests, build and 321-file artifact validation |
| `corepack pnpm --filter @worksync/backend test:services` | 26 suites / 174 tests; existing auth, workspace, project, task, comment, notification and attachment regressions |
| `corepack pnpm --filter @worksync/backend test:integration --testPathPattern=jobs.integration` | 13 tests, including DB-clock inclusive boundary across users, expiry-update race, lock-timeout rollback/recovery, statement timeout, duplicate cleanup, caps, actual operator retry, a mostly-active expiry-index plan and pool cap evidence |
| `corepack pnpm --filter @worksync/backend test:e2e --testPathPattern=jobs-process` | 9 compiled-process tests passed in 417 seconds after the deadline correction: pre/post-commit SIGKILL, repeated stall exhaustion, watchdog, active-hang shutdown, disconnected bootstrap, scheduling, health and repeated signal drain. Recovery assertions may wait up to 100 seconds, and their test deadlines exceed that bound. |
| `corepack pnpm test:jobs:redis` | Disposable TLS/ACL Redis: auth/CA/hostname rejection, namespace/admin denial, AOF restart, real queue consumption, paused-Redis readiness loss/recovery, post-recovery worker consumption and graceful shutdown |
| `corepack pnpm audit:production` | 483/483 production package-versions covered; no moderate-or-higher or unknown-severity findings |
| `corepack pnpm test:docker-orchestration` | Orchestration self-test passed |
| `corepack pnpm docker:test:backend` | 59 suites / 339 tests, quality/build/artifact checks; disposable stack and volumes cleaned. Build snapshot predates the two additional DB race/lock tests, which passed in the host runs above |
| Compose `config --quiet` | Full local topology including worker validates |
| `docker build --target backend -t worksync-backend:local .` | Runtime image built; worker/control are included |
| Test-owned container from that image | Minimal jobs-only config, `_test` DB, dry-run, scheduler off, readiness and exit code 0 after stop; container and queue prefix removed |
| `pnpm dev --with-worker` with dry-run/scheduler off | API, frontend and worker started together; all health/HTTP checks passed. A source change reloaded the worker and SIGINT drained it. Worker watch uses separate `dist-worker` output |
| `git diff --check`; `node --check scripts/dev.mjs`; `node --check scripts/test-jobs-redis.cjs` | Passed |

## CI follow-up in the current candidate

The long `Backend service tests (1/2)` lane was traced to the nine real process
tests in `jobs-process.e2e.spec.ts`, which ran sequentially with the other
service suites. The pushed CI follow-up excludes that suite from the two
service shards and runs it in a separate required `Backend jobs process tests`
lane. That lane builds the worker once, runs five independent groups in parallel,
and merges their JSON evidence while requiring all nine named tests. The backend
aggregate now requires quality, both service shards, and the jobs lane; the shard
inventory checker explicitly accounts for the moved suite, and a separate JSON
validator rejects incomplete or unexpected jobs evidence.

The Container topology and images lane keeps all four Bake targets and imports a
scoped BuildKit GitHub Actions cache. The first hosted run with cache export
enabled took 5:04; cache export alone consumed up to 149 seconds for the
Playwright target and 143 seconds for the test-runner target. The workflow now
omits cache export for this validation lane, retaining cache import while
avoiding that measured critical-path cost.

The process tests use real compiled workers, Redis locks and PostgreSQL. Test-only
wrappers kill before or after the real handler's commit, or substitute a
never-settling handler. Together with the disposable TLS Redis fixture they prove
redelivery/convergence, stall exhaustion, 30-second watchdog termination,
readiness loss/recovery for dropped Redis replies, and bounded shutdown. They do
not simulate every possible network or kernel failure.

Earlier bare-Jest attempts failed during setup because they omitted the project's
Prisma VM-modules runtime flag (one sandboxed attempt also lacked service access).
They are not counted as successful behavior tests. The fixture now checks the
runner flag and cleans its generated schema on setup failure. Initial TLS/AOF
fixture failures were corrected and the fixture rerun successfully.

## Review fixes

- Development worker uses a separate Nest output directory, avoiding shared API
  `dist` deletion/rebuilds and Node's broad-watch file-descriptor exhaustion.
- Compose scheduler registration is configurable, allowing the documented
  disable-schedule procedure to survive restart.
- Fixture setup failures have an actionable runner prerequisite and scoped
  schema cleanup.
- The TLS/ACL Redis recovery fixture now proves a recovered worker consumes a
  newly queued job and exits cleanly; recovery is not inferred from readiness
  alone.
- Process-E2E deadlines now exceed their 100-second recovery assertions, so
  Jest cannot terminate a valid recovery test before its own oracle finishes.

Review covered the changed queue/handler/control/configuration/lifecycle paths
and relevant API/auth consumers. This is local self-review, not an independent
PR review or an audit of every untouched file.

## Remaining evidence / release boundary

No further local blocker is known in the implemented scope. Evidence remains
bounded: caps and tests are not a throughput guarantee, and no test simulates
every possible OS, provider, kernel or production-capacity failure.

Browser/CDP was not run: no browser UI or public API contract was changed.
Hosted CI for `fb7d063` passed all required checks, including the process suite,
Redis fixture and dependency audit. The cache-export timing observation and the
follow-up import-only workflow change remain CI-specific evidence.

Production retention/no-hold approval, target TLS/ACL/DB grants, dry-run capacity,
alert routing, failover/backups and rollout remain separate mandatory release
gates. No production mutation or deployment was performed.

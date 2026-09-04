# Feature Plan: CI Critical Path Optimization

Status: Implemented and locally reviewed/validated - hosted CI pending

Intended PR / branch: `perf/ci-critical-path`

Milestone: Cross-cutting delivery improvement

Impact: Material validation-pipeline change; no application contract change

Analysis date: 2026-09-04

Plan review date: 2026-09-04

Baseline: `19c2b091cf5b00efd877b0397b1480dda0cee0fe`, after PR #50 merged

## Goal

Reduce CI wall-clock and developer waiting time without removing tests,
weakening assertions, reducing browser coverage, bypassing security gates, or
losing useful diagnostic evidence. Optimize the critical path rather than the
sum of job durations. Keep additional runner consumption proportionate.

Implementation and subsequent stage/commit/push/Draft PR delivery were approved
on 2026-09-04. This document records the design, bounded experiments, and
evidence. Controlled benchmark dispatches, repository settings changes, and
deployment are not included in that approval.

## Existing Foundation and Measured Baseline

The baseline workflow runs independent jobs with no `needs` chain. Pull requests
and pushes to `main` trigger validation; ref-scoped concurrency cancels obsolete
runs. Review evidence is intentionally PR-only.

| Job / workflow | PR run 33830294311 | PR run 33831088353 | Main run 33831641169 |
|---|---:|---:|---:|
| Backend validation | 2:20 | 2:19 | 2:43 |
| Frontend validation | 1:45 | 1:52 | 1:52 |
| Frontend E2E | 3:20 | 4:23 | 4:27 |
| Container topology and images | 3:19 | 3:02 | 3:19 |
| Dependency audit | 0:36 | 0:37 | 0:37 |
| Workflow, including start delay and finalization | 3:23 | 4:33 | 4:31 |

Evidence:

- [Earlier successful PR run](https://github.com/methat-ruk/worksync/actions/runs/33830294311), head `caeb7dc`
- [Latest successful PR run](https://github.com/methat-ruk/worksync/actions/runs/33831088353), head `5b2c8fa`
- [Successful merged-main run](https://github.com/methat-ruk/worksync/actions/runs/33831641169), head `19c2b09`

These are observed samples, not a controlled before/after benchmark or p95.
Dependency graphs, cache availability, and runner scheduling differ. Historical
advisory-source outages and rerun-inclusive durations are not healthy baselines.

### Critical path: frontend E2E

Main job timing:

```text
setup/container/install 68s
-> compatibility 58s
-> mocked journeys 57s
-> migration 3s
-> live auth 38s
-> post-steps/cleanup 43s
= 267s job execution, excluding initial scheduling delay
```

- Compatibility includes a production build and 9 browser cases; browser tests
  themselves take about 20 seconds across three workers.
- Mocked Chromium runs 25 cases in three files; test execution takes about
  46 seconds using one worker.
- Live Chromium runs 3 cases in about 20 seconds; its command also generates
  Prisma, builds the backend, and starts servers.
- E2E has no Next.js build-cache restore. Compatibility uses `next start`;
  mocked/live runners use `next dev`, fixed ports, and the same `.next` tree.
- On the latest PR and main runs, pnpm cache misses were followed by gzip
  archives of approximately 280 MB. Post-cache work took 39-43 seconds, versus
  approximately 15 seconds for dependency installation.

### Next bottleneck: container images

Main builds run serially: backend 58s, frontend 53s, test-runner 1s, test-e2e
55s. All share the ephemeral builder and common Dockerfile stages, but there is
no cross-run `cache-from` / `cache-to`. E2E-only improvements leave a roughly
3:20 workflow floor until container work also improves.

Backend Jest took approximately 53 seconds for 56 suites / 307 tests on the
latest PR run. Service startup, install, and other validation account for much
of the remaining backend duration; splitting every Jest project is not the
first intervention.

## Acceptance Criteria

- Preserve all current validation commands or demonstrate equivalent execution
  of their complete constituent checks, including hooks/self-tests where CI
  currently invokes them, Prisma, lint, typecheck, builds, and artifact shape.
- Preserve backend unit/integration/contract/security/E2E projects, frontend
  unit/component and shared-policy tests, all 37 current Playwright cases, all
  three compatibility browsers, and all four Docker targets.
- Preserve assertions, retry policies, test isolation, real-service evidence,
  fail-closed audit policy, and mandatory setup/cleanup. No added skips,
  exclusions, path filters, or `continue-on-error` on required validation.
- Prove full test inventory by suite/case identity and outcomes, not counts
  alone. Counts are supporting evidence; no coverage percentage improvement is
  claimed because these timing samples do not establish one.
- Publish per-suite results and retain current audit/build diagnostics. A
  missing, cancelled, or skipped required result cannot become aggregate success.
- Measure total workflow duration including queue, setup, cache, reports, and
  post-steps; report time to the first actionable validation failure,
  runner-seconds, retries, and uncertainty alongside speed. Faster first
  feedback and faster all-gates completion are separate outcomes.
- Target approximately 2:40-3:10 on comparable healthy runs after both phases.
  This is an estimate to validate, not a promise or a timeout setting.
- If measurements show no benefit or correctness regresses, revise or revert
  the affected optimization rather than declaring success from theoretical speed.

## Required Decisions Before Implementation

### Selected structure

```text
PR / push main
├─ PR review evidence (PR only)
├─ Backend validation
├─ Frontend validation
├─ E2E compatibility: production build + three-browser suite
├─ E2E journeys: mocked -> migration -> live auth
├─ Container topology + concurrent Bake targets
└─ Dependency audit

E2E compatibility + E2E journeys -> lightweight Frontend E2E result check
```

Use two separately named E2E jobs, not a browser-by-shard Cartesian matrix.
Compatibility needs the existing version-aligned Playwright environment but no
PostgreSQL service. Journeys keeps PostgreSQL and its guarded test database.
Do not run production and dev servers concurrently in the same workspace.

Retain `Frontend E2E` as a lightweight aggregate result name. It must inspect
both upstream results even after failure and accept only two successes, without
dependency installation. It adds no dependency to unrelated jobs. Preserve other
check names. If implementation uses a matrix, set `fail-fast: false`.

Keep job ID `frontend-e2e` for the aggregate and introduce
`frontend-e2e-compatibility` and `frontend-e2e-journeys` for the two lanes. The
aggregate uses a job-level `always()` condition and explicit result comparisons;
the default success-only dependency condition is insufficient. Success requires
exactly `success` from both lane results; missing, unknown, failed, skipped, or
cancelled values fail closed. Cancelling the whole workflow may prevent the
aggregate from executing; that remains incomplete evidence, never a synthetic
pass. Keep lane timeouts at the existing 20 minutes initially, Docker at 30
minutes, and give the no-install aggregate a two-minute bound. Do not shorten
test deadlines to achieve the performance target.

The compatibility lane retains `test:e2e:compatibility`, including its
production-build pre-script. Journeys retains `test:e2e`, then the guarded
migration command, then `test:e2e:live`; the mocked pre-script builds the shared
auth-policy package before the live backend consumes it. Do not replace these
entry points with raw test-runner calls that omit preparation. Keep the existing
test-only database URL and explicit backend environment defaults in the live
runner. No AWS credentials, MinIO service, or new Redis service is needed merely
to split these existing browser suites.

Keep ref-scoped cancellation for this validation-only workflow. Do not cancel a
different PR or treat obsolete/cancelled runs as current evidence. If a suite
fails before a later suite executes, report the latter as not run; a fix needs
the complete affected sequence on the current candidate.

### Cache experiments and decision rules

1. **pnpm:** keep frozen-lockfile installation. Test availability of `zstd`
   before cache restoration in the existing container, with bounded setup.
   Measure added setup, restore, save, and total job duration. Compare with
   uncached E2E installation if caching remains more expensive. Do not transfer
   `node_modules` between runners or add a central install job.
   Preserve `npm_config_audit: false` on the existing pnpm bootstrap only;
   this does not disable the separate required dependency audit. Do not change
   the process home directory to force cache sharing. If bounded compression
   setup fails or loses overall, disable only E2E dependency caching and retain
   a full frozen install rather than accepting the slow gzip path by default.
2. **Cache identity:** explicitly account for OS/architecture, store path,
   package-manager/toolchain version, lockfile, and compression. Host/container
   keys alone do not prove reusable cache versions. Use cache misses as normal
   rebuild paths; never skip tests or installation because a cache exists.
3. **Next.js:** restore only incremental `.next/cache` for compatibility, with
   a separate production-mode namespace and dependency/config/source identity.
   Do not mix dev/prod output trees or treat a cache as an authoritative build.
   Include shared `packages/auth-policy` inputs, root TypeScript/workspace
   configuration, frontend build configuration, and public build arguments in
   identity. Keep restore prefixes within the same toolchain/config namespace;
   always rebuild from the current checkout after a restore.
4. **Docker:** first run all four targets through Bake on one shared builder.
   Then compare bounded cross-run cache import/export, using target scopes that
   cannot overwrite each other. Test cold, warm, source-only, and lockfile-change
   behavior. Choose retained layers and cache mode by net saved time and storage
   cost; do not automatically export every browser layer with `mode=max`.
   Start without remote export. Add `type=gha` only if a measured trial wins;
   missing or unavailable optimization caches must rebuild or fall back without
   masking build failures. A bounded cache-export-only failure may be nonfatal,
   but no surrounding build/test step may use `continue-on-error`.
5. **Playwright:** retain the version-aligned preinstalled image; do not add a
   second browser-binary cache or replace it with an unmeasured custom image.

Moving browser installation ahead of the source-copy layer is a conditional
follow-up within the Docker phase only if measurements justify it. Preserve
browser versions, dependency inputs, target inheritance, and runtime behavior;
validate every target and test-image launch if this Dockerfile change is chosen.

### Reports and debugging

Keep console output and use list plus JUnit reporters in CI only. Write reports
under separate suite directories in `app/frontend/test-results/`, which the
existing Docker ignore rules already exclude. Name uploaded artifacts
`e2e-compatibility-results`, `e2e-mocked-results`, and `e2e-live-results`, with
separate mocked/live output paths to prevent overwrite.
Upload diagnostics after failures with seven-day retention, preserving existing
audit report retention and Docker build records. Required report absence must
not hide a test failure or be described as successful evidence.

Prefer environment-driven CI reporter/output settings in the three Playwright
configs. The current live runner does not forward arbitrary CLI arguments, so
do not assume adding a reporter flag to its package command will work. Preserve
local list output and current trace/video/screenshot settings. Track whether a
suite started: absent reports for an unstarted suite are reported as not run;
a started suite with no required report must not yield successful lane evidence.
Upload present artifacts with an explicit failure-compatible condition; do not
force a cancelled obsolete run to finish just to publish reports. Reports can
include test errors and output even with tracing off, so inspect generated
failure reports for token, cookie, provider, and test-data leakage.

Do not enable raw auth traces, video, environment dumps, or sensitive screenshots
as a side effect of optimization. Keep current capture settings unless a scoped
redaction/privacy review approves a change. A merged HTML report is optional,
not a new dependency for all CI; if later sharding requires it, retain original
per-shard evidence and account for merge-job overhead.

### Repository enforcement boundary

During analysis, the classic main-branch protection API returned "Branch not
protected" and applicable branch rules returned an empty list. Recheck before
implementation; this is a dated observation, not a permanent repository fact.
Passing workflow checks are not proof that repository settings enforce them.
Changing protection, rulesets, permissions, or bypass authority needs separate
approval and is outside this performance PR.

## Scope and Affected Surfaces

- `.github/workflows/ci.yml`: E2E split, aggregate status, cache and build steps
- `docker-bake.hcl`: explicit CI group with backend, frontend, test-runner, and
  test-e2e targets; all preserve the current tags, build arguments, and
  `type=cacheonly` output; use the official Bake action after version/trust review
- `Dockerfile`: conditional layer rearrangement after measurement
- `app/frontend/playwright*.config.ts` or CI CLI options for isolated reports
- E2E runner scripts only if needed for standalone setup/report arguments;
  preserve local entry points, environment guards, cleanup, and exit codes
- package scripts only when needed to expose equivalent named validation steps
- a small dependency-free aggregate-result checker and fixture self-test if
  necessary to test the exact logic invoked by CI; no generic CI framework
- testing/delivery documentation and this plan's final measured results

## Out of Scope and Alternatives Not Selected

- Application/API/auth/upload policy, schema, production infrastructure, AWS
  access, deployment, secrets, and repository permission changes
- Removing checks, reducing browsers/assertions, replacing real services with
  mocks, changing audit severity or advisory exclusions, or caching scan results
- Backend five-project matrix: approximately 53 seconds of tests does not yet
  justify repeated PostgreSQL/Redis/MinIO setup and new isolation boundaries
- Separate frontend lint/typecheck/test/build jobs: currently under two minutes
  and not the critical path; duplicate setup is not yet justified
- Four mocked-E2E shards: only three files and approximately 46 seconds of tests;
  `fullyParallel: false` means file-level distribution can also be uneven
- Separate compatibility browser or live-auth jobs: existing three-worker
  compatibility and short live tests do not yet justify additional setup
- Four independent Docker runners: lose shared dependency setup; reconsider
  only if measured CPU/RAM contention makes the shared builder slower
- Shared build-artifact producer jobs, larger/self-hosted runners, package
  upgrades, service-startup redesign, or a third E2E lane without new evidence

## Security and Data Boundary

Continue least-privilege PR execution without production secrets. Keep cache
trust scopes separate from authoritative artifacts; do not import untrusted PR
outputs into protected release contexts. Audit the current dependency graph on
each applicable run with the existing fail-closed policy and report.

Keep isolated test databases and service lifecycles. Do not parallelize suites
against shared mutable DB, Redis, object-store state, ports, or build outputs
without proof of isolation. Preserve auth rate-limit and attachment recovery
tests; speed is not permission to alter admission or failure semantics.

## Ordered Implementation Plan

1. After implementation approval, refresh source/check identity and capture
   suite inventory, cache state, timing, and effective runner resources.
2. Split E2E into compatibility and journeys, preserve standalone preparation,
   add isolated reports and fail-closed aggregate status. Keep existing worker
   counts, retries, dev/production modes, migrations, and cleanup behavior.
3. Measure pnpm and Next.js cache options independently; retain only improvements
   whose total costs are lower. Validate cache misses and input invalidation.
4. Run the full affected E2E sequence and review its failure/reporting behavior.
   Record intermediate timing: Docker is still expected to bound the workflow.
5. Convert serial Docker targets to a shared Bake invocation, preserving all
   topology/self-tests, build arguments, `type=cacheonly` outputs, target
   validation, and build records. Measure memory/CPU contention and net duration.
6. Evaluate cross-run Docker cache and, only if useful, browser-layer placement.
   Keep these changes separable so a losing experiment can be reverted alone.
7. Review the complete diff, fix findings, rerun affected checks, and obtain
   current complete CI evidence. Update measured results and limitations.

One intended PR contains independently reviewable E2E/cache and Docker commits.
Stop for a revised plan if either phase needs broader architecture or authority.

## Validation Contract

| Guarantee | Required evidence |
|---|---|
| Test equivalence | Before/after suite and case identities, assertions/config diff, complete outcomes, no added skips or reduced browsers |
| Independent E2E execution | Each lane starts from a clean checkout with its own required build/env/services; production compatibility and live auth still pass |
| Fail-closed result | Test the exact aggregate predicate across success/failure/skipped/cancelled/missing/unknown values, plus a hosted upstream-failure scenario when authorized; syntax checks or predicate tests alone do not prove hosted `needs` scheduling |
| Reporting | Forced test failure preserves logs and uniquely named reports; no overwrite, swallowed exit status, or sensitive captures |
| Cache correctness | Cold/warm and source/config/lockfile invalidation runs; complete required checks still execute; cache unavailable does not supply stale success |
| Docker parity | All Compose/config/orchestration checks and all four targets pass; inspect generated backend artifact and frontend standalone output; runtime smoke if layers change |
| Security parity | Existing audit self-tests, fresh dependency scan/report, unchanged policy and permissions; review new action/tool dependency if introduced |
| Performance | Workflow/job/step critical paths including queue and post-work, runner consumption, retry/flake observations, and remaining bottleneck |

Implementation verification entry points, after provisioning only the disposable
local/test prerequisites:

- `pnpm validate:backend` and `pnpm validate:frontend`
- `pnpm test:e2e:frontend:compatibility`, followed separately by
  `pnpm test:e2e:frontend`, `pnpm prisma:migrate:deploy:test`, and
  `pnpm --filter @worksync/frontend test:e2e:live` for journey parity
- `node scripts/docker-test-self-test.cjs`, the existing quiet Compose checks
  from CI, and the new `docker buildx bake --print ci` target/argument inspection
- all four image builds through the declared `ci` Bake group; local smoke with
  disposable test resources if Dockerfile layers change
- `pnpm setup:audit`, `pnpm test:audit-production`, and `pnpm audit:production`
- `node scripts/pr-review-evidence-self-test.cjs`, aggregate predicate fixtures,
  YAML/condition review, and fresh hosted CI on the final candidate

Validate each lane from its own clean environment, not only by running these
commands sequentially in an already-prepared checkout. Preserve the `_test`
database guard; do not execute migration validation against development or
production databases. Inspect candidate containers when artifact shape cannot
be established from cache-only build output; do not add daemon image export to
every timed CI run merely for convenience.

Use existing successful logs as the historical baseline and normal authorized PR
runs for initial after measurements. For a stronger speed claim, obtain approval
for controlled comparable runs of both workflow versions on the same application
and lockfile inputs, targeting at least five observations per compared cache
cohort. Record runner image/resources, event type, cache state, attempt, source
identity, job start offsets, report overhead, and cancelled/failed runs separately.
Do not claim p95/p99 from this small sample or hide flakiness inside averages.

Expected ranges, not verified outcomes:

| Stage | Estimated workflow duration |
|---|---:|
| E2E split/cache only; Docker unchanged | 3:10-3:30 |
| E2E plus beneficial Docker parallel/cache changes | 2:40-3:10 |
| Cold cache, changed lockfile, or extra queueing | 3:00-3:40 or longer |

The combined target is approximately 30-40% below the latest 4:31 main run,
but less improvement relative to the 3:23 earlier run. Backend's current
2:19-2:43 execution becomes a likely floor. Additional runners trade aggregate
compute for latency; report that cost instead of promising free speedup.

## Post-Implementation Review Gate

Inspect actual `needs`/conditions, failed/skipped result propagation, current
candidate identity, service/build-state isolation, complete commands, report
retention, cache trust/invalidation, tool version alignment, and all Docker
targets. Review each intended parallel edge for shared-state side effects and
resource contention. A green job count is not proof of equivalent guarantees.

Fix in-scope findings and rerun affected checks before claiming completion.
Local syntax/config checks do not prove hosted scheduling, cache behavior, or
wall-clock improvement; unavailable hosted evidence remains explicitly unverified.

## Rollback and Forward Fix

- Revert the affected E2E/cache or Docker commit without reverting application
  code, tests, lockfile remediation, or security policy.
- Preserve check-name continuity and aggregate semantics during rollback.
- Restore a known-good cache namespace or bypass an ineffective cache; do not
  delete broad repository caches or infrastructure as routine recovery.
- No database migration or production mutation is part of this plan.

## Dependencies and Re-plan Conditions

- PR #50 is merged; no attachment-UI implementation is required for this plan.
- Refresh the baseline if tests, scripts, dependency graph, workflow, or runner
  image changes materially before implementation.
- Re-plan for shared-state collisions, increased flakiness, report leakage,
  security/permission changes, substantial runner cost, inadequate runner
  concurrency, or a performance gain requiring dropped validation.
- Reconsider sharding only when measured suite growth makes tests, rather than
  setup/cache, the critical path and isolated balanced partitions are proven.

## Engineering Improvement Review

- **Current scope:** explicit test-equivalence evidence, fail-closed aggregation,
  per-suite reports, cache net-cost measurement, and shared-state review are
  coupled to a safe pipeline optimization.
- **Future enhancements:** additional sharding, shared build artifacts, alternate
  runners, and repository gate enforcement have separate evidence/approval
  triggers; they are not silently included.
- **Scope effect:** implementation approved on 2026-09-04; no change to application,
  release criteria, validation policy, or production access.

## Plan Review Outcome - 2026-09-04

At plan review, ready for implementation approval (subsequently approved). No remaining design blocker was identified
in this scoped plan review; benchmark outcomes remain unverified.

Review corrections incorporated:

- Explicit fail-closed aggregate scheduling, result states, and cancellation
  semantics replace an ambiguous instruction to simply wait for both jobs.
- Lane preparation retains package pre-scripts and live environment defaults;
  the split does not depend on a previous lane's build output.
- CI reporter configuration accounts for the live runner's missing CLI argument
  forwarding, output overwrite risks, and failure-report privacy.
- Cache choices include measured fallback and shared build-input identity;
  cache export failures cannot mask compilation or validation failures.
- Local predicate/config evidence is separated from hosted scheduling and
  timing proof. Controlled hosted failure runs and repeated benchmarks require
  authorization before execution; their absence cannot be called a pass.

The first approved implementation slice is E2E split, result aggregation, and
reports, followed by cache experiments and then Docker parallelization. There
is no pending product-policy or provider selection. Tool/action version review
and measured cache retention are bounded implementation decisions; stop and
re-plan if they require new permissions, paid infrastructure, or weaker gates.

## Follow-up and Technical References

### Implementation evidence - 2026-09-04

Local validation candidate: the working tree on `perf/ci-critical-path`, based on
`19c2b091cf5b00efd877b0397b1480dda0cee0fe`. This is local implementation evidence,
not a hosted-CI pass or merge-readiness declaration.

Implemented:

- Two independent E2E lanes, the original-name fail-closed aggregate, and
  suite-specific CI JUnit artifacts with seven-day retention.
- Frozen installs without pnpm caching in E2E only. The selected official image
  has no `zstd`. A disposable Linux ARM64 experiment installed it in 14.628s;
  that adds nontrivial per-lane setup before any restore/save benefit. This is
  not a full compression benchmark. The uncached fallback is selected from the
  historical 39-43s gzip save versus 15s install evidence; a hosted comparison
  must confirm its net benefit.
- Stronger input identity for the existing frontend-validation Next.js cache.
  A new E2E Next.js cache is deferred: it would add another gzip archive path
  before net benefit has been demonstrated. No whole-build artifacts are shared.
- Four concurrent Docker Bake targets on one builder, with the official v7
  action pinned to `d3418bd7d0e9324001bca92fa8ba175ea7e6dc9b`, preserving cache-only
  outputs, arguments, and default build diagnostics. Remote Docker cache and
  browser-layer rearrangement are deferred; the Dockerfile is unchanged.
- Delivery/testing documentation now describes the actual parallel graph.

Local results:

| Evidence | Result |
|---|---|
| Backend validation | Passed: 56 suites / 307 tests, including real PostgreSQL/Redis/MinIO boundaries; typecheck, lint, Prisma and build/artifact checks passed |
| Frontend validation | Passed: 30 files / 209 tests, 5 shared-policy tests and 7 Node self-tests; typecheck, lint and production build passed |
| Playwright | Compatibility 9/9 across three browsers, mocked 25/25, live 3/3; all final JUnit reports have zero failures/errors/skips |
| Result/report helper tests | 4/4 passed; all 49 result-state pairs, malformed arity and CLI exit behavior checked |
| Forced report failure | Disposable assertion-failure fixture exited 1, retained console error and JUnit failure; production suites were not edited |
| Docker | Actionlint 1.7.12, quiet Compose configs/service inventory, orchestration self-test and all four Bake builds passed |
| Clean local lanes / image artifacts | Separate Linux ARM64 test containers passed compatibility 9/9 and journeys 25/25 + migrations + live 3/3; compatibility had no database or prebuilt Next output. Journeys used a fresh disposable PostgreSQL database, not a compatibility build. Exported backend compiled entry/module and frontend standalone server/static artifacts were present |
| Security | Audit self-tests 8/8 passed, including real clean/vulnerable scanner fixtures; fresh lockfile audit covered all 464 production package-version identities with no blocking findings |
| PR evidence checker / diff | Self-test and whitespace check passed; test files, lockfile, application implementation and Dockerfile unchanged |

An initial local compatibility attempt failed because Firefox/WebKit binaries
were absent. After installation, all nine cases passed without changing tests.
That earlier JUnit report encoded six launch failures as `errors`, demonstrating
why `failures="0"` alone is not proof of success. The separate intentional
assertion failure encoded one `failure`; both forms retain nonzero exit status.

The clean-container checks used the repository's test image and Node 22, not a
GitHub-hosted runner or the Ubuntu Playwright job image; they prove local lane
preparation/isolation, not exact hosted-environment equivalence. Temporary test
containers and their disposable database were removed after verification;
existing developer services were left running. Validation-only images remain
locally under `worksync-ci-{backend,frontend,e2e}:validation`.

Review corrections: report uploads explicitly require a started step's success
or failure outcome; cancelled runs are not forced to upload. The aggregate
checks both explicit array positions, rejecting sparse/missing results. An
unused existing MinIO loop variable was replaced without changing retries.
Review included tracked and untracked files, unchanged suite selectors/assertions,
service and build-state ownership, cache identity, action inputs, artifact paths,
and failure propagation. No remaining local blocking finding was identified.

Still required before a performance/merge verdict:

- Fresh hosted CI on the final pushed candidate: actual independent-lane setup,
  artifact publication, Bake action integration, and aggregate scheduling.
- Authorized hosted upstream-failure/cancellation exercise; local predicate
  fixtures do not prove GitHub's scheduler behavior.
- Comparable timing, cold/warm cache and changed-input observations, queue and
  post-step costs, runner-seconds and flake/retry evidence. No after-duration or
  percentage reduction is verified yet; 2:40-3:10 remains a target only.

Repository branch-rule inspection was refreshed during implementation and still
returned no effective main-branch rules. No settings were changed. At local
implementation closeout, no commit, push, hosted benchmark dispatch, or
deployment had been performed. Subsequent delivery approval covers commits,
push and a Draft PR; hosted validation results must be recorded separately.

### References and next decisions

- Record observed before/after results and the next bottleneck before deciding
  whether another optimization is justified.
- Address repository enforcement separately with the repository owner's approval.
- [Docker Bake](https://docs.docker.com/build/bake/): concurrent targets
- [Docker GHA cache](https://docs.docker.com/build/cache/backends/gha/): scopes, export modes, and cache limits
- [Actions cache](https://github.com/actions/cache#cache-version): path/compression identity
- [Playwright sharding](https://playwright.dev/docs/test-sharding): file-level distribution and report merging
- [Playwright CI](https://playwright.dev/docs/ci#caching-browsers): browser-cache trade-offs
- [Playwright reporters](https://playwright.dev/docs/test-reporters#junit-reporter): CI-only multiple reporters and JUnit output
- [Docker Bake action](https://github.com/docker/bake-action): explicit build files, targets, and build records
- [GitHub job dependencies](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds): failure propagation and explicit conditions

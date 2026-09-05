# Feature Plan: CI Below Two Minutes

Status: Phase B mocked/live split implemented locally - hosted measurement not authorized

Intended branch / PR: `perf/ci-sub-2m`, a separate follow-up to PR #51

Impact: Material validation-pipeline change; no application contract change

Analysis and plan review date: 2026-09-04

Verified starting revision: `5200888eb9a1dcdb18020b8da2cda5a9daa224b3`
(PR #51 merge into `main`). Local `perf/ci-sub-2m` starts at this revision;
only this plan and its index entry are pending changes at this review.

## Goal and Delivery Order

Target less than 120 seconds from workflow creation to completion of all
applicable checks, including queueing, setup, reports, aggregate jobs, cache
post-work and cleanup. A job running for 119 seconds does not by itself meet
this workflow target. Preserve coverage, correctness, security and diagnostics.

1. [PR #51](https://github.com/methat-ruk/worksync/pull/51) merged on 2026-09-04
   at 08:53:25 UTC. Hosted failure/cancellation, reports, cache invalidation,
   repeated timing and Docker resource evidence were completed, not waived.
   Its final documentation head `06c112a` passed all eight PR checks in 2:45.
2. Use the recorded merge revision as the frozen follow-up baseline. The branch
   has already been created correctly; do not recreate it or repeat predecessor
   work. If application, dependency or test inputs change, record the new identity
   and compare both workflows on those same inputs before claiming improvement.
3. Implement only after approval of this plan. Planning does not authorize a
   merge, push, benchmark dispatch, repository-rule change or paid runner.
   Hosted approval must identify the bounded experiment batch described below;
   approval of the earlier PR's experiments does not carry over to this PR.

The goal is a measured healthy-run target, not a guarantee against runner queues,
registry outages, cold installations or retries. Keep cold/degraded results
visible; do not relabel slow runs to make the target appear satisfied.

## Verified Baseline

[Post-merge main run 33855624835](https://github.com/methat-ruk/worksync/actions/runs/33855624835)
passed in **3:11** (08:53:28-08:56:39 UTC) on the recorded merge SHA. All seven
applicable validation jobs passed; the PR-only advisory was correctly skipped
for a main push. The earlier final PR run's 2:45 and this main run's 3:11 are
individual observations, not a controlled comparison or a new percentile.

The strongest repeated baseline is the five candidate warm rounds from the
[PR #51 hosted evidence](../evidence/ci-critical-path-validation.md): same
implementation as the merged workflow, workflow median **3:06**, range
**2:56-3:10**, median **722 runner-seconds**. Those temporary push workflows
omitted the PR-only advisory; record event parity in new comparisons. Their
old serial-workflow side is historical evidence, not this PR's baseline.

| Job | Five-round median (range), seconds | Post-merge main, seconds |
|---|---:|---:|
| E2E journeys | 173 (164-179) | 179 |
| Backend validation | 153 (150-160) | 161 |
| Container topology and images | 123 (118-133) | 142 |
| Frontend validation | 104 (90-113) | 107 |
| E2E compatibility | 113 (109-125) | 114 |
| Dependency audit | 39 (30-47) | 38 |
| E2E aggregate | 6 (4-7) | 6 |

Critical path remains journeys -> aggregate. On main, aggregate dispatch added
three seconds after journeys; initial jobs started two to three seconds after
workflow creation. These start offsets include dispatch, not pure queue time.
Compatibility -> aggregate may become critical after journey optimization: its
125s observed warm maximum already exceeds the complete-workflow target.

Warm journeys used 42-59s for container initialization, 14-16s for frozen install,
44-60s for the mocked command, 2-4s for migrations and 30-39s for live tests.
The original diagnostic run broke out about 35s of Playwright image pulling and
15s of PostgreSQL health waiting; these are hypotheses for investigation, not
guaranteed removable costs. Docker browser installation and frontend compilation
already overlap. Resource probes exposed four vCPUs with about 12.7 GiB memory
still available, while CPU models and runner-image versions varied.

Reuse predecessor cold/warm Next.js invalidation, test inventory, fault and
resource evidence for unchanged mechanisms. Validate every changed mechanism
again; previous two-lane aggregate tests cannot certify a new three-lane gate.
Do not rerun an entire predecessor experiment simply to copy its evidence here.

Baseline inventory: backend 56 suites / 307 cases across all five Jest projects;
frontend 30 files / 209 cases, five shared-policy cases and seven Node self-tests;
Playwright 9 compatibility + 25 mocked + 3 live cases, with three compatibility
browsers; four Docker targets. Hosted JUnit reports contain zero errors,
failures and skips. Existing assertion and suite identities, not counts alone,
are the equivalence contract. Refresh the inventory if main changes.

The historical 4:31 -> 3:05 / approximately 32% comparison is superseded by the
paired evidence for PR #51. This follow-up must demonstrate its own improvement
over the merged parallel pipeline, not count predecessor gains again.

## Acceptance and Measurement Contract

- Preserve all required commands or their complete constituent checks, including
  package pre-scripts, Prisma generation/validation, guarded migrations, lint,
  typecheck, tests, build and artifact validation. Keep local entry points usable.
- No removed assertions/browsers, new skips, path filters, weaker audit policy,
  increased retries, reduced timeouts or `continue-on-error` on required work.
- Retain real PostgreSQL/Redis/MinIO evidence and service readiness/cleanup.
  No parallel partitions may share mutable services, ports or build output.
- Aim for critical lanes at 90-105s, leaving room for scheduling and final gates.
  These are design budgets, not new timeout settings or verified forecasts.
- Preserve aggregate check names and fail-closed semantics. Every required
  partition and its reports must succeed; missing/cancelled/skipped cannot pass.
- Report total workflow time, per-job/step time, time to first actionable failure,
  summed runner-seconds, effective runner image/resources, cache hit/miss/size,
  retries and failed/cancelled attempts. Distinguish execution from billed usage.
- With separate authorization, compare baseline/candidate on equivalent app,
  lockfile and test inputs: initially at least five healthy observations per
  compared warm cohort, plus cold-cache and input-invalidation cases. Record all
  observations and failure attempts; do not infer p95/p99 from this sample.
- Claim the sampled sub-two-minute target only if every candidate workflow in
  the declared comparable healthy cohort finishes below 120s with complete
  gates. Report cold results separately, including misses of the target. If only
  the median meets it, label that result accurately rather than claiming all runs.
- Retain the final combination only after workflow-level benefit and correctness
  are shown. A lane improvement hidden behind another slower lane is a provisional
  checkpoint, not demonstrated workflow acceleration or permission to merge it.
  Disclose extra runner consumption under the proposed decision limits below.
  If the target is missed, report the actual result and next constraint, not success.

### Bounded Experiment and Adoption Contract

The following numbers are proposed task-specific decision limits, not measured
performance, account billing limits, new test timeouts or authorization to run.
The user owns budget exceptions and any expanded scope. Freeze these limits in
the approved batch record before seeing results; do not relax them afterward
to classify a marginal improvement as success.

For each batch, record the hypothesis, one changed cost mechanism, baseline and
candidate SHAs, exact commands, event/cache cohort, expected gate completion
path, instrumentation, known confounders and cleanup targets. Treat native
runner setup, readiness cadence and a new split as separate interventions.

1. **Pilot:** compare at most two candidate configurations for that intervention,
   one matched baseline/candidate pair each. Use existing/local evidence to
   eliminate unsuitable variants first. A pilot selects or rejects a candidate;
   it does not prove a speed claim. Do not run unrelated benchmark pairs together.
2. **Confirm:** test only the selected candidate in five consecutive matched warm
   pairs, with equivalent inputs and event/cache conditions. Include complete
   dependency-chain setup, reports and aggregates. Record runner resources/image
   and all attempts; a slow otherwise-valid run cannot be excluded. Cache priming
   is labeled separately. Failures stop progression for diagnosis; fixing a
   candidate changes its identity and requires a fresh confirmation cohort.
3. **Accept a lane improvement provisionally** only when median completion of its
   full gate path improves by at least `max(10s, 5% of baseline)` and at least
   four of five pairs improve, all correctness gates pass, and complete workflow
   median does not regress by more than 5s. Path time includes a replacement
   aggregate and dispatch, not the sum of parallel jobs. This practical noise
   screen is not a statistical-significance or tail-latency claim.
4. **Accept the final combination** only after five matched pairs against the
   frozen merged baseline show the same minimum workflow improvement and
   directional consistency, with complete final validation. Reuse the latest
   confirmation if it already compares those exact candidates/cohorts. The
   separate sub-two-minute claim still requires every valid candidate run below
   120s; otherwise report partial improvement for an owner decision, not goal met.
5. **Cost gate:** proposed cumulative median runner-seconds ceiling is +20%
   versus the matched merged baseline, including all new jobs and post-work.
   Exceeding it requires explicit user acceptance before retaining the change,
   even if latency improves. Compare against the frozen baseline as well as the
   previous checkpoint to prevent compounded cost growth. This is not billed cost.
6. **Reject** correctness/isolation/gate regressions and repeatable performance
   regressions; revert the experimental change, not test assertions. **Inconclusive**
   means too-small/inconsistent gains, materially unmatched inputs/resources or
   insufficient samples. Keep the previous candidate; do not keep dispatching
   until a favorable sample appears. No automatic retry of failed workflows.

One separately authorized batch is capped at **20 workflow starts**, **300
summed runner-minutes**, and **90 minutes elapsed hosted investigation**, whichever
bound is reached first. Starts include pilots, priming, confirmation, negative
probes, cancelled runs and reruns; paired workflows count as two. Request approval
before starting the batch, showing its run allocation and conservative remaining
cost estimate. Run only one pair at a time. Stop new dispatches before the estimate
would exceed a bound; do not cancel healthy required evidence just to fit a budget.
An unexpected overrun is reported and freezes further dispatch, not hidden.
The timebox covers hosted collection, not an instruction to rush code review.

Twenty starts can cover four pilot runs, two prime runs, ten confirmation runs
and four targeted correctness probes; it does not authorize that whole allocation
by default. If validation needs more, retain the evidence, mark validation
incomplete, and request a scoped extension. A failed/expired budget never waives
security or test evidence. Each subsequent intervention needs its own bounded
approval; there is no automatic budget renewal for A-D.

## Ordered Experiments and Decision Gates

Change one source of cost at a time. Compare against the preceding retained
candidate and keep losing experiments independently revertible.

Priority is **A journeys -> B backend -> D Docker -> C conditional frontend**,
with a compatibility gate-path checkpoint after A. Recompute the critical path
after each retained checkpoint; stop adding nodes once the measured final target
is satisfied. Each of the following triggers uses current evidence, not a fixed
promise to implement every optional split.

### A. Journey setup, then optional third E2E lane

1. Measure a native Ubuntu/Node 22 journey runner against the current version-
   aligned Playwright container. Install the lockfile-selected Playwright
   Chromium and its OS dependencies; retain the existing browser channel,
   workers, retries, runner scripts and tests. Compatibility keeps all three
   browsers and its current environment unless evidence separately justifies change.
2. Account for complete browser/OS setup; do not assume moving a download from
   image pull to an install command saves time. Browser caching is not the
   default. Compare end-to-end restore/download costs if later proposed.
3. Update only test topology where required: native-host PostgreSQL uses its
   mapped localhost port instead of the container hostname. Preserve the
   `_test` guard, test-only credentials and existing live-runner environment.
4. Measure a faster readiness probe cadence while preserving the readiness
   predicate and total startup allowance. A shorter interval with unchanged
   retry count can accidentally shorten that allowance; do not do that.
5. If journeys still misses its budget, compare separate mocked and live jobs.
   Live must explicitly build shared auth-policy, apply test migrations, generate
   Prisma/build the backend and own its server cleanup without relying on the
   mocked job. Each job has its own workspace/ports; only live needs PostgreSQL.
   Extend the existing E2E aggregate to require all three lanes and artifacts.
6. Recheck compatibility -> aggregate after speeding up journeys. If it blocks
   the workflow target, open a separately measured setup-only variant under A;
   retain Chromium/Firefox/WebKit, production-mode checks and workers/retries.
   No browser removal or default browser-level sharding is authorized. If its
   existing environment already fits, keep it. If no bounded variant fits,
   report that constraint rather than declaring the E2E path below 120s.

Keep two E2E lanes if cheaper setup suffices or a third lane loses to overhead.
The first implementation slice proposed for approval is native journey setup, preserving
the two-lane graph; readiness and third-lane trials follow separate measurements.
Do not run mocked/live servers concurrently in one `.next` tree. Do not shard
the 25-case mocked suite before measuring setup; 21 cases are in one file, so
file-based sharding is currently imbalanced.

### B. Backend validation critical path

1. Separate quality/build evidence from service-backed test execution only if
   the measured split beats the current job including duplicate preparation.
   Quality owns static checks, unit tests, build and artifact validation; the
   service lane retains integration, contract, security and backend E2E projects.
2. If service tests remain above budget, trial at most two balanced partitions
   using the installed Jest version's supported selection/sharding mechanism.
   Keep `--runInBand` within each partition initially. Each partition provisions
   its own PostgreSQL, Redis and MinIO and applies all test migrations.
3. Compare discovered suite identities: partitions must be nonempty, disjoint
   and their union must equal the full baseline service-test inventory. New
   suites must be discovered automatically; avoid maintained file allowlists.
   Verify complete executed case outcomes and unique per-partition reports.
   Prefer built-in Jest JSON output plus console logs, with shard-indexed
   artifact names and seven-day retention, without adding a reporter dependency.
   Empty selection, missing output or incomplete inventory must fail validation.
4. Reuse the existing `Backend validation` name as an aggregate only if split;
   require quality/build and every test partition with exact-success semantics.

Decision: retain a split only if the slowest partition -> aggregate path passes
the shared acceptance/cost gates; a faster individual shard is not sufficient.
If the quality/build lane becomes the new bottleneck, diagnose that lane before
adding service shards. Include standalone Prisma/shared-package preparation in
the ownership map; do not inherit generated output from another job implicitly.

Do not create one runner for every Jest project, change application rate-limit
or isolation behavior, or enable workers over a shared service namespace merely
to improve timing. No test migration is run against development/production data.

### C. Frontend: warm-cache evidence before splitting

Current warm median is 104s (90-113s); default to keeping this job unchanged.
Reuse existing source/config/lockfile invalidation evidence unless cache inputs
or preparation change. Trial a split only if new comparable measurements after
A/B/D make frontend the complete-workflow bottleneck or show it cannot leave
the required scheduling margin. Otherwise defer this phase. If triggered, compare
two jobs: shared-policy/quality/tests and production build, each with standalone
preparation. Preserve explicit lint, typecheck and all Node self-tests even if
the build performs related checks internally. Keep the original frontend check
name as a fail-closed aggregate if split. Do not concurrently run commands that
write `.next` or TypeScript incremental state in one workspace.

### D. Docker layers and cache, not four independent runners

Keep the four-target shared Bake builder. Reuse existing CPU/memory and overlap
evidence to locate the affected layer; sample changed build behavior again.
Current 123s warm median and 142s main observation make Docker a likely remaining
floor after A/B. Test dependency-keyed browser installation before
source copying, preserving target inheritance, installed browsers and runtime
image contracts. Rebuild all targets and smoke changed test/runtime images.

Compare bounded GitHub Actions cache import/export only if it can reuse useful
layers across fresh runners. Layer rearrangement alone does not create cross-run
reuse on an ephemeral builder. Verify the builder supports the cache backend;
use non-overwriting target scopes and preserve PR/protected-branch trust boundaries.
Measure import, export and storage costs; do not blindly export all browser layers
with `mode=max`. Cache unavailability must rebuild or fail visibly, never replace
required evidence. Preserve cache-only image output, provenance/build records,
Compose inventory and orchestration self-tests. No registry push is included.

Decision: retain layer/cache changes only for measured complete build-gate
benefit after import/export and diagnostics, within the shared cost limit.
Source changes must demonstrably reuse only compatible layers, while dependency
changes invalidate them. A cache hit in a developer's existing builder alone
does not support hosted adoption. Keep the current layers/cache policy if the
experiment is inconclusive, and report a Docker floor if the target remains unmet.

## Candidate Topology and What Stays Together

The maximum experiment structure below is conditional, not a mandate to split
every job. Reject unnecessary nodes after measurement.

```text
PR / push main
├─ PR evidence (PR only)
├─ Backend quality/build + service tests [1 or 2 isolated partitions]
│  └─ Backend validation aggregate (only if split)
├─ Frontend quality/tests + production build (only if split)
│  └─ Frontend validation aggregate (only if split)
├─ E2E compatibility + journeys [or separate mocked + live]
│  └─ Frontend E2E aggregate
├─ Container topology + shared Bake targets
└─ Dependency audit (unchanged)
```

Use `fail-fast: false` for any test matrix so independent failures retain evidence.
Keep ref-scoped cancellation for superseded runs; aggregates add no dependency
to unrelated jobs. Do not add a central install/build producer that serializes
all consumers or shares authoritative build output across incompatible modes.
Keep audit, compatibility browser grouping and short checkers intact. Larger or
self-hosted/prewarmed runners and custom CI images are separate proposals if
standard-runner experiments cannot meet the target, not hidden dependencies.

## Scope, Validation and Recovery

Expected files: `.github/workflows/ci.yml`, `docker-bake.hcl`, conditional
`Dockerfile`, narrowly scoped package commands/reporting/aggregate helpers and
tests, plus delivery/testing documentation. No application/schema/auth changes,
package upgrades, production/AWS work, secrets, permission changes or EOS edits.

Before final validation, inspect the complete diff and fix in-scope findings.
Required evidence includes:

- Complete backend/frontend validation and all 37 Playwright cases on the final
  candidate; compare suite identities and executed outcomes, not only totals.
- Fresh independent runner/workspace preparation for every selected lane;
  real-service negative paths, readiness, migrations and cleanup preserved.
- Exact aggregate predicates tested locally; separately authorized hosted
  upstream failure, missing report and cancellation behavior. Each required
  partition is accountable; deliberate failures must not ship in the final diff.
- Unique reports on success/failure, all shard reports required, unchanged
  privacy controls and retention. Do not enable raw auth traces as a side effect.
- Cold/warm and source/config/lockfile invalidation for retained caches; full
  rebuild fallback, four Docker targets, generated/backend/standalone artifact
  inspection and runtime smoke when image layers or environments change.
- Existing audit self-tests and fresh complete production scan, unchanged policy;
  Actions syntax, Docker topology/self-tests and documentation links.
- Final hosted CI and recorded timing/resource comparison after explicit push
  approval. Local green results do not establish a hosted performance claim.

Use independently reviewable commits for journey setup, backend partitions,
conditional frontend changes and Docker caching. Stop/re-plan if isolation is
unclear, flakes increase, runner cost becomes material, stronger permissions are
needed or meeting 120s requires removing evidence. Revert the losing optimization
without reverting application/security fixes; preserve aggregate/check-name
continuity and clean only disposable test resources. No production rollback or
broad cache deletion is needed.

## Plan Review Outcome

### Phase A native journey experiment - 2026-09-05

The first candidate changes only the journey lane from the version-aligned
Playwright job container to the native Ubuntu/Node 22 runner. It installs the
lockfile-selected Playwright 1.61.0 Chromium engine and OS dependencies after the
frozen dependency install. PostgreSQL moves from the job-container hostname to
the host-mapped `localhost:5432`; compatibility remains in the Playwright image
with Chromium, Firefox and WebKit. Package caching, selectors, assertions,
workers, retries, reports, migrations, cleanup and the two-lane aggregate are
unchanged.

Actionlint 1.7.12 passed. The Playwright CLI resolved version 1.61.0 and its
Chromium installation contract. Local mocked journeys passed 25/25, all nine
test migrations were already applied to `worksync_test`, and live journeys
passed 3/3 against local PostgreSQL/Redis; runner-owned frontend/backend health
ports were unavailable after cleanup. Aggregate/report self-tests passed 4/4.
The complete frontend validation command also passed auth-policy tests,
typecheck, lint, 209 unit/component tests, seven Node self-tests and the
production build.
Local execution is macOS and cannot prove GitHub's Ubuntu OS dependency install,
service networking, timing or resource behavior. Those remain the decisive
hosted pilot evidence and are not inferred from syntax or local test success.

The hosted pilot proved the native Ubuntu setup, service networking and all
required gates. A five-pair confirmation then compared pull-request runs with
identical workflow, application, package, lockfile and Docker inputs. The
baseline-to-merge difference was documentation-only. No failed or retried run
was excluded.

| Pair | Baseline wall | Candidate wall | Baseline journeys | Candidate journeys | Baseline runner-s | Candidate runner-s |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 164s | 178s | 150s | 168s | 703 | 711 |
| 2 | 182s | 157s | 167s | 148s | 750 | 685 |
| 3 | 179s | 193s | 169s | 179s | 705 | 720 |
| 4 | 178s | 182s | 168s | 169s | 719 | 733 |
| 5 | 223s | 183s | 174s | 173s | 746 | 744 |

Workflow median regressed from 179s to 182s and journey median regressed from
168s to 169s. Candidate workflow and journey time improved in only two of five
pairs. Median runner time was effectively flat at 719s versus 720s. The complete
journey setup median moved only from 44s to 42s because the native runner's
Chromium/OS installation replaced nearly all container-initialization savings.
Every workflow exceeded 120s; the fastest candidate was 157s.

The confirmation batch used 10 starts, approximately 120.3 runner-minutes and
33m27s elapsed, within its approved limits. The candidate failed the frozen
median-improvement and four-of-five directional gates, so the native-runner
change was rejected and the version-aligned Playwright container was restored.
PR #51 remains the retained baseline. Readiness cadence, lane splitting, backend,
Docker and conditional frontend experiments remain separately authorized work;
no sub-two-minute claim has been established.

### Phase B local implementation evidence - 2026-09-05

A readiness-cadence-only candidate was eliminated before implementation or new
hosted runs. In the retained workflow run, the journey PostgreSQL container
started at `03:13:17.970Z` and PostgreSQL reported readiness at
`03:13:20.750Z`. The Actions runner observed service state at approximately
`+0s`, `+2s`, `+6s`, and `+15s`; the current 10-second Docker health cadence
made the healthy state visible only at the last observation. Even if a faster
Docker probe made the observed `+2.8s` database readiness visible immediately,
the runner would next observe it at about `+6s`, an approximately eight-second
critical-path reduction for that trace. That cannot meet the frozen minimum
10-second lane-improvement gate, so no readiness setting, predicate, timeout,
retry count, or startup allowance changed. This is a local evidence-based
rejection, not a hosted performance result.

The next candidate splits the former journey lane into independent mocked and
live jobs. The mocked job has no database service. The live job retains the
same Playwright image, PostgreSQL image and health contract, explicitly builds
`@worksync/auth-policy`, applies the guarded `_test` migration command, and uses
the existing runner to generate Prisma Client, build and clean up the backend
and frontend. Each job has an isolated checkout, `.next` tree, ports, process
lifecycle, and uniquely named JUnit artifact. Compatibility is unchanged. The
stable `Frontend E2E` aggregate now fails closed unless compatibility, mocked,
and live jobs—including their report uploads—all succeed.

The expected wall-clock mechanism is parallel execution of the historical
44-60-second mocked command and 30-39-second live command. It deliberately pays
another Playwright-container pull, Node/pnpm setup, and frozen install, so hosted
runner consumption is expected to rise and remains subject to the +20% cost
gate. Local checks can prove command independence, suite identity, report paths,
service isolation, and aggregate semantics; only a separately approved hosted
pilot can establish runner scheduling, image-pull behavior, wall time, or cost.
No hosted run, push, or performance claim is authorized by this implementation.

Actionlint 1.7.12 passed and the fail-closed aggregate/report-isolation tests
passed 4/4, including incomplete and sparse result inputs. The three independent
local commands passed compatibility 9/9 across Chromium/Firefox/WebKit, mocked
journeys 25/25, and live journeys 3/3 after the explicit auth-policy build and
all nine guarded migrations were confirmed applied. All three JUnit reports had
zero failures, errors, or skips; runner-owned ports 3000 and 4000 were unavailable
after cleanup. Full frontend validation passed five auth-policy tests, typecheck,
lint, 209 unit/component tests, seven Node self-tests, and the production build.
Full backend validation passed Prisma validation/generation, database-environment
guards, typecheck, lint, 307 tests across 56 suites, build, and inspection of 294
artifact files. The dependency-audit contract passed 8/8 tests, including two
live known-vulnerable probes, and the current production scan covered 464/464
package-versions with no blocking or unknown-severity finding. Local macOS
evidence does not prove hosted concurrency, fresh container setup, Ubuntu
networking, artifact upload, timing, or runner cost.

Review corrections incorporated: distinguish workflow time from job time;
budget aggregate/setup overhead; retain readiness allowance; make live setup
standalone; prove partition union/disjointness and fail-closed aggregation;
require cross-run cache evidence for layer changes; keep cold runs/cost visible.

This refresh replaces stale predecessor status/single-run timing with the merged
SHA, five-round evidence and post-merge observation. It adds pilot/confirmation
limits, accept/reject/inconclusive outcomes, cumulative cost and dispatch budgets,
and the compatibility tail checkpoint. Numeric limits are approval proposals,
not claims that sub-two-minute CI is already feasible or that hosted work is
authorized. No remaining plan-design blocker was found in this scoped review;
runtime feasibility remains the question these experiments must answer.

Engineering improvement review: current scope adds only inventory, isolation,
failure-report and measurement controls necessary for safe parallelization.
Custom runners/images and broader CI framework work remain future enhancements
requiring evidence and separate approval. No product requirement is changed.

## References

- [Predecessor plan](../completed/ci-critical-path.md)
- [Predecessor hosted validation and benchmarks](../evidence/ci-critical-path-validation.md)
- [Verified post-merge main CI](https://github.com/methat-ruk/worksync/actions/runs/33855624835)
- [Current CI workflow](../../../workflows/ci-validation-workflow.md)
- [Playwright browser installation](https://playwright.dev/docs/browsers)
- [Playwright CI/cache guidance](https://playwright.dev/docs/ci)
- [Docker GitHub Actions cache scopes and backend requirements](https://docs.docker.com/build/cache/backends/gha/)

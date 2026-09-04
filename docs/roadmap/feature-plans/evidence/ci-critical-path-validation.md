# CI Critical Path: Hosted Validation Evidence

Status: Hosted validation complete; final delivery gate tracked in PR #51 checks

Date: 2026-09-04

Implementation: [PR #51](https://github.com/methat-ruk/worksync/pull/51),
`c55606a32475e13e72fd42f9d03643ccd53b2828`

## Scope and Candidate Identity

This record closes the evidence gaps in the
[CI Critical Path plan](../completed/ci-critical-path.md), not the subsequent
`perf/ci-sub-2m` optimization. No production systems, application contracts,
repository permissions, audit policy or test assertions were changed in PR #51
to obtain these results.

The user authorized hosted fault/cache checks and paired timing collection.
Temporary workflows run only on `validation/pr51-evidence-20260904`, not on
`main` or the PR branch. They are not proposed for merge. Fault/cache harness
commit: `40d659c1927d27a2ceb921b0247ed38e2f82a20a`, parented directly on the PR
implementation. Actionlint 1.7.12 passed before publication.

## Normal Hosted CI

[Run 33848922740](https://github.com/methat-ruk/worksync/actions/runs/33848922740)
passed all eight checks on the implementation head in 3:05. All three JUnit
artifacts were downloaded and inspected: compatibility 9 cases across
Chromium/Firefox/WebKit, mocked 25, live 3; zero failures, errors or skips.
Backend passed 56 suites / 307 tests, frontend 30 files / 209 tests, and the
Docker build record and dependency audit report were present.

## Hosted Failure and Cancellation

The fault harness copies the actual E2E lane setup, reporter/upload conditions,
and aggregate dependency/result logic. It renames jobs/artifacts to separate
scenarios. The aggregate invokes the unchanged `scripts/ci-e2e-result.cjs` from
the PR head and its self-test; it does not replace the result check with an
expected-success fixture.

| Scenario | Observed result | Evidence |
|---|---|---|
| Assertion failure | Compatibility command failed; its JUnit upload succeeded; independent mocked/live journeys passed; aggregate failed | [Fault run 33851403061](https://github.com/methat-ruk/worksync/actions/runs/33851403061) |
| Missing required report | All compatibility cases passed; harness removed only its generated JUnit file; upload failed; aggregate failed | Same fault run, `missing-compatibility` / `missing-aggregate` |
| Skipped required lane | Upstream job was genuinely skipped by a job condition; sibling succeeded; `always()` aggregate ran and failed | Same fault run, `skipped-compatibility` / `skipped-aggregate` |
| Cancelled required lane | GitHub cancellation interrupted a running fixture; lane concluded cancelled; sibling succeeded; aggregate ran and failed | [Cancellation run 33851403150](https://github.com/methat-ruk/worksync/actions/runs/33851403150) |

These workflows intentionally conclude failure/cancelled. Those conclusions
are successful negative-test observations, not passing application workflows.
The PR's normal CI remains independent of them.

The assertion fixture was created only inside the disposable job workspace.
The downloaded report contains 12 cases: the original nine successes plus one
deliberate assertion failure in each browser project (three failures, no skips).
The sibling lane retained 25 mocked and three live passes and uploaded both
reports. Missing-report injection removed only
`app/frontend/test-results/compatibility/junit.xml` in its disposable runner.

Measured from workflow creation, the assertion command failed at 116s and the
aggregate failure step at 153s; the missing-report upload failed at 108s and its
aggregate at 117s. The skipped-lane aggregate failed at 12s. Command completion
is an upper bound for actionable log availability, not the exact first assertion
timestamp. There is no paired baseline failure-injection run, so these numbers
establish observed feedback latency, not a claimed latency improvement.

The cancellation and skipped-result scenarios use minimal control-plane fixtures
for the upstream work, while preserving the real aggregate. They prove GitHub
result propagation, not every possible browser/database interruption or cleanup
failure. Full-run cancellation can also prevent later jobs from starting; that
remains incomplete evidence, never a synthetic pass. Local predicate tests cover
all 49 success/failure/cancelled/skipped/empty/unknown/undefined pairs and malformed
arity; not every pair is separately scheduled on GitHub.

## Next.js Cache and Invalidation

[Cache run 33851403089](https://github.com/methat-ruk/worksync/actions/runs/33851403089)
copies frontend validation and its exact key/restore-prefix expression with an
isolated experiment namespace. A prime job completes before four independent
variants run; each executes the full `pnpm validate:frontend` command.

| Probe | Actual cache decision | Required work/result |
|---|---|---|
| Cold Next cache | No matching cache | Full frontend validation/build passed and saved the cache |
| Unchanged warm inputs | Exact hit (`cache-hit=true`) | Full validation/build still ran and passed |
| Frontend source change | Exact miss, compatible-prefix restore (`cache-hit=false`) | CSS probe appeared in newly built production CSS; all checks passed |
| Frontend build configuration change | No matching configuration namespace | Full validation/build passed |
| Lockfile bytes change | No matching dependency namespace | Frozen install and full validation/build passed |

Source injection appends a harmless custom-property rule to global CSS. Config
and lockfile probes append comments: these prove byte-based cache identity
invalidation without adopting an unrelated dependency or behavior change. They
are not tests of a package upgrade. Their files exist only on disposable runners.
Each run retained all 209 frontend cases, five shared-policy cases and Node
self-tests. No build result was accepted instead of current validation.

This is cold/warm **Next.js** cache evidence; the host pnpm cache was available.
It must not be described as a fully cold dependency/network environment.
No E2E dependency cache, E2E Next cache or Docker remote cache is introduced by
the candidate. Cache misses and changed namespaces exercised rebuild paths;
a cache-provider outage was not deliberately induced.

## Paired Performance Protocol

Two temporary push-triggered workflows use the same application, lockfile,
reporter configuration and test source from the implementation head:

- Baseline uses the pre-PR workflow from `19c2b091cf5b00efd877b0397b1480dda0cee0fe`.
- Candidate uses the PR workflow from `c55606a32475e13e72fd42f9d03643ccd53b2828`.

Adapters are limited to workflow name/trigger, isolated Next.js cache namespace
and an unused baseline shell-variable rename. All application validation and
security commands remain present. Both omit the PR-only advisory job because
the event is push; this difference from normal PR timing is explicit and common
to both sides. Candidate reports/aggregate and Docker build-record overhead are
included. Docker retains a fresh builder without cross-run remote cache.

One paired prime round is followed by five paired warm rounds. Each round has
a new commit differing only in benchmark workflow comments; application/test
inputs and cache keys remain stable. The next pair starts after both previous
runs complete, avoiding deliberate cancellation or an artificial backlog.
GitHub-hosted runner/network variance and overlap with unrelated account activity
remain possible; cache state must be checked in logs rather than inferred from
the round label. Failed attempts are recorded and stop automatic progression.

Measures include workflow creation-to-completion, job start offsets, job/step
durations, runner-seconds, cache behavior, test outcomes and retries. No p95/p99
or guarantee for all future runs is inferred from five observations.

## Repeated Timing Results

All twelve runs passed on attempt 1. Each warm pair has exactly the same source
SHA on both sides; only experiment workflow comments differ between rounds.
The run pages identify each SHA and retain job/step logs.

| Cohort | Baseline run / wall time | Candidate run / wall time | Saved | Runner-seconds baseline / candidate |
|---|---|---|---:|---:|
| Prime, excluded from warm statistics | [33851896305](https://github.com/methat-ruk/worksync/actions/runs/33851896305) / 3:33 | [33851896250](https://github.com/methat-ruk/worksync/actions/runs/33851896250) / 3:05 | 28s | 721 / 736 |
| Warm 1 | [33852229013](https://github.com/methat-ruk/worksync/actions/runs/33852229013) / 3:52 | [33852228983](https://github.com/methat-ruk/worksync/actions/runs/33852228983) / 2:56 | 56s | 736 / 697 |
| Warm 2 | [33852587488](https://github.com/methat-ruk/worksync/actions/runs/33852587488) / 3:56 | [33852587610](https://github.com/methat-ruk/worksync/actions/runs/33852587610) / 3:07 | 49s | 706 / 694 |
| Warm 3 | [33852940387](https://github.com/methat-ruk/worksync/actions/runs/33852940387) / 3:48 | [33852940413](https://github.com/methat-ruk/worksync/actions/runs/33852940413) / 3:06 | 42s | 732 / 724 |
| Warm 4 | [33853296090](https://github.com/methat-ruk/worksync/actions/runs/33853296090) / 3:56 | [33853295956](https://github.com/methat-ruk/worksync/actions/runs/33853295956) / 2:57 | 59s | 704 / 722 |
| Warm 5 | [33853660731](https://github.com/methat-ruk/worksync/actions/runs/33853660731) / 3:49 | [33853660695](https://github.com/methat-ruk/worksync/actions/runs/33853660695) / 3:10 | 39s | 698 / 740 |

Warm workflow median: **3:52 -> 3:06**, a 46s / 19.8% reduction in side medians.
Median paired saving is 49s; every observed pair improved by 39-59s. Baseline
range is 3:48-3:56; candidate range is 2:56-3:10. This replaces the earlier
uncontrolled 4:31 -> 3:05 comparison as the stronger evidence, not a promise of
30-40% reduction or sub-two-minute CI.

Median summed job duration is **706 -> 722 runner-seconds (+2.3%)**. Individual
pairs vary in both directions. These are observed occupied job-seconds, not
GitHub billed minutes or a cost forecast; billing rounding and runner rates are
not modeled. Extra E2E setup/aggregate/reporting offsets some Docker savings.

| Job | Baseline median (range), seconds | Candidate median (range), seconds |
|---|---:|---:|
| Backend validation, unchanged | 163 (156-182) | 153 (150-160) |
| Frontend validation | 99 (87-107) | 104 (90-113) |
| Serial E2E / journeys lane | 228 (224-234) | 173 (164-179) |
| Compatibility lane | Included in serial E2E | 113 (109-125) |
| E2E aggregate | Not separate | 6 (4-7) |
| Container topology and images | 189 (185-192) | 123 (118-133) |
| Dependency audit, unchanged | 34 (31-46) | 39 (30-47) |

Unchanged backend/audit timing differences demonstrate runner/network variance;
they are not attributed to this optimization. Hosted image logs include Ubuntu
24.04 versions `20260823.283.1` and `20260831.293.1`; images were not frozen across
GitHub's rollout. Independent jobs started 2-10s after workflow creation on the
baseline and 2-8s on the candidate. These offsets include dispatch, not pure
queue time. Candidate aggregate scheduling added 2-3s after the last E2E lane,
then 4-7s of execution; it was included in workflow timing.

The critical path in all five warm pairs was serial E2E before the change and
journeys -> aggregate afterward. Candidate journeys initialization alone took
42-59s, frozen installation 14-16s, mocked command 44-60s, migration 2-4s and live
command 30-39s. Reports took approximately 0-2s per upload. Setup and actual
journey work, not the aggregate, are the next material latency targets. Backend
150-160s remains another floor; these are inputs to a separate future plan.

Both sides had exact warm frontend Next.js hits in all five measured rounds.
Baseline E2E pnpm restore was available (Setup Node 10-12s, install 10-11s,
post-cache 0-1s); candidate journeys had no dependency cache (Setup Node 0-3s,
install 14-16s, no cache save). Thus these rounds also test a favorable baseline
cache-hit case, not only the historical expensive gzip-save case. Frontend
validation has no demonstrated independent speed improvement; its stronger key
is retained for correctness. Docker builders were cold across runs.

Every benchmark log retained 307 backend, 209 frontend and 37 Playwright passes
plus the complete 464/464 production-package audit. The five candidate rounds'
15 JUnit artifacts were downloaded: identical suite/case identities (including
all three compatibility browsers), zero failures/errors/skips. No automatic
workflow reruns or reported Playwright flaky/retry outcomes were observed.
This sample is not a long-term flake-rate estimate. Existing selectors,
assertions, worker/retry limits and audit policy remain unchanged.

## Cold Dependency Cache and Docker Resources

A separate paired probe ran only after all warm measurements finished, on
`validation/pr51-cold-resources-20260904`, commit
`9011e72f50da70236cc3e340f3edb5cc3927c71c`. Relative to the implementation head,
it adds two temporary workflows and one lockfile comment. The same comment on
both sides changes cache identity without changing any package resolution.
Workflow copies retain the full validation/security commands and add a read-only
two-second CPU/memory sampler around container preparation/builds. Actionlint
passed before publication. No existing caches were deleted.

- [Baseline 33854061049](https://github.com/methat-ruk/worksync/actions/runs/33854061049):
  passed in 4:42; serial E2E 276s, including a 39s gzip pnpm cache post-step.
- [Candidate 33854061022](https://github.com/methat-ruk/worksync/actions/runs/33854061022):
  passed in 3:06; journeys 176s, compatibility 113s and aggregate 5s.

All enabled project pnpm caches reported a miss; frontend Next.js caches also
missed. Frozen installs, full tests/builds and the complete audit passed on both
sides. Candidate E2E correctly made no dependency-cache request. Host Node/image
and upstream registry/CDN caches were not cleared: this is project-cache-cold,
not a completely cold internet environment. This single correctness/resource
pair is excluded from warm statistics and is not a five-sample cold-performance
claim. All 37 cold candidate JUnit case identities match the warm reports, with
zero failures/errors/skips.

Concurrent host pnpm saves encountered an already-reserved cache key: their
cache-only post-steps remained nonfatal after real validation had passed. The
baseline E2E gzip archive used its distinct cache version and saved in 39s.
This provides observed save-contention fallback evidence, not a simulated
cache-provider outage; no validation exit status was weakened to obtain it.

| Docker resource observation | Serial baseline | Shared Bake candidate |
|---|---:|---:|
| Exposed resources | 4 vCPU / 15.61 GiB RAM | 4 vCPU / 15.61 GiB RAM |
| CPU model | Intel Xeon Platinum 8573C | AMD EPYC 7763 |
| Ubuntu image version | 20260831.293.1 | 20260823.283.1 |
| Two-second samples | 92 | 57 |
| Mean / peak sampled host CPU busy | 31.6% / 89.9% | 66.2% / 99.9% |
| Minimum host MemAvailable | 12.71 GiB | 12.69 GiB |
| Complete container job, including diagnostics | 206s | 132s |
| Build-action execution, excluding post-actions | 58 + 47 + 1 + 65 = 171s | 111s |

Bake used more parallel CPU while memory remained available and all four targets
passed. No build OOM/failure was observed. These are host-wide interval samples,
not per-process peak RSS or a load-capacity test. CPU models/images differ, so
this pair establishes observed headroom and successful shared-builder execution,
not a hardware-controlled speed ratio. The repeated warm container timings above
are the stronger duration evidence. Raw JSONL samples are in the `pr51-resources`
artifact of each run; Docker build records are retained separately.

## Closure and Remaining Boundaries

The PR's missing hosted validation, negative-path/report evidence, cache
invalidation, repeated warm timing, queue/post costs, runner consumption and
Docker contention observations are now supplied. Review of the implementation
diff and impacted workflow/report/cache/build boundaries found no additional
blocking implementation issue in this closeout. No application fix, YAML change
on the PR branch, new dependency, or test relaxation was needed. Aggregate/report
self-tests were rerun locally (4/4); documentation links and diff hygiene are
checked again before delivery.

Final delivery requires normal CI on the evidence-documentation commit, including
the PR-only advisory check omitted from push-triggered experiments. Its current
SHA/run/result is recorded in PR #51's delivery summary and checks, avoiding a
self-referential follow-up commit merely to include its own run ID. Temporary
validation branches are removed after completed evidence collection; the commit
identities/run links above remain the experiment record. JUnit/resource artifacts
expire after seven days, so the verified counts and measurements are persisted
here as well as linked to their original reports.

Not claimed: all future runs below two minutes, long-term reliability percentiles,
every cancellation/cleanup interleaving, forced provider outage, or production
behavior. No production/AWS test was performed or needed for this CI-only diff.
Repository branch-rule enforcement remains the previously observed separate
owner decision; no permissions/settings were changed. Further sharding, paid
runners, remote Docker cache and `perf/ci-sub-2m` remain outside this PR.

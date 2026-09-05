# CI Validation Workflow

## Purpose

WorkSync CI proves that the repository still works from a clean checkout, not
only on one developer machine. Use this workflow when CI fails, validation
commands change, or required evidence is unclear.

## High-Level Flow

```text
PR / push main
├─ PR review evidence (PR only)
├─ Backend validation
├─ Frontend validation
├─ E2E compatibility: production build + Chromium/Firefox/WebKit
├─ E2E mocked journeys
├─ E2E live auth: shared policy build -> test migrations -> live journeys
├─ Container topology + four concurrent Bake targets
└─ Dependency audit

E2E compatibility + E2E mocked + E2E live -> Frontend E2E aggregate
```

## CI Job Ownership

| Job | Owns |
| --- | --- |
| PR review evidence | PR-only evidence contract and checker self-test |
| Backend validation | Prisma validation/generation, migrations, backend typecheck, lint, Jest projects, backend build, backend artifact checks |
| Frontend validation | shared auth policy package tests, frontend typecheck, lint, unit/component tests, frontend build |
| Frontend E2E compatibility | Independent production build and compatibility on Chromium, Firefox, and WebKit; no database service |
| Frontend E2E mocked journeys | Mocked Chromium journeys with no database service |
| Frontend E2E live auth | Shared auth-policy build, guarded test migrations, backend/Prisma preparation, and live Chromium journeys against an isolated PostgreSQL service |
| Frontend E2E | Fail-closed aggregate: all three E2E lanes must succeed, including report publication |
| Container topology and images | Development/test Compose config and service lists, Docker orchestration self-test, and production/test image builds |
| Dependency audit | production dependency vulnerability gate |

Keep jobs split by failure ownership. Do not combine unrelated checks just to
make CI look simpler.

## Why It Works This Way

- Backend tests need PostgreSQL, Redis, and MinIO service setup.
- Frontend validation should fail fast without waiting for backend database
  suites.
- Browser E2E failures should be distinguishable from unit or build failures.
- Docker image builds catch clean-checkout and generated-artifact mistakes that
  local validation may miss.

## Parallelism, Caches, and Results

Only the aggregate has `needs`. Compatibility, mocked, and live use independent
workspaces, builds, ports, and server lifecycles, so the two journey suites run
in parallel without sharing mutable `.next` output or PostgreSQL state. Only the
live lane starts PostgreSQL; it explicitly builds the shared auth-policy package
before guarded migrations and runner-owned backend preparation. Workers, retries,
browser projects, and test assertions are unchanged. Ref-scoped concurrency still
cancels superseded runs; there is no fail-fast matrix.

The `Frontend E2E` check keeps its previous name and job ID. Its job-level
`always()` condition inspects all three lane results. Only three `success` values pass;
failure, skipped, cancelled, missing, or unknown values cannot pass. Whole-run
cancellation may prevent execution and is incomplete evidence. This aggregate
does not cover backend, frontend validation, images, audit, or PR evidence;
those checks remain necessary. Check names do not establish repository-rule
enforcement by themselves.

E2E lanes intentionally disable package-manager caching: the selected Playwright
image lacks `zstd`, and observed cold gzip cache saves cost 39-43 seconds versus
approximately 15 seconds for a frozen dependency install. All three lanes still run
the complete frozen install. There is no new E2E Next.js or browser cache.
Backend/frontend/audit pnpm caches remain. Frontend validation caches only
`.next/cache`, with OS, architecture, Node major, public build arguments,
lockfile, workspace/configuration, and source identity in its namespace. Cache
hits never replace builds or tests. Reassess cache choices using total hosted
restore/save costs, not installation time alone.

`docker-bake.hcl` owns the four CI build targets. One pinned Bake action builds
them on the same builder so shared stages can be reused. Arguments, target
names, and cache-only output match the previous builds; CI does not push images,
load them into the daemon, or export a remote cache. Default Bake build records
and logs remain available. The Dockerfile and runtime image contracts are
unchanged.

With `CI=true`, Playwright retains list output and adds JUnit reports at
`app/frontend/test-results/{compatibility,mocked,live}/junit.xml`. Reports include
browser project names and use separate directories from attachments, which
Playwright clears before a run. CI uploads three uniquely named artifacts with
seven-day retention after successful or failed suite execution; an expected
missing report fails publication. Skipped suites do not claim a report. Local
runs without `CI` keep list reporting. No new trace, video, or screenshot capture
is enabled. When interpreting JUnit, inspect both `failures` and `errors`, plus
skipped tests and the process exit status; `failures="0"` alone is not a pass.

## Local Commands

```bash
corepack pnpm validate:backend
corepack pnpm validate:frontend
CI=true corepack pnpm --filter @worksync/frontend test:e2e:compatibility
CI=true corepack pnpm --filter @worksync/frontend test:e2e
corepack pnpm prisma:migrate:deploy:test
CI=true corepack pnpm --filter @worksync/frontend test:e2e:live
node --test scripts/ci-e2e-result-self-test.cjs
corepack pnpm docker:full:config
corepack pnpm docker:full:services
corepack pnpm docker:full:build
corepack pnpm test:docker-orchestration
docker buildx bake --print ci
docker buildx bake ci
corepack pnpm setup:audit
corepack pnpm test:audit-production
corepack pnpm audit:production
```

Run only the relevant subset during normal development. Before merging a
pipeline change, run the closest local equivalent for every affected CI job.
Hosted `needs` scheduling, artifact upload, cache behavior, queueing and timing
still require GitHub Actions evidence; local passes are not a speed benchmark.

## Dependency Audit Failure and Recovery

`setup:audit` downloads OSV-Scanner 2.5.1 from the official GitHub release and
verifies its pinned SHA-256 before installation. Linux and macOS (x64/arm64) are
supported; other platforms must use CI. The binary stays under ignored
`node_modules/.cache/osv-scanner/` and is verified again before every audit.

`audit:production` reads the entire `pnpm-lock.yaml` with OSV-Scanner and obtains
the production dependency graph independently using the pinned pnpm command
`list -r --prod --depth Infinity --lockfile-only --json`. This includes workspace
consumers, optional dependencies and transitive packages. Every production
package-version must appear in the OSV report or the gate fails as incomplete.
No custom lockfile parser or installed-node_modules inventory is used.

The moderate-or-higher production gate is retained: OSV's computed CVSS score
of at least 4.0 or MODERATE/MEDIUM/HIGH/CRITICAL label blocks. Unknown severity
also blocks pending review. Dev-only findings remain visible in the full JSON
report but do not expand this production gate. The scanner may exit 1 for
dev-only or low findings; that is accepted only after a valid complete report
has been checked against the entire production inventory.

The wrapper distinguishes three outcomes:

- Exit 0: complete coverage with no blocking production findings.
- Exit 1: moderate-or-higher or unknown-severity production vulnerabilities.
- Exit 2: incomplete audit (network, missing packages, invalid inventory/report,
  tool failure, or checksum mismatch). This is not a security pass.

Inventory has a 30-second process limit, the live OSV scan has a 120-second
process limit, and the CI audit step has a three-minute limit. Restore OSV/GitHub
connectivity and rerun on infrastructure failure; do not bypass the gate.
The explicit `scripts/osv-scanner.toml` contains no package/advisory exclusions.
Call-analysis suppression and offline/stale-database fallback are not used.
Package names and versions are queried against OSV, not npm's advisory endpoint.

During `Setup pnpm` only, `npm_config_audit=false` disables npm's implicit audit
of the bootstrap tool. The separately required project audit still runs. An
npm advisory outage therefore does not also stall unrelated setup jobs.

`test:audit-production` covers threshold boundaries, missing coverage,
optional/transitive/workspace inventory, dev-only findings, corrupt binaries,
malformed output, process failures and timeout propagation. It also runs the
real pinned scanner against temporary clean and known-vulnerable lockfiles using
the live OSV service. These contract checks fail rather than skip if unavailable.
The full current-lockfile audit remains required before merge.

The raw full report is saved as `test-results/dependency-audit.json` and uploaded
as the CI `dependency-audit-report` artifact (seven-day retention), including
dev findings for separate triage. Changing scanner version/digests, coverage or
severity policy requires review and rerunning the gate tests.

Sources: [OSV supported lockfiles](https://google.github.io/osv-scanner/supported-languages-and-lockfiles/),
[OSV configuration](https://google.github.io/osv-scanner/configuration/),
[pinned release](https://github.com/google/osv-scanner/releases/tag/v2.5.1).

## Common Failure Modes

- Local passes but CI fails because a generated artifact was present locally but
  missing in a clean checkout.
- Backend Jest cannot resolve workspace package subpath exports such as
  `@worksync/auth-policy/*`.
- Docker image build fails because Prisma Client was not generated inside the
  image before backend compilation.
- Database-backed tests fail because `DATABASE_URL` is missing, points at the
  wrong port, or does not select a database whose name ends in `_test`.
- Compose config output is pasted into logs with real resolved secrets.
- Branch protection expects old CI job names after workflow jobs are renamed.

## Validation Checklist

- Backend validation passes with a real PostgreSQL test database.
- Frontend validation passes without relying on backend internals.
- E2E tests cover the changed browser-visible behavior.
- Docker config and image builds pass from clean source.
- Dependency audit result is reported separately from test/build results.
- Failed, skipped, and not-run checks are reported separately.

## Related Docs

- [Validation Matrix](../validation-matrix.md)
- [Testing Strategy](../testing-strategy.md)
- [Docker Workflow](docker-workflow.md)
- [Database and Prisma Workflow](database-prisma-workflow.md)

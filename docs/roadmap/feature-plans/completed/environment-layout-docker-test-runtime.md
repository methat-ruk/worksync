# Feature Plan: Environment Layout and Docker Test Runtime

Status: Completed

Plan review: approved before implementation; implementation, two focused
review-fix passes, and final CI validation completed on 2026-07-30 with no
remaining blocking findings.

Approved extension: normalize WorkSync-built image and development-container
names, add a no-container image preparation command, replace all local Docker
images, and preserve all existing development volumes

Intended PR: `feat/environment-layout-and-docker-test-runtime`

Milestone: Cross-cutting runtime maintenance; enables Milestone 5

## Goal

Give every environment file one clear runtime owner, remove unused root
environment templates, and add an isolated Docker test runtime that can run
the same application validation boundaries as CI without changing application
behavior or replacing the existing CI jobs.

## Acceptance Criteria

- no tracked or runtime-owned environment file remains at repository root
- frontend local development uses `app/frontend/.env.local`
- backend development and tests retain `app/backend/.env` and
  `app/backend/.env.test`
- full Docker development uses `docker/.env.development`
- Docker tests use only `docker/.env.test` and cannot inherit a host
  development or production database URL
- existing `docker:infra:*` and `docker:full:*` commands remain available
- Docker test commands cover backend validation, frontend validation, standard
  Playwright E2E, and live Playwright E2E
- test containers, networks, and volumes are isolated from development and are
  removed after success, normal failure, SIGINT, or SIGTERM
- existing GitHub Actions application jobs remain authoritative and pass
- no Docker production topology or production secret-loading mechanism is
  introduced

## Target Environment Layout

| Owner | Tracked template | Ignored local file | Consumer |
|---|---|---|---|
| Frontend local | `app/frontend/.env.local.example` | `app/frontend/.env.local` | Next.js development and local build |
| Backend development | `app/backend/.env.example` | `app/backend/.env` | NestJS development, Prisma development, and development seed |
| Backend tests | `app/backend/.env.test.example` | `app/backend/.env.test` | Jest, guarded test migrations, runtime smoke, and live E2E |
| Docker development | `docker/.env.development.example` | `docker/.env.development` | full local Compose mode |
| Docker tests | `docker/.env.test.example` | `docker/.env.test` | isolated Compose test services and runners |

The repository root has no `.env*` template or active env file contract.
Existing ignored root `.env` files are not read, moved, or deleted
automatically.

Local setup copies:

```bash
cp app/frontend/.env.local.example app/frontend/.env.local
cp app/backend/.env.example app/backend/.env
cp app/backend/.env.test.example app/backend/.env.test
cp docker/.env.development.example docker/.env.development
cp docker/.env.test.example docker/.env.test
```

Production backend configuration remains injected at runtime or may use the
already supported controlled-host `app/backend/.env.production` path.
Production Docker configuration is deferred to
`production-deployment-foundation.md`.

## Scope

### Environment ownership

- delete root `.env.example` and `.env.local.example`
- move `.env.docker.example` to `docker/.env.development.example`
- rename `app/frontend/.env.example` to
  `app/frontend/.env.local.example`
- keep backend development and test filenames unchanged
- simplify `.gitignore` so real `.env*` files are ignored and
  `**/.env.example` plus `**/.env.*.example` remain trackable
- narrow `.dockerignore` so no real env file enters the build context and only
  the backend example required by Prisma generation is re-included

### Docker development

- keep `docker/compose.yml` and `docker/compose.app.yml` names and service
  topology unchanged
- update existing full Docker package scripts to pass
  `--env-file docker/.env.development`
- keep infrastructure-only and full-stack command names as compatibility
  contracts
- ensure an obsolete root `.env` is not loaded by documented or package
  commands
- name WorkSync-built application images `worksync-backend:local` and
  `worksync-frontend:local`
- name development containers `worksync-backend`, `worksync-frontend`,
  `worksync-postgres`, `worksync-redis`, and `worksync-minio`
- retain official PostgreSQL, Redis, and MinIO image names because they are
  upstream dependencies rather than WorkSync-built artifacts
- add `pnpm docker:images:prepare` to pull infrastructure dependencies and
  build all four WorkSync development/test targets without creating containers

### Docker test runtime

- add standalone `docker/compose.test.yml`
- add `postgres`, `redis`, `migration-test`, `backend-test`,
  `frontend-test`, and `frontend-e2e` services
- use database `worksync_test`, Redis database 1, no published host ports, no
  explicit `container_name`, and test-only project-scoped volumes
- omit MinIO because the current backend, frontend, and Playwright CI evidence
  does not require it
- use a fixed Compose project name `worksync-test`
- acquire an atomic machine-local lock before Compose inspection so concurrent
  test commands fail clearly rather than sharing resources
- after acquiring the lock, inspect the fixed project:
  - fail if it has running containers
  - otherwise remove stale stopped containers, networks, and disposable
    volumes before creating the new test runtime
- use service `env_file` for test configuration and do not interpolate
  `DATABASE_URL`, `POSTGRES_DB`, credentials, or test Redis URLs from the host
  shell
- use `WORKSYNC_DOCKER_TEST_ENV_FILE` as the service env-file selector; its
  path is relative to `docker/compose.test.yml` and defaults to `.env.test`
- for CI config/build validation, set
  `WORKSYNC_DOCKER_TEST_ENV_FILE=.env.test.example` and pass
  `--env-file docker/.env.test.example`; application values still come from
  the service env file rather than inherited shell variables
- define this minimum Docker test env contract:
  - `NODE_ENV=test`
  - `POSTGRES_DB=worksync_test`
  - `POSTGRES_USER=worksync`
  - `POSTGRES_PASSWORD=worksync`
  - `DATABASE_URL=postgresql://worksync:worksync@postgres:5432/worksync_test?schema=public`
  - `TEST_REDIS_URL=redis://redis:6379/1`
  - `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000`
  - `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=false`
- before any Compose mutation, parse the selected test env file without
  mutating `process.env` and require:
  - `NODE_ENV=test`
  - a PostgreSQL `DATABASE_URL`
  - host exactly `postgres`
  - database name ending in `_test`
  - `POSTGRES_DB` equal to the parsed database name
- reuse the existing database URL parser and test-database guard instead of
  duplicating their rules

### Test images and orchestration

- add a reusable Dockerfile test-runner target containing source and
  development dependencies
- add a Playwright test target that installs the repository-pinned Chromium
  version and required system dependencies
- do not add a new base-image dependency solely for Playwright
- add an async Node orchestrator using `spawn` with `shell: false` and fixed
  argument arrays
- support only `all`, `backend`, `frontend`, and `e2e` scopes
- build only the targets required by the selected scope
- start only the required dependency services
- apply guarded test migrations before backend and live E2E execution
- propagate the first non-zero child exit
- on SIGINT or SIGTERM, stop the active child, run Compose cleanup, then return
  the appropriate exit code
- make cleanup single-flight so signal handling and `finally` cannot race or
  run destructive lifecycle commands twice
- release only the lock owned by the current process in `finally`; an older
  process must not remove a replacement lock created during manual recovery
- always run `down --volumes --remove-orphans` in `finally`; render cleanup
  with the tracked `.env.test.example` so recovery still works when the local
  file is missing, deleted, or malformed
- never call reset commands and never address development Compose resources
- keep test diagnostics in process output for this slice; host artifact mounts
  are deferred to avoid cross-platform ownership and path complexity
- structure orchestration around an injected process runner so the self-test
  can prove command order, scope selection, first-failure propagation,
  single-flight cleanup, signal cleanup, and unknown-scope rejection without
  starting Docker

### Developer commands

Keep:

- `pnpm docker:infra:config`
- `pnpm docker:infra:up`
- `pnpm docker:infra:down`
- `pnpm docker:full:config`
- `pnpm docker:full:services`
- `pnpm docker:full:build`
- `pnpm docker:full:up`
- `pnpm docker:full:down`

Add:

- `pnpm docker:images:prepare`
- `pnpm docker:test:config`
- `pnpm docker:test:backend`
- `pnpm docker:test:frontend`
- `pnpm docker:test:e2e`
- `pnpm docker:test`
- `pnpm docker:test:down`
- `pnpm test:docker-orchestration`

No command accepts arbitrary Compose, shell, or test-runner arguments.

### CI and documentation

- preserve `Backend validation`, `Frontend validation`, `Frontend E2E`,
  `PR review evidence`, and `Dependency audit` execution paths
- extend `Container topology and images` to:
  - validate development infrastructure, full development, and test Compose
    models with tracked examples
  - assert exact service lists
  - run the Docker orchestration self-test
  - build backend, frontend, generic test-runner, and Playwright test targets
- increase the container job timeout from 20 to 30 minutes
- do not run the full Docker test suites again in CI
- add `docker/README.md` as the near-code run-mode and recovery guide
- update README, project setup, deployment, validation matrix, Docker workflow,
  WorkSync deployment/workflow references, and relevant completed-plan
  supersession notes
- add this plan to a separate Maintenance Plans section in the feature-plan
  index so product milestone order is unchanged

## Out of Scope

- production Compose, Kubernetes, cloud, ingress, TLS, registry promotion, or
  secret-store selection
- replacement or consolidation of existing GitHub Actions jobs
- schema, migrations, seed behavior, database reset behavior, or persistent
  application data changes
- business logic, authentication, authorization, API, frontend UI, or user
  workflow changes
- dependency or toolchain upgrades
- host-mounted Docker test reports
- automatic deletion or migration of any ignored local env file

## Affected Surfaces and Stable Guarantees

| Surface | Relationship | Stable guarantee |
|---|---|---|
| Next.js local environment | Direct | browser-safe variables still come from the frontend-owned local file |
| NestJS and Prisma env selection | Coupled | existing development, test, and production selection remains unchanged |
| Docker development | Direct | current ports, service names, volumes, health checks, and browser/container addressing remain unchanged |
| Backend and frontend validation | Coupled | canonical validation commands and expected results remain unchanged |
| Playwright E2E | Coupled | standard and live suites retain current behavior and test database guard |
| CI container job | Operational | adds topology/build evidence without replacing authoritative test jobs |
| Production deployment plan | Adjacent | remains the sole owner of production topology and secret delivery |

Any discovered application behavior, schema, production topology, auth,
security-boundary, or CI job-ownership change requires re-planning.

## Security and Data Boundary

- real env files and secrets remain ignored and outside image layers
- resolved Compose output is treated as sensitive; CI uses `config --quiet`
  and service-list output only
- test database selection fails before a container starts if the URL is not
  PostgreSQL, the host is not `postgres`, the database lacks `_test`, or
  `POSTGRES_DB` disagrees
- inherited shell values must not override test-critical env-file values
- `down --volumes` is scoped only to the `worksync-test` project
- development PostgreSQL, Redis, and MinIO volumes must never be removed by
  test commands
- example credentials are local/test-only and cannot be described as
  production-ready

## Ordered Implementation

1. Add pure environment-file parsing and Docker test-target guard coverage
   without changing existing backend env loading.
2. Move and rename tracked templates; update ignore rules and verify the
   target inventory.
3. Repoint existing Docker development scripts and validate resolved
   development Compose behavior.
4. Add Docker test targets and the isolated test Compose model.
5. Add the async orchestrator, fixed-scope package commands, cleanup behavior,
   and orchestration self-test.
6. Update the CI container job without changing application validation jobs.
7. Update near-code and project documentation, migration notes, references,
   and plan index.
8. Run iterative targeted checks.
9. Apply the Post-Implementation Review Gate to the complete working-tree diff:
   coding standards, refactor equivalence, Docker/local-run-mode behavior,
   operational drift, secret handling, data-target safety, and test evidence.
10. Fix or explicitly disposition findings, re-review affected areas, then run
    the final validation matrix.

## Required Evidence

| Changed guarantee | Evidence |
|---|---|
| root has no env ownership | tracked-file inventory, stale-reference search, and ignore-rule checks |
| frontend uses `.env.local` | frontend development/build smoke with frontend-owned values |
| backend env behavior is unchanged | database environment self-test, backend validation, migration status, and runtime smoke |
| Docker development is equivalent | infrastructure/full config, exact services, image builds, actual startup, health/reachability, logs, and shutdown |
| test DB cannot be confused with dev/prod | guard unit/self-tests for inherited shell values, wrong host, wrong suffix, and DB-name mismatch |
| Docker test lifecycle is isolated | successful and forced-failure runs plus container/network/volume inspection |
| Docker test coverage matches selected CI boundaries | scoped backend, frontend, standard E2E, live E2E, and combined runs |
| orchestration failure and cleanup are correct | injected-runner self-test covering scope selection, first failure, cleanup, and signals |
| CI contract remains stable | unchanged named application jobs plus updated container job and dependency audit |
| docs and commands agree | link/path/command search and manual quick-start walkthrough |

Final validation includes:

- `git diff --check`
- `pnpm test:database-environment`
- `pnpm test:docker-orchestration`
- `pnpm validate:backend`
- `pnpm validate:frontend`
- existing host frontend E2E
- all development and test Compose config/service checks
- backend, frontend, generic test-runner, and Playwright test image builds
- each scoped Docker test command and the combined `pnpm docker:test`
- full Docker development startup, health, logs, and shutdown
- production dependency audit before CI handoff
- all GitHub Actions checks after push

## Failure, Recovery, and Rollback

- missing env file: fail before Compose starts and print the required
  template-copy command
- unsafe test database target: fail before any container or migration action
- concurrent Docker test command: fail on the atomic machine-local lock before
  Compose inspection or mutation
- active `worksync-test` project: fail without cleanup so stale or externally
  managed runtime resources are never terminated implicitly
- stale but stopped `worksync-test` project: remove only its disposable
  resources before starting
- test/build failure: preserve the first failure code, perform test-project
  cleanup, and report cleanup failure separately
- SIGINT/SIGTERM: terminate the active child, clean the test project, and exit
  without touching development resources
- stale root `.env`: ignored and unused; documentation explains manual removal
- implementation regression: revert the source commit and restore old tracked
  template/script paths; ignored local files remain recoverable and untouched
- cleanup recovery: `pnpm docker:test:down` verifies the recorded owner is no
  longer running, reacquires the same lock before Compose mutation, and aborts
  if a new run wins the recovery race

## Alternatives and Decision

### Layout-only PR plus separate Docker test PR

Smaller and easier to review, but rejected by explicit user choice. The
combined PR must therefore retain strict non-goals and separate review/evidence
sections for layout equivalence and the new test capability.

### Host tests with Docker dependencies

Simpler and already close to current CI, but rejected because the selected goal
requires portable container test runners.

### Replace or duplicate CI jobs with Docker runners

Rejected. It either weakens failure ownership or adds expensive duplicate test
execution. Existing CI jobs remain authoritative while the container job
protects topology, orchestration, and build drift.

### Add Docker production files now

Rejected until deployment target, secret store, ingress, persistence,
promotion, and recovery decisions belong to an approved production deployment
plan.

## Dependencies and Assumptions

- current merged database-environment isolation remains the baseline
- Docker Compose v2 and BuildKit are available for runtime evidence
- the Playwright version remains sourced from the locked workspace dependency
- local developers explicitly create Docker env files from tracked templates
- production dependency audit and CI remain required merge evidence
- the user accepts the larger combined PR boundary

## Approval and Re-plan Triggers

Implementation requires explicit approval of this reviewed plan.

Stop and re-plan if:

- a production topology or real secret-delivery mechanism becomes required
- a test needs application schema or business behavior changes
- safe test isolation cannot be achieved without changing development
  persistence
- existing CI jobs must be replaced, merged, or made optional
- Playwright requires an unplanned external image or dependency upgrade
- Docker runtime evidence cannot be collected and the missing evidence cannot
  be accepted safely

## Done Criteria

- the target layout and command contracts are implemented
- no root env contract or stale reference remains
- backend and frontend host behavior is preserved
- Docker development behavior is equivalent
- Docker test runners pass at every selected boundary and clean up safely
- post-implementation findings are fixed or explicitly dispositioned
- final validation covers the reviewed result
- production dependency audit and all CI checks pass
- the plan is moved to `completed` with evidence and remaining follow-up

## Local Implementation Evidence

Collected on 2026-07-30:

- environment inventory and stale-reference searches confirm that active root
  env ownership is removed; historical move/rename text remains only in this
  plan
- database environment and Docker orchestration self-tests pass, including
  inherited-shell isolation, unsafe database rejection, scope ordering,
  active-project protection, first-failure precedence, single-flight cleanup,
  and signal cleanup
- infrastructure, full development, and isolated test Compose models render;
  exact development and test service lists match the planned topology
- isolated frontend validation passes with 5 shared-policy tests and 117
  frontend tests plus typecheck, lint, and production build
- isolated backend validation applies all 5 migrations to `worksync_test` and
  passes 32 suites / 183 tests, typecheck, lint, build, and artifact validation
- isolated E2E validation passes 20 standard Playwright tests and 3 live
  Playwright tests
- host test migration deploy/status reports all 5 migrations applied, backend
  runtime smoke passes health/docs/auth contracts, and host Playwright repeats
  the same 20 standard plus 3 live tests successfully
- the combined Docker test command passes all scopes and leaves no
  `worksync-test` containers or volumes
- full Docker development builds both production targets, reaches healthy
  status for all 5 services, returns HTTP 200 from backend and frontend, shows
  no startup error in inspected logs, and shuts down without deleting
  persistent development volumes
- production dependency audit reports no known vulnerabilities
- `git diff --check`, JavaScript syntax checks, and stale contract searches
  pass
- all 10 pre-existing Docker images were removed only after verifying that no
  containers existed; the three development volumes remained unchanged
- `pnpm docker:images:prepare` restored the three pinned upstream dependencies
  and built `worksync-backend:local`, `worksync-frontend:local`,
  `worksync-test-runner:local`, and `worksync-test-e2e:local`
- final Docker inventory contains no legacy `docker-*`, `:ci`, or `:debug`
  image tags, no containers, and all three preserved development volumes

Post-implementation validation exposed an existing runtime-smoke drift:
the smoke child process did not translate the isolated `TEST_REDIS_URL` into
the backend runtime's required `REDIS_URL`. The script now applies the same
explicit test-Redis mapping as live E2E, and the rerun passes.

The infrastructure-only Compose file intentionally remains env-free because it
contains no interpolated application configuration. Only full Docker
development requires `docker/.env.development`; this preserves the existing
hybrid quick-start contract without creating a meaningless env-file
dependency.

GitHub Actions passed all six jobs on commit `912ecf2`. A follow-up PR review
then demonstrated that two invocations could both pass the non-atomic
active-project check before either started containers. The focused fix adds an
atomic machine-local lock, owner-token-safe release, regression coverage, and
corrected root-env/recovery documentation; all six CI jobs passed again on
commit `754e487`. Re-review then found that `docker:test:down` could clear a
new run's lock while recovery was in progress. The second focused fix makes
recovery refuse a live owner, take ownership before Compose cleanup, and fail
without mutation if a competing run wins. All six jobs passed for commit
`400df16` in GitHub Actions run `30529029822`; the closeout condition is
satisfied and this plan is complete.

## Follow-up

- production environment and secret delivery through
  `production-deployment-foundation`
- host-mounted or uploaded Docker test artifacts only if real debugging
  friction justifies the cross-platform complexity

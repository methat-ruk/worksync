# WorkSync Validation Matrix

This matrix defines the expected repository commands for local development and CI.

## Local Setup

```bash
corepack enable
corepack pnpm install --frozen-lockfile
cp app/frontend/.env.local.example app/frontend/.env.local
cp app/backend/.env.example app/backend/.env
cp app/backend/.env.test.example app/backend/.env.test
pnpm docker:infra:up
pnpm prisma:validate
pnpm prisma:generate
pnpm prisma:migrate
pnpm dev
```

Create and migrate `worksync_test` once for a fresh PostgreSQL volume by
following `docs/project-setup.md`.

## Required Checks

| Check | Command | Purpose |
|---|---|---|
| Complete backend validation | `pnpm validate:backend` | Validate Prisma, backend static checks, all backend test projects, build output, and runtime artifact shape |
| Backend artifact | `pnpm validate:backend:artifact` | Require `dist/main.js` and compiled Prisma client while rejecting tests and nested source output |
| Test migration deploy | `pnpm prisma:migrate:deploy:test` | Apply committed migrations using the guarded `DATABASE_URL` selected for tests |
| Test migration status | `pnpm prisma:migrate:status:test` | Verify `worksync_test` has every committed migration using the guarded test environment |
| Development reset target | `pnpm prisma:reset:dev --check` | Validate the local `worksync` reset target without changing data |
| Test reset target | `pnpm prisma:reset:test --check` | Validate the local `_test` reset target without changing data |
| Backend runtime smoke | `pnpm smoke:backend:runtime` | Start the built backend against `worksync_test` and verify health, Swagger, disabled Google OAuth, and refresh failure contracts |
| Typecheck | `pnpm typecheck` | Validate TypeScript contracts across workspaces |
| Lint | `pnpm lint` | Enforce static quality and framework rules across backend source, backend tests, and frontend source |
| Test | `pnpm test` | Run configured automated tests |
| Backend unit tests | `pnpm --filter @worksync/backend test:unit` | Validate configuration, errors, correlation, logging policy, and health logic |
| Backend integration tests | `pnpm --filter @worksync/backend test:integration` | Validate Prisma lifecycle, PostgreSQL connectivity, real-MinIO streaming/object cleanup, Google identity linking, transaction rollback, and uniqueness races |
| Backend contract tests | `pnpm --filter @worksync/backend test:contract` | Validate API envelopes, status codes, DTO validation, and Swagger/OpenAPI contracts |
| Backend security tests | `pnpm --filter @worksync/backend test:security` | Validate access/refresh controls plus Google state, replay, generic failure, and sensitive-data handling |
| Backend API tests | `pnpm --filter @worksync/backend test:e2e` | Validate health, readiness, error, validation, correlation, and route-prefix contracts |
| Build | `pnpm build` | Produce frontend and backend build artifacts |
| Infrastructure Compose config | `docker compose -f docker/compose.yml config` | Validate the infrastructure-only topology for hybrid development |
| Full Compose config | `pnpm docker:full:config` | Validate the combined infrastructure/application topology with `docker/.env.development` |
| Full Compose services | `pnpm docker:full:services` | Confirm the full topology declares frontend, backend, PostgreSQL, Redis, and MinIO |
| Test Compose config | `pnpm docker:test:config` | Validate the guarded Docker test environment and isolated topology |
| Docker test orchestration | `pnpm test:docker-orchestration` | Verify fail-fast scope ordering, active-project protection, and cleanup error precedence |
| Isolated Docker tests | `pnpm docker:test` | Run migrations plus backend, frontend, standard E2E, and live E2E validation in disposable containers |
| Container build | `pnpm docker:full:build` | Build frontend and backend image targets |
| Image preparation | `pnpm docker:images:prepare` | Pull infrastructure dependencies and build all named development/test images without creating containers |
| Prisma generate | `pnpm prisma:generate` | Validate Prisma schema and generated client |
| Prisma validate | `pnpm prisma:validate` | Validate Prisma schema syntax and relation consistency |
| Dependency audit | `pnpm setup:audit && pnpm test:audit-production && pnpm audit:production` | Pinned OSV scan; require full production coverage; fail on moderate-or-higher/unknown severity or incomplete scans |
| Docker infrastructure services | `pnpm docker:infra:up` | Start local PostgreSQL, Redis, and S3-compatible storage |

## Validation Layers

| Layer | Command or trigger | Scope |
|---|---|---|
| Local targeted validation | Repository scripts selected for the changed surface | Fast feedback while implementing |
| Pre-commit hook | `.husky/pre-commit` | Select `.nvmrc` Node.js, then run `pnpm lint:staged` for staged TypeScript files |
| Pre-push hook | `.husky/pre-push` | Select `.nvmrc` Node.js, then run `pnpm validate:push` for typecheck, lint, and backend unit tests |
| CI backend job | Pull requests and pushes to `main` | PostgreSQL, Redis, and MinIO-backed backend validation, migrations, build, and artifact checks |
| CI frontend job | Pull requests and pushes to `main` | Shared auth policy tests, frontend typecheck, lint, tests, and production build |
| CI frontend E2E job | Pull requests and pushes to `main` | Production-build runtime compatibility on Chromium, Firefox, and WebKit plus mocked and live Playwright evidence for critical auth, navigation, project, and task behavior |
| CI container job | Pull requests and pushes to `main` | Development/test Compose topology, orchestration self-test, and production/test image target builds |
| CI security job | Pull requests and pushes to `main` | Production dependency audit |

Git hooks use `scripts/run-with-project-node.sh` so GUI clients and parent
shells cannot silently run them with a different Node.js major. The launcher
uses an already-installed `fnm` or `nvm` runtime and fails closed when the
version in `.nvmrc` is unavailable. Hooks still provide local feedback and can
be bypassed; CI remains the authoritative merge gate.
If branch protection uses required check names, keep it aligned with the split
CI jobs: `Backend validation`, `Frontend validation`, `Frontend E2E`,
`Container topology and images`, and `Dependency audit`.

## Current Limitations

- Frontend validation includes shared password-policy tests, Vitest component
  tests, and production build. Playwright runtime compatibility, mocked E2E,
  and live E2E run in the separate frontend E2E CI job.
- Required backend PostgreSQL integration and security evidence is incomplete
  when the test `DATABASE_URL` is unavailable or the database-backed suite
  cannot run.
- `docker/compose.yml` is the hybrid-development infrastructure topology.
- `docker/compose.app.yml` is a local/staging-like application overlay for
  full Docker mode; it is not a production deployment manifest.
- `docker/compose.test.yml` is a disposable validation topology and is not a
  production or staging deployment manifest.

`pnpm validate:backend` must run with `DATABASE_URL` targeting the CI test
database so the PostgreSQL integration project passes rather than connecting
to development or skipping.
Auth rate-limit validation must run with Redis configuration available when the
Redis-backed limiter path is in scope. Use `TEST_REDIS_URL` for isolated test
Redis databases and never log raw limiter keys, emails, cookies, or tokens.
Attachment integration validation additionally requires the configured private
MinIO endpoint. The attachment reconciler is dry-run by default; use
`pnpm --filter @worksync/backend attachments:reconcile -- --apply` only in an
authorized environment with a reviewed schedule and recovery owner.
Local MinIO evidence does not satisfy the AWS production-release gate. Record
an authorized AWS staging upload/read/delete smoke separately before release;
the 2026-09-03 validation intentionally did not access a live AWS environment.

## Next Validation Upgrades

1. Extend Playwright coverage as comments, notifications, files, and jobs are
   implemented.
2. Add registry publishing, SBOM/provenance, and immutable image promotion.

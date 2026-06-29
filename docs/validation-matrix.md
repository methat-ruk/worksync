# WorkSync Validation Matrix

This matrix defines the expected repository commands for local development and CI.

## Local Setup

```bash
corepack enable
corepack pnpm install --frozen-lockfile
cp .env.local.example .env
cp app/frontend/.env.example app/frontend/.env.local
cp app/backend/.env.example app/backend/.env
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
| Test migration status | `pnpm prisma:migrate:status:test` | Verify `worksync_test` has every committed migration using `TEST_DATABASE_URL` |
| Backend runtime smoke | `pnpm smoke:backend:runtime` | Start the built backend against `worksync_test` and verify health, Swagger, disabled Google OAuth, and refresh failure contracts |
| Typecheck | `pnpm typecheck` | Validate TypeScript contracts across workspaces |
| Lint | `pnpm lint` | Enforce static quality and framework rules across backend source, backend tests, and frontend source |
| Test | `pnpm test` | Run configured automated tests |
| Backend unit tests | `pnpm --filter @worksync/backend test:unit` | Validate configuration, errors, correlation, logging policy, and health logic |
| Backend integration tests | `pnpm --filter @worksync/backend test:integration` | Validate Prisma lifecycle, PostgreSQL connectivity, Google identity linking, transaction rollback, and uniqueness races |
| Backend contract tests | `pnpm --filter @worksync/backend test:contract` | Validate API envelopes, status codes, DTO validation, and Swagger/OpenAPI contracts |
| Backend security tests | `pnpm --filter @worksync/backend test:security` | Validate access/refresh controls plus Google state, replay, generic failure, and sensitive-data handling |
| Backend API tests | `pnpm --filter @worksync/backend test:e2e` | Validate health, readiness, error, validation, correlation, and route-prefix contracts |
| Build | `pnpm build` | Produce frontend and backend build artifacts |
| Infrastructure Compose config | `docker compose -f docker/compose.yml config` | Validate the infrastructure-only topology for hybrid development |
| Full Compose config | `docker compose --env-file .env -f docker/compose.yml -f docker/compose.app.yml config` | Validate the combined infrastructure/application topology with the root env file |
| Full Compose services | `docker compose --env-file .env -f docker/compose.yml -f docker/compose.app.yml config --services` | Confirm the full topology declares frontend, backend, PostgreSQL, Redis, and MinIO |
| Container build | `pnpm docker:full:build` | Build frontend and backend image targets |
| Prisma generate | `pnpm prisma:generate` | Validate Prisma schema and generated client |
| Prisma validate | `pnpm prisma:validate` | Validate Prisma schema syntax and relation consistency |
| Dependency audit | `pnpm audit --prod --audit-level moderate` | Fail on moderate-, high-, or critical-severity production dependency findings |
| Docker infrastructure services | `pnpm docker:infra:up` | Start local PostgreSQL, Redis, and S3-compatible storage |

## Validation Layers

| Layer | Command or trigger | Scope |
|---|---|---|
| Local targeted validation | Repository scripts selected for the changed surface | Fast feedback while implementing |
| Pre-commit hook | `pnpm lint:staged` | ESLint on staged backend and frontend TypeScript files |
| Pre-push hook | `pnpm validate:push` | Typecheck, lint, and backend unit tests |
| CI | Pull requests and pushes to `main` | Database migrations, complete backend validation, frontend validation, build artifacts, and dependency audit |

Git hooks provide local feedback and can be bypassed. CI remains the authoritative merge gate.

## Current Limitations

- Frontend validation includes shared password-policy tests, Vitest component
  tests, production build, and Playwright authentication E2E.
- Required backend PostgreSQL integration and security evidence is incomplete
  when `TEST_DATABASE_URL` is unavailable or the database-backed suite skips.
- `docker/compose.yml` is the hybrid-development infrastructure topology.
- `docker/compose.app.yml` is a local/staging-like application overlay for
  full Docker mode; it is not a production deployment manifest.

`pnpm validate:backend` must run with `TEST_DATABASE_URL` in CI so the
PostgreSQL integration project passes rather than skips.
Auth rate-limit validation must run with Redis configuration available when the
Redis-backed limiter path is in scope. Use `TEST_REDIS_URL` for isolated test
Redis databases and never log raw limiter keys, emails, cookies, or tokens.

## Next Validation Upgrades

1. Extend Playwright coverage as workspace and task flows are implemented.
3. Add security isolation tests for workspace boundaries and RBAC.
4. Add registry publishing, SBOM/provenance, and immutable image promotion.

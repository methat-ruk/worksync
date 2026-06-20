# WorkSync Validation Matrix

This matrix defines the expected repository commands for local development and CI.

## Local Setup

```bash
corepack enable
pnpm install
cp .env.example .env
cp app/frontend/.env.example app/frontend/.env.local
cp app/backend/.env.example app/backend/.env
pnpm docker:up
pnpm prisma:validate
pnpm prisma:generate
pnpm prisma:migrate
pnpm dev
```

## Required Checks

| Check | Command | Purpose |
|---|---|---|
| Complete backend validation | `pnpm validate:backend` | Validate Prisma, backend static checks, all backend test projects, build output, and runtime artifact shape |
| Backend artifact | `pnpm validate:backend:artifact` | Require `dist/main.js` and compiled Prisma client while rejecting tests and nested source output |
| Typecheck | `pnpm typecheck` | Validate TypeScript contracts across workspaces |
| Lint | `pnpm lint` | Enforce static quality and framework rules |
| Test | `pnpm test` | Run configured automated tests |
| Backend unit tests | `pnpm --filter @worksync/backend test:unit` | Validate configuration, errors, correlation, logging policy, and health logic |
| Backend integration tests | `pnpm --filter @worksync/backend test:integration` | Validate Prisma lifecycle and PostgreSQL connectivity through `TEST_DATABASE_URL` |
| Backend contract tests | `pnpm --filter @worksync/backend test:contract` | Validate API envelopes, status codes, DTO validation, and Swagger/OpenAPI contracts |
| Backend security tests | `pnpm --filter @worksync/backend test:security` | Validate access/refresh rejection, rotation and reuse handling, session revocation, generic credential failures, and sensitive-data handling |
| Backend API tests | `pnpm --filter @worksync/backend test:e2e` | Validate health, readiness, error, validation, correlation, and route-prefix contracts |
| Build | `pnpm build` | Produce frontend and backend build artifacts |
| Prisma generate | `pnpm prisma:generate` | Validate Prisma schema and generated client |
| Prisma validate | `pnpm prisma:validate` | Validate Prisma schema syntax and relation consistency |
| Dependency audit | `pnpm audit --prod --audit-level moderate` | Fail on moderate-, high-, or critical-severity production dependency findings |
| Docker services | `pnpm docker:up` | Start local PostgreSQL, Redis, and S3-compatible storage |

## Validation Layers

| Layer | Command or trigger | Scope |
|---|---|---|
| Local targeted validation | Repository scripts selected for the changed surface | Fast feedback while implementing |
| Pre-commit hook | `pnpm lint:staged` | ESLint on staged backend and frontend TypeScript files |
| Pre-push hook | `pnpm validate:push` | Typecheck, lint, and backend unit tests |
| CI | Pull requests and pushes to `main` | Database migrations, complete backend validation, frontend validation, build artifacts, and dependency audit |

Git hooks provide local feedback and can be bypassed. CI remains the authoritative merge gate.

## Current Limitations

- Frontend tests remain a placeholder until the frontend test harness is configured.
- Backend PostgreSQL integration tests skip when `TEST_DATABASE_URL` is unavailable.
- Docker Compose validates local dependencies only; it is not a production deployment manifest.

`pnpm validate:backend` must run with `TEST_DATABASE_URL` in CI so the
PostgreSQL integration project passes rather than skips.

## Next Validation Upgrades

1. Add protected-resource API contract tests with the authentication module.
2. Add Playwright E2E smoke tests for authentication and task flows.
3. Add security isolation tests for workspace boundaries and RBAC.
4. Add Docker image builds when runtime Dockerfiles are introduced.

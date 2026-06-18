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
| Typecheck | `pnpm typecheck` | Validate TypeScript contracts across workspaces |
| Lint | `pnpm lint` | Enforce static quality and framework rules |
| Test | `pnpm test` | Run configured automated tests |
| Backend unit tests | `pnpm --filter @worksync/backend test:unit` | Validate configuration, errors, correlation, logging policy, and health logic |
| Backend integration tests | `pnpm --filter @worksync/backend test:integration` | Validate Prisma lifecycle and PostgreSQL connectivity through `TEST_DATABASE_URL` |
| Backend API tests | `pnpm --filter @worksync/backend test:e2e` | Validate health, readiness, error, validation, and correlation contracts |
| Build | `pnpm build` | Produce frontend and backend build artifacts |
| Prisma generate | `pnpm prisma:generate` | Validate Prisma schema and generated client |
| Prisma validate | `pnpm prisma:validate` | Validate Prisma schema syntax and relation consistency |
| Dependency audit | `pnpm audit --prod --audit-level moderate` | Fail on moderate-, high-, or critical-severity production dependency findings |
| Docker services | `pnpm docker:up` | Start local PostgreSQL, Redis, and S3-compatible storage |

## Current Limitations

- Frontend tests remain a placeholder until the frontend test harness is configured.
- Backend PostgreSQL integration tests skip when `TEST_DATABASE_URL` is unavailable.
- Docker Compose validates local dependencies only; it is not a production deployment manifest.

## Next Validation Upgrades

1. Add protected-resource API contract tests with the authentication module.
2. Add Playwright E2E smoke tests for authentication and task flows.
3. Add security isolation tests for workspace boundaries and RBAC.
4. Add Docker image builds when runtime Dockerfiles are introduced.

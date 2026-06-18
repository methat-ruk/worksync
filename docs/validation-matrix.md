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
| Build | `pnpm build` | Produce frontend and backend build artifacts |
| Prisma generate | `pnpm prisma:generate` | Validate Prisma schema and generated client |
| Prisma validate | `pnpm prisma:validate` | Validate Prisma schema syntax and relation consistency |
| Dependency audit | `pnpm audit --prod --audit-level moderate` | Fail on moderate-, high-, or critical-severity production dependency findings |
| Docker services | `pnpm docker:up` | Start local PostgreSQL, Redis, and S3-compatible storage |

## Current Limitations

- Frontend and backend test commands are placeholders until the first test harnesses are configured.
- Test commands currently verify command wiring only until the first real test harnesses are configured.
- Docker Compose validates local dependencies only; it is not a production deployment manifest.

## Next Validation Upgrades

1. Add unit and integration test runners.
2. Add API contract tests once the first protected API module exists.
3. Add Playwright E2E smoke tests for authentication and task flows.
4. Add security isolation tests for workspace boundaries and RBAC.
5. Add Docker image builds when runtime Dockerfiles are introduced.

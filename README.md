# WorkSync

WorkSync is a full-stack team collaboration platform for workspaces, projects, tasks, comments, mentions, notifications, file uploads, background jobs, activity logs, and role-based access control.

The product is inspired by tools such as Jira, Trello, and Linear, but the implementation is being built from a project-specific domain model and engineering foundation.

## Status

WorkSync is in the foundation and early implementation phase.

Already in place:

- frontend and backend application skeletons
- Prisma schema and initial migration baseline
- validated backend configuration and centralized Prisma lifecycle
- structured request logging, correlation IDs, and standardized API errors
- liveness and PostgreSQL readiness endpoints
- backend unit, PostgreSQL integration, API contract, security, and API test suites
- local service topology for PostgreSQL, Redis, and S3-compatible storage
- CI workflow and repository validation commands
- password authentication with persisted session lifecycle, refresh rotation, and logout controls
- backend Google OAuth login with PKCE, safe identity linking, and the existing session lifecycle
- frontend password/Google auth flows, protected routing, and browser E2E coverage
- multi-target Docker image definitions for frontend and backend
- product, domain, API, security, testing, deployment, and workflow documentation

Not complete yet:

- workspace membership implementation
- RBAC and workspace isolation enforcement
- production deployment pipeline and registry promotion
- production observability and incident-response automation

## Tech Stack

| Area | Technology |
|---|---|
| Frontend | Next.js App Router, React, TypeScript |
| UI | Tailwind CSS and shadcn/ui |
| Backend | NestJS, TypeScript |
| Data | PostgreSQL, Prisma |
| Cache | Redis local service; application integration pending |
| Queue | BullMQ planned |
| Realtime | Socket.IO planned |
| Storage | MinIO local service; AWS S3 integration planned |
| API Docs | Swagger / OpenAPI |
| Runtime | Docker, Docker Compose |
| Package Manager | pnpm via Corepack |

## Repository Structure

```text
app/
  frontend/        Next.js application
  backend/         NestJS API and Prisma schema
docs/              product and engineering documentation
  workflows/       project workflow guides for CI, Docker, database, auth, and API behavior
docker/            local runtime services
references/        WorkSync project profile and implementation decisions
.github/           CI workflow
```

## Prerequisites

- Node.js 22 LTS
- Corepack
- Docker and Docker Compose
- Git

This repository uses `pnpm@11.13.1` through Corepack.

## Quick Start

Enable Corepack and install the locked dependencies:

```bash
corepack enable
corepack pnpm install --frozen-lockfile
```

Install the local Playwright browser once if you will run frontend E2E tests or
browser-visible checks:

```bash
corepack pnpm playwright:install
```

On Linux, containers, or CI-like hosts missing system libraries, use:

```bash
corepack pnpm playwright:install:with-deps
```

Create local environment files for the recommended hybrid development mode:

```bash
cp .env.local.example .env
cp app/frontend/.env.example app/frontend/.env.local
cp app/backend/.env.example app/backend/.env
cp app/backend/.env.test.example app/backend/.env.test
```

On Windows PowerShell:

```powershell
Copy-Item .env.local.example .env
Copy-Item app/frontend/.env.example app/frontend/.env.local
Copy-Item app/backend/.env.example app/backend/.env
Copy-Item app/backend/.env.test.example app/backend/.env.test
```

Start local services and prepare Prisma:

```bash
corepack pnpm docker:infra:up
corepack pnpm prisma:validate
corepack pnpm prisma:generate
corepack pnpm prisma:migrate
corepack pnpm seed:auth-user
```

Start the applications:

```bash
corepack pnpm dev
```

See [Project Setup](docs/project-setup.md) for creating and migrating the test
database, Windows commands, validation, and troubleshooting.

Default local URLs:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`
- Backend health check: `http://localhost:4000/health`
- Backend liveness check: `http://localhost:4000/health/live`
- Backend readiness check: `http://localhost:4000/health/ready`
- Swagger docs: `http://localhost:4000/docs`
- Business API base URL: `http://localhost:4000/api`

## Run Modes

WorkSync supports two local run modes.

### Hybrid development mode

Use this mode for normal feature work. Docker runs only infrastructure
services, while Next.js and NestJS run locally through pnpm for faster feedback
and easier debugging.

```bash
cp .env.local.example .env
corepack pnpm install --frozen-lockfile
docker compose -f docker/compose.yml up -d
corepack pnpm dev
```

Hybrid URLs:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`
- PostgreSQL: `localhost:5433`
- Redis: `localhost:6379`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`

If `localhost:5433` is already used by another local service, change
the host port in `docker/compose.yml` and the matching localhost database URLs
in your uncommitted `.env` files together.

### Full Docker mode

Use this mode to verify the container topology or onboard from a fresh clone.
Docker runs frontend, backend, PostgreSQL, Redis, and MinIO on the same Compose
network. The backend uses service hostnames such as `postgres`, `redis`, and
`minio`; browser-facing frontend variables still use localhost because the
browser runs on the host machine.

```bash
cp .env.docker.example .env
docker compose --env-file .env -f docker/compose.yml -f docker/compose.app.yml up --build -d
```

Full Docker URLs exposed to the host:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`
- PostgreSQL: `localhost:5433`
- Redis: `localhost:6379`
- MinIO API: `http://localhost:9000`

The example JWT secrets are local-only. Replace them before any shared,
staging, production-like, or internet-exposed environment.

## Available Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Start frontend and backend in development mode |
| `pnpm dev:frontend` | Start only the frontend |
| `pnpm dev:backend` | Start only the backend |
| `pnpm lint:staged` | Run ESLint on staged TypeScript files through the pre-commit hook |
| `pnpm typecheck` | Run TypeScript checks across workspaces |
| `pnpm lint` | Run frontend and backend lint checks |
| `pnpm test` | Run configured test scripts |
| `pnpm --filter @worksync/backend test:unit` | Run backend unit tests |
| `pnpm --filter @worksync/backend test:integration` | Run backend PostgreSQL integration tests |
| `pnpm --filter @worksync/backend test:contract` | Run backend API and Swagger contract tests |
| `pnpm --filter @worksync/backend test:security` | Run backend authentication security tests |
| `pnpm --filter @worksync/backend test:e2e` | Run backend API contract and E2E tests |
| `pnpm build` | Build frontend and backend |
| `pnpm check` | Run typecheck, lint, test, and build |
| `pnpm prisma:validate` | Validate the Prisma schema |
| `pnpm prisma:generate` | Generate Prisma Client |
| `pnpm prisma:migrate` | Apply local Prisma migrations |
| `pnpm prisma:migrate:deploy:test` | Apply committed migrations to the guarded test database |
| `pnpm prisma:migrate:status:test` | Verify committed migrations against the guarded test database |
| `pnpm prisma:reset:dev` | Interactively reset only the local `worksync` development database |
| `pnpm prisma:reset:test` | Interactively reset only a local database whose name ends in `_test` |
| `pnpm seed:auth-user` | Upsert the local development password-login seed user |
| `pnpm seed:auth-user:test` | Upsert the password-login seed user in the guarded test database |
| `pnpm validate:backend` | Run complete backend validation including artifact checks |
| `pnpm validate:backend:artifact` | Validate the compiled backend artifact shape |
| `pnpm smoke:backend:runtime` | Smoke-test the built backend against the guarded test database |
| `pnpm playwright:install` | Install local Chromium for frontend E2E and browser-visible checks |
| `pnpm playwright:install:with-deps` | Install Chromium plus OS dependencies on Linux, containers, or CI-like hosts |
| `pnpm test:e2e:frontend` | Run frontend browser E2E tests |
| `pnpm validate:push` | Run typecheck, lint, and backend unit tests through the pre-push hook |
| `pnpm docker:infra:config` | Validate the infrastructure-only Compose file |
| `pnpm docker:infra:up` | Start PostgreSQL, Redis, and MinIO for hybrid development |
| `pnpm docker:infra:down` | Stop infrastructure-only services |
| `pnpm docker:full:config` | Validate the combined infrastructure/application Compose topology |
| `pnpm docker:full:services` | List services in the full Docker topology |
| `pnpm docker:full:build` | Build frontend and backend Docker targets |
| `pnpm docker:full:up` | Build and start frontend, backend, PostgreSQL, Redis, and MinIO |
| `pnpm docker:full:down` | Stop the complete container stack |
| `pnpm docker:up` | Backward-compatible alias for `pnpm docker:infra:up` |
| `pnpm docker:app:up` | Backward-compatible alias for `pnpm docker:full:up` |

## Environment

Use the environment examples as non-secret templates:

- `.env.example` explains the available run modes and shared defaults.
- `.env.local.example` is the root template for hybrid development.
- `.env.docker.example` is the root template for full Docker development.
- `app/frontend/.env.example` contains browser-safe frontend variables.
- `app/backend/.env.example` is the development backend template.
- `app/backend/.env.test.example` is the isolated test backend template.

Do not commit real `.env` files or secrets.

`DATABASE_URL` is the only database connection key. The selected backend
environment supplies its value: `.env` for development, `.env.test` for local
tests, and `.env.production` or an injected secret for production. Test-only
commands reject database names that do not end in `_test`.

Database reset commands are local, interactive, and destructive. Preview a
target with `pnpm prisma:reset:dev -- --check` or
`pnpm prisma:reset:test -- --check` before running the corresponding command.
They never run in CI/CD, do not accept `--force`, and do not seed automatically.

Auth seed commands are local-first safety tools. They refuse `NODE_ENV=production`
and refuse non-local database hosts unless explicitly overridden with a custom
`WORKSYNC_SEED_PASSWORD`.

`COOKIE_DOMAIN` should normally be empty on localhost. Set it only to a shared
parent domain such as `.example.com` when the frontend and API use sibling
HTTPS subdomains. It must not contain a scheme, port, or path. Google OAuth
redirect URIs must exactly match the externally reachable backend callback.

## Validation

The current foundation has been verified with:

```bash
pnpm prisma:validate
pnpm prisma:generate
pnpm check
```

Backend tests are configured with Jest. PostgreSQL integration tests load
`DATABASE_URL` from `app/backend/.env.test` or the injected CI environment and
reject a database name that does not end in `_test`. Database-backed
integration and security evidence is incomplete when the required test
database is unavailable.

Docker Compose validation should be rerun on machines with Docker installed:

```bash
docker compose -f docker/compose.yml config
docker compose --env-file .env -f docker/compose.yml -f docker/compose.app.yml config
docker compose --env-file .env -f docker/compose.yml -f docker/compose.app.yml config --services
```

## Documentation

- [Roadmap](docs/roadmap.md)
- [Product Requirements](docs/product-requirements.md)
- [Domain Model](docs/domain-model.md)
- [API Design](docs/api-design.md)
- [Security Model](docs/security-model.md)
- [Testing Strategy](docs/testing-strategy.md)
- [Deployment](docs/deployment.md)
- [Validation Matrix](docs/validation-matrix.md)
- [Development Workflow](docs/development-workflow.md)
- [Project Workflow Guides](docs/workflows/README.md)
- [Project Setup](docs/project-setup.md)
- [Google OAuth Setup](docs/google-oauth-setup.md)
- [Technology and Dependency Inventory](docs/technology-stack.md)
- [WorkSync Project Profile](references/worksync/profile.md)

## Current Priorities

1. Implement workspace membership, RBAC guards, and workspace isolation.
2. Add immutable image publishing and production deployment automation.
3. Implement projects, tasks, comments, mentions, notifications, and activity logs.
4. Extend browser E2E coverage for workspace and collaboration flows.
5. Add production Dockerfiles, deployment pipeline, observability, and release evidence.

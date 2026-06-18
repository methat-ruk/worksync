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
- backend unit, integration, and API contract test harnesses
- local service topology for PostgreSQL, Redis, and S3-compatible storage
- CI workflow and repository validation commands
- product, domain, API, security, testing, deployment, and workflow documentation

Not complete yet:

- authentication and workspace membership implementation
- RBAC and workspace isolation enforcement
- production Docker images and deployment pipeline
- real unit, integration, contract, E2E, and security test suites
- production observability and incident-response automation

## Tech Stack

| Area | Technology |
|---|---|
| Frontend | Next.js App Router, React, TypeScript |
| UI | Tailwind CSS, shadcn/ui |
| Backend | NestJS, TypeScript |
| Data | PostgreSQL, Prisma |
| Cache | Redis |
| Queue | BullMQ |
| Realtime | Socket.IO |
| Storage | AWS S3-compatible object storage |
| API Docs | Swagger / OpenAPI |
| Runtime | Docker, Docker Compose |
| Package Manager | pnpm via Corepack |

## Repository Structure

```text
app/
  frontend/        Next.js application
  backend/         NestJS API and Prisma schema
docs/              product and engineering documentation
docker/            local runtime services
references/        WorkSync project profile and implementation decisions
.github/           CI workflow
```

## Prerequisites

- Node.js 20 or newer
- Corepack
- Docker and Docker Compose
- Git

This repository uses `pnpm@9.15.0` through Corepack.

## Getting Started

Enable Corepack and install dependencies:

```bash
corepack enable
pnpm install
```

Create a local environment file:

```bash
cp .env.example .env
cp app/frontend/.env.example app/frontend/.env.local
cp app/backend/.env.example app/backend/.env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item app/frontend/.env.example app/frontend/.env.local
Copy-Item app/backend/.env.example app/backend/.env
```

Start local services and prepare Prisma:

```bash
pnpm docker:up
pnpm prisma:validate
pnpm prisma:generate
pnpm prisma:migrate
```

Start the applications:

```bash
pnpm dev
```

Default local URLs:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`
- Backend health check: `http://localhost:4000/health`
- Backend liveness check: `http://localhost:4000/health/live`
- Backend readiness check: `http://localhost:4000/health/ready`
- Swagger docs: `http://localhost:4000/docs`
- Business API base URL: `http://localhost:4000/api`

## Available Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Start frontend and backend in development mode |
| `pnpm dev:frontend` | Start only the frontend |
| `pnpm dev:backend` | Start only the backend |
| `pnpm typecheck` | Run TypeScript checks across workspaces |
| `pnpm lint` | Run frontend and backend lint checks |
| `pnpm test` | Run configured test scripts |
| `pnpm --filter @worksync/backend test:unit` | Run backend unit tests |
| `pnpm --filter @worksync/backend test:integration` | Run backend PostgreSQL integration tests |
| `pnpm --filter @worksync/backend test:e2e` | Run backend API contract and E2E tests |
| `pnpm build` | Build frontend and backend |
| `pnpm check` | Run typecheck, lint, test, and build |
| `pnpm prisma:validate` | Validate the Prisma schema |
| `pnpm prisma:generate` | Generate Prisma Client |
| `pnpm prisma:migrate` | Apply local Prisma migrations |
| `pnpm docker:up` | Start local PostgreSQL, Redis, and MinIO |
| `pnpm docker:down` | Stop local Docker services |

## Environment

Use the environment examples as non-secret templates:

- `.env.example` is the root local full-stack template for Docker Compose and root-level orchestration.
- `app/frontend/.env.example` contains browser-safe frontend variables.
- `app/backend/.env.example` contains backend-only variables such as database, cache, queue, token, storage, email, realtime, observability, and test-service configuration.

Do not commit real `.env` files or secrets.

## Validation

The current foundation has been verified with:

```bash
pnpm prisma:validate
pnpm prisma:generate
pnpm check
```

Backend tests are configured with Jest. PostgreSQL integration tests use
`TEST_DATABASE_URL` and are reported as skipped when that test dependency is
not available.

Docker Compose validation should be rerun on machines with Docker installed:

```bash
docker compose -f docker/compose.yml config
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
- [WorkSync Project Profile](references/worksync/profile.md)

## Current Priorities

1. Implement authentication, refresh-token handling, and session lifecycle.
2. Implement workspace membership, RBAC guards, and workspace isolation.
3. Implement projects, tasks, comments, mentions, notifications, and activity logs.
4. Replace placeholder test scripts with real unit, integration, contract, E2E, and security tests.
5. Add production Dockerfiles, deployment pipeline, observability, and release evidence.

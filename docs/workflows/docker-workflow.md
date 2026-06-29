# Docker Workflow

## Purpose

WorkSync supports two local run modes: hybrid development and full Docker. Use
this workflow when changing Compose files, Dockerfiles, ports, runtime
environment, image builds, or onboarding instructions.

## Run Modes

### Hybrid Development Mode

Docker runs only infrastructure services:

- PostgreSQL
- Redis
- MinIO

Frontend and backend run locally with pnpm.

```bash
corepack pnpm docker:infra:up
corepack pnpm dev
```

Local app URLs use hostnames reachable from the developer machine:

- frontend: `http://localhost:3000`
- backend: `http://localhost:4000`
- PostgreSQL: `localhost:5433`
- Redis: `localhost:6379`
- MinIO API: `http://localhost:9000`

### Full Docker Mode

Docker runs frontend, backend, PostgreSQL, Redis, and MinIO on the same Compose
network.

```bash
docker compose --env-file .env -f docker/compose.yml -f docker/compose.app.yml up --build -d
```

Backend service URLs use Compose hostnames:

- PostgreSQL: `postgres`
- Redis: `redis`
- MinIO: `minio`

Browser-facing frontend variables still use localhost because the browser runs
on the host machine, not inside the Compose network.

## Important Files

| File | Purpose |
| --- | --- |
| `docker/compose.yml` | infrastructure-only services |
| `docker/compose.app.yml` | frontend/backend overlay for full Docker mode |
| `Dockerfile` | multi-target frontend and backend image builds |
| `.env.local.example` | root environment template for hybrid mode |
| `.env.docker.example` | root environment template for full Docker mode |
| `app/frontend/.env.example` | frontend environment template |
| `app/backend/.env.example` | backend environment template |

## Build Flow

The backend image build must generate Prisma Client inside the image before
running the backend build.

```text
install workspace dependencies
-> copy source
-> run backend Prisma generation
-> run backend build
-> copy compiled backend artifact into runtime image
```

Do not rely on local untracked generated files such as
`app/backend/src/generated/prisma`.

## Validation Commands

```bash
corepack pnpm docker:infra:config
corepack pnpm docker:full:config
corepack pnpm docker:full:services
corepack pnpm docker:full:build
```

For manual Compose checks:

```bash
docker compose -f docker/compose.yml config
docker compose --env-file .env -f docker/compose.yml -f docker/compose.app.yml config
docker compose --env-file .env -f docker/compose.yml -f docker/compose.app.yml config --services
```

Avoid sharing full config output when real secrets are present.

## Common Failure Modes

- Host app uses Docker service hostnames such as `postgres` instead of
  `localhost`.
- Containerized backend uses localhost instead of Compose service hostnames.
- Local PostgreSQL conflicts with the configured host port `5433`.
- Full Docker config fails because required JWT or cookie secrets are missing.
- Docker image build fails on a clean checkout because Prisma Client generation
  was skipped.
- Frontend cannot reach backend because browser-facing URLs point at internal
  Compose hostnames.

## Related Docs

- [Project Setup](../project-setup.md)
- [Deployment](../deployment.md)
- [CI Validation Workflow](ci-validation-workflow.md)
- [Database and Prisma Workflow](database-prisma-workflow.md)

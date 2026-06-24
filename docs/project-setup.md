# WorkSync Project Setup

This guide is the canonical onboarding path for a fresh local checkout.

## Prerequisites

- Git
- Node.js 22 LTS
- Corepack
- Docker Desktop or another Docker Engine with Docker Compose

The repository pins:

- Node.js major version in `.nvmrc`
- supported Node.js range in the root `package.json`
- pnpm version through the root `packageManager` field
- exact dependency resolution in `pnpm-lock.yaml`

Use pnpm for this repository. Do not install dependencies with npm or Yarn.

## 1. Select Node.js 22

With nvm:

```bash
nvm use
node --version
```

The reported version must satisfy `>=22 <23`.

## 2. Enable pnpm and Install Dependencies

```bash
corepack enable
corepack pnpm --version
corepack pnpm install --frozen-lockfile
```

Use `--frozen-lockfile` for reproducible onboarding and CI parity. Run a normal
`corepack pnpm install` only when intentionally changing dependencies.

## 3. Create Local Environment Files

macOS or Linux:

```bash
cp .env.local.example .env
cp app/frontend/.env.example app/frontend/.env.local
cp app/backend/.env.example app/backend/.env
```

Windows PowerShell:

```powershell
Copy-Item .env.local.example .env
Copy-Item app/frontend/.env.example app/frontend/.env.local
Copy-Item app/backend/.env.example app/backend/.env
```

Replace example JWT values with two different local secrets of at least 32
bytes. Keep `COOKIE_SECURE=false` only for local HTTP development.

Never commit `.env` or `.env.local` files.

Google OAuth is disabled by default for local development. Follow
`docs/google-oauth-setup.md` when enabling it.

## 4. Start Local Infrastructure

```bash
corepack pnpm docker:infra:up
docker compose -f docker/compose.yml ps
```

Wait until PostgreSQL reports `healthy` before creating databases or running
migrations.

The local Compose topology provides:

| Service | Address | Current role |
|---|---|---|
| PostgreSQL | `localhost:5433` | Application and integration-test persistence |
| Redis | `localhost:6379` | Available for future cache, queue, and ephemeral state |
| MinIO API | `localhost:9000` | Available for future S3-compatible storage integration |
| MinIO Console | `http://localhost:9001` | Local object-storage administration |

If `localhost:5433` is already occupied by another local service, change
the host port in `docker/compose.yml` and update the matching uncommitted
localhost database URLs in `.env`, `app/backend/.env`, and any shell exports.

Docker Compose creates the `worksync` database. For a fresh PostgreSQL volume,
check whether the test database exists:

```bash
docker exec worksync-postgres psql -U worksync -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='worksync_test';"
```

If the command returns no row, create it once:

```bash
docker exec worksync-postgres createdb -U worksync worksync_test
```

If it returns `1`, no action is required.

## 5. Prepare Prisma

Validate and generate the client:

```bash
corepack pnpm prisma:validate
corepack pnpm prisma:generate
```

Apply local development migrations:

```bash
corepack pnpm prisma:migrate
```

Apply the same migrations to the test database:

macOS or Linux:

```bash
DATABASE_URL="postgresql://worksync:worksync@localhost:5433/worksync_test?schema=public" \
  corepack pnpm --filter @worksync/backend prisma:migrate:deploy
```

Windows PowerShell:

```powershell
$env:DATABASE_URL = "postgresql://worksync:worksync@localhost:5433/worksync_test?schema=public"
corepack pnpm --filter @worksync/backend prisma:migrate:deploy
Remove-Item Env:DATABASE_URL
```

## 6. Start the Applications

```bash
corepack pnpm dev
```

Pressing `Ctrl+C` is a normal clean shutdown. The root launcher coordinates
both development processes and does not label a user-requested stop as an
application failure.

Local endpoints:

| Surface | URL |
|---|---|
| Frontend | `http://localhost:3000` |
| Backend | `http://localhost:4000` |
| Health | `http://localhost:4000/health` |
| Readiness | `http://localhost:4000/health/ready` |
| Swagger | `http://localhost:4000/docs` |
| Business API | `http://localhost:4000/api` |

## 7. Validate the Checkout

Run the complete repository checks:

```bash
corepack pnpm check
```

Run the backend-specific validation, including Prisma, all backend Jest
projects, build, and artifact validation:

```bash
corepack pnpm validate:backend
```

Run frontend typechecking, lint, shared password-policy tests, UI tests, and
the production build:

```bash
corepack pnpm validate:frontend
```

Install Chromium once before local browser E2E tests:

```bash
corepack pnpm --filter @worksync/frontend exec playwright install chromium
corepack pnpm --filter @worksync/frontend test:e2e
```

The PostgreSQL-backed integration and security evidence requires
`TEST_DATABASE_URL` from `app/backend/.env`. Required database-backed suites
must not be accepted as complete when skipped.

## Run Modes

WorkSync has two local run modes.

### Hybrid Development Mode

Hybrid mode is the default for day-to-day development:

- Docker runs PostgreSQL, Redis, and MinIO only.
- Frontend and backend run locally with pnpm.
- Local app URLs use localhost.

Commands:

```bash
cp .env.local.example .env
corepack pnpm install --frozen-lockfile
docker compose -f docker/compose.yml up -d
corepack pnpm dev
```

Expected hybrid addresses:

| Component | URL |
|---|---|
| Frontend | `http://localhost:3000` |
| Backend | `http://localhost:4000` |
| PostgreSQL | `localhost:5433` |
| Redis | `localhost:6379` |
| MinIO API | `http://localhost:9000` |

### Full Docker Mode

The root `Dockerfile` contains independent `frontend` and `backend` targets.
The existing `docker/compose.yml` remains the local infrastructure definition;
`docker/compose.app.yml` adds the application containers.

Full Docker mode is useful for fresh-clone onboarding and container topology
validation:

- Docker runs frontend, backend, PostgreSQL, Redis, and MinIO.
- Backend dependency URLs use Docker service hostnames: `postgres`, `redis`,
  and `minio`.
- Frontend public API and Socket URLs remain `http://localhost:4000` because
  the user's browser runs on the host machine.

Create a Docker-mode environment file, then build and start:

```bash
cp .env.docker.example .env
docker compose --env-file .env -f docker/compose.yml -f docker/compose.app.yml up --build -d
```

Apply committed migrations before serving application traffic:

```bash
docker compose --env-file .env -f docker/compose.yml -f docker/compose.app.yml \
  run --rm backend \
  ./node_modules/.bin/prisma migrate deploy
```

Stop the complete stack:

```bash
corepack pnpm docker:full:down
```

Container constraints:

- The example JWT secrets in `.env.docker.example` are local-only. Replace
  them before using any shared, staging, production-like, or internet-exposed
  environment.
- `NEXT_PUBLIC_*` values are compiled into the frontend image; rebuild that
  target when a public URL or Google-enabled flag changes.
- Secrets are runtime environment values and must not be Docker build args.
- Leave `COOKIE_DOMAIN` empty for localhost and single-host deployments.
- For `app.example.com` and `api.example.com`, use `.example.com`, HTTPS, and
  `COOKIE_SECURE=true`.
- `COOKIE_DOMAIN` must not contain a scheme, port, or path.
- The Google callback must exactly match the external backend callback, such
  as `https://api.example.com/api/auth/google/callback`.
- The Compose overlay is local/staging-like: it does not provide TLS, ingress,
  secret storage, registry promotion, backups, or zero-downtime migrations.
- The backend image currently favors reproducible workspace installation over
  minimum image size; production pruning, SBOM generation, and registry
  provenance remain delivery-pipeline follow-ups.

## Common Commands

| Command | Purpose |
|---|---|
| `corepack pnpm dev` | Start frontend and backend |
| `corepack pnpm dev:frontend` | Start only Next.js |
| `corepack pnpm dev:backend` | Start only NestJS |
| `corepack pnpm check` | Typecheck, lint, test, and build all workspaces |
| `corepack pnpm validate:backend` | Run complete backend validation |
| `corepack pnpm validate:frontend` | Run shared policy and frontend validation |
| `corepack pnpm --filter @worksync/frontend test:e2e` | Run frontend auth browser tests |
| `corepack pnpm prisma:migrate:status:test` | Verify migration status against `TEST_DATABASE_URL` |
| `corepack pnpm docker:infra:up` | Run PostgreSQL, Redis, and MinIO only |
| `corepack pnpm docker:full:build` | Build application Docker images |
| `corepack pnpm docker:full:up` | Run infrastructure and application containers |
| `corepack pnpm smoke:backend:runtime` | Smoke-test the built backend against `TEST_DATABASE_URL` |
| `corepack pnpm docker:infra:down` | Stop local infrastructure |
| `corepack pnpm --filter @worksync/backend test:integration` | Run PostgreSQL integration tests |
| `corepack pnpm --filter @worksync/backend test:contract` | Run API and Swagger contract tests |
| `corepack pnpm --filter @worksync/backend test:security` | Run authentication security tests |

See `docs/validation-matrix.md` for the complete validation inventory.

## Troubleshooting

### Node engine warning

Confirm the active runtime:

```bash
node --version
```

Switch to Node.js 22 before reinstalling dependencies.

### PostgreSQL integration tests do not run

Verify:

```bash
docker compose -f docker/compose.yml ps
docker exec worksync-postgres psql -U worksync -d worksync_test -c "SELECT 1;"
```

Confirm `TEST_DATABASE_URL` exists in `app/backend/.env`.

### Backend fails environment validation

Compare `app/backend/.env` with `app/backend/.env.example`. At minimum, the
backend currently validates application, database, CORS, cookie, logging, and
JWT configuration at startup.

### Dependency installation stalls on Windows

Stop repository-owned Node processes and rerun:

```bash
corepack pnpm install --frozen-lockfile
```

Do not delete `pnpm-lock.yaml` as a recovery step.

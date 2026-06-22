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
cp .env.example .env
cp app/frontend/.env.example app/frontend/.env.local
cp app/backend/.env.example app/backend/.env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
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
corepack pnpm docker:up
docker compose -f docker/compose.yml ps
```

Wait until PostgreSQL reports `healthy` before creating databases or running
migrations.

The local Compose topology provides:

| Service | Address | Current role |
|---|---|---|
| PostgreSQL | `localhost:55432` | Application and integration-test persistence |
| Redis | `localhost:6379` | Available for future cache, queue, and ephemeral state |
| MinIO API | `localhost:9000` | Available for future S3-compatible storage integration |
| MinIO Console | `http://localhost:9001` | Local object-storage administration |

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
DATABASE_URL="postgresql://worksync:worksync@localhost:55432/worksync_test?schema=public" \
  corepack pnpm --filter @worksync/backend prisma:migrate:deploy
```

Windows PowerShell:

```powershell
$env:DATABASE_URL = "postgresql://worksync:worksync@localhost:55432/worksync_test?schema=public"
corepack pnpm --filter @worksync/backend prisma:migrate:deploy
Remove-Item Env:DATABASE_URL
```

## 6. Start the Applications

```bash
corepack pnpm dev
```

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

The PostgreSQL-backed integration and security evidence requires
`TEST_DATABASE_URL` from `app/backend/.env`. Required database-backed suites
must not be accepted as complete when skipped.

## Common Commands

| Command | Purpose |
|---|---|
| `corepack pnpm dev` | Start frontend and backend |
| `corepack pnpm dev:frontend` | Start only Next.js |
| `corepack pnpm dev:backend` | Start only NestJS |
| `corepack pnpm check` | Typecheck, lint, test, and build all workspaces |
| `corepack pnpm validate:backend` | Run complete backend validation |
| `corepack pnpm prisma:migrate:status:test` | Verify migration status against `TEST_DATABASE_URL` |
| `corepack pnpm smoke:backend:runtime` | Smoke-test the built backend against `TEST_DATABASE_URL` |
| `corepack pnpm docker:down` | Stop local infrastructure |
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

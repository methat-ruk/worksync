# Database and Prisma Workflow

## Purpose

Use this workflow when changing Prisma schema, migrations, database access,
generated Prisma Client behavior, or persistence-critical tests.

## Project Rules

- Prisma schema lives in `app/backend/prisma/schema.prisma`.
- Migrations live in `app/backend/prisma/migrations/`.
- Prisma 7 connection URLs are configured through
  `app/backend/prisma.config.ts`, not the datasource block in the schema file.
- Runtime PostgreSQL access uses `@prisma/adapter-pg`.
- Generated Prisma Client is produced under `app/backend/src/generated/prisma`
  and is not edited manually.
- Prefer Prisma over raw SQL. Raw SQL needs a concrete reason and safe
  parameterization.

## Change Flow

```text
Understand data/business invariant
-> edit Prisma schema
-> create or apply migration
-> validate Prisma schema
-> generate Prisma Client
-> run database-backed tests
-> validate Docker/CI build surfaces if generated client imports changed
```

Schema changes that transform existing data need a rollback or forward-fix
plan before execution.

## Common Commands

```bash
corepack pnpm prisma:validate
corepack pnpm prisma:generate
corepack pnpm prisma:migrate
corepack pnpm prisma:migrate:deploy:test
corepack pnpm prisma:migrate:status:test
corepack pnpm validate:backend
```

Use a real PostgreSQL test database for persistence-critical evidence.

## Local and CI Database URLs

- Hybrid local PostgreSQL is exposed on `localhost:5433`.
- CI service containers commonly expose PostgreSQL on `localhost:5432`.
- `DATABASE_URL` is the only database connection key.
- Development commands load it from `app/backend/.env`; test commands load it
  from `app/backend/.env.test` or the injected CI environment; production
  commands use `app/backend/.env.production` or an injected runtime secret.
- Test commands require the selected database name to end in `_test`.

When the test database is unavailable, database-backed suites fail closed.
Validation remains incomplete until they pass against the test target.

## Local Database Reset

Database reset is destructive and development-only. Preview the sanitized
target with:

```bash
corepack pnpm prisma:reset:dev --check
corepack pnpm prisma:reset:test --check
```

Run the matching command without `--check` only when all data in that local
database may be deleted. The development command accepts only `worksync`; the
test command accepts only a database ending in `_test`. Both keep Prisma's
interactive confirmation, reject CI/CD and non-local hosts, never pass
`--force`, and never seed. Run an explicit seed command after reset when
needed. Production reset is not supported.

## Generated Client Discipline

Generated Prisma Client must be created in every clean environment that builds
or tests backend code:

- local development after install or schema changes
- backend validation
- Docker backend image build
- CI clean checkout

Do not fix generated-client failures by committing generated output unless the
project intentionally changes that policy.

## Common Failure Modes

- Prisma schema validates locally but CI fails because generated client was not
  produced before TypeScript compilation.
- Tests pass locally because stale generated files exist.
- Migration commands use the wrong database URL after switching between hybrid
  and CI topology.
- Data migration changes existing values without a collision or rollback plan.
- Raw SQL bypasses Prisma typing or parameterization and introduces injection or
  type-mismatch risk.

## Validation Checklist

- Prisma schema validates.
- Prisma Client generation succeeds.
- Migration status is clean against the test database when migrations changed.
- Persistence-critical backend tests pass against PostgreSQL.
- Docker backend build still passes when generated imports are involved.

## Related Docs

- [Project Setup](../project-setup.md)
- [Validation Matrix](../validation-matrix.md)
- [Docker Workflow](docker-workflow.md)
- [CI Validation Workflow](ci-validation-workflow.md)

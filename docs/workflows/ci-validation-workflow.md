# CI Validation Workflow

## Purpose

WorkSync CI proves that the repository still works from a clean checkout, not
only on one developer machine. Use this workflow when CI fails, validation
commands change, or required evidence is unclear.

## High-Level Flow

```text
Install dependencies
-> validate generated and compiled surfaces
-> run backend validation
-> run frontend validation
-> run browser E2E evidence
-> validate container topology and images
-> run dependency audit
```

## CI Job Ownership

| Job | Owns |
| --- | --- |
| Backend validation | Prisma validation/generation, migrations, backend typecheck, lint, Jest projects, backend build, backend artifact checks |
| Frontend validation | shared auth policy package tests, frontend typecheck, lint, unit/component tests, frontend build |
| Frontend E2E | Playwright browser evidence for critical auth and navigation behavior |
| Container topology and images | Compose config, service list, backend image build, frontend image build |
| Dependency audit | production dependency vulnerability gate |

Keep jobs split by failure ownership. Do not combine unrelated checks just to
make CI look simpler.

## Why It Works This Way

- Backend tests need PostgreSQL and Redis service setup.
- Frontend validation should fail fast without waiting for backend database
  suites.
- Browser E2E failures should be distinguishable from unit or build failures.
- Docker image builds catch clean-checkout and generated-artifact mistakes that
  local validation may miss.

## Local Commands

```bash
corepack pnpm validate:backend
corepack pnpm validate:frontend
corepack pnpm --filter @worksync/frontend test:e2e
corepack pnpm docker:full:config
corepack pnpm docker:full:services
corepack pnpm docker:full:build
corepack pnpm audit --prod --audit-level moderate
```

Run only the relevant subset during normal development. Before merging a
pipeline change, run the closest local equivalent for every affected CI job.

## Common Failure Modes

- Local passes but CI fails because a generated artifact was present locally but
  missing in a clean checkout.
- Backend Jest cannot resolve workspace package subpath exports such as
  `@worksync/auth-policy/*`.
- Docker image build fails because Prisma Client was not generated inside the
  image before backend compilation.
- Database-backed tests skip or fail because `TEST_DATABASE_URL` is missing or
  points at the wrong port.
- Compose config output is pasted into logs with real resolved secrets.
- Branch protection expects old CI job names after workflow jobs are renamed.

## Validation Checklist

- Backend validation passes with a real PostgreSQL test database.
- Frontend validation passes without relying on backend internals.
- E2E tests cover the changed browser-visible behavior.
- Docker config and image builds pass from clean source.
- Dependency audit result is reported separately from test/build results.
- Failed, skipped, and not-run checks are reported separately.

## Related Docs

- [Validation Matrix](../validation-matrix.md)
- [Testing Strategy](../testing-strategy.md)
- [Docker Workflow](docker-workflow.md)
- [Database and Prisma Workflow](database-prisma-workflow.md)

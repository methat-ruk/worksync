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
| Frontend E2E | Production-build compatibility on Chromium, Firefox, and WebKit plus critical mocked/live browser journeys |
| Container topology and images | Development/test Compose config and service lists, Docker orchestration self-test, and production/test image builds |
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
corepack pnpm test:docker-orchestration
corepack pnpm test:audit-production
corepack pnpm audit:production
```

Run only the relevant subset during normal development. Before merging a
pipeline change, run the closest local equivalent for every affected CI job.

## Dependency Audit Failure and Recovery

`audit:production` runs the pinned pnpm audit for production dependencies,
including optional dependencies, and retains the moderate-or-higher gate.
It prints the JSON report and distinguishes three outcomes:

- Exit 0: a complete successful report with no moderate-or-higher findings.
- Exit 1: moderate-or-higher vulnerabilities; review and remediate the report.
- Exit 2: incomplete audit (network, registry, malformed report, or tool failure).
  This is not a security pass: restore connectivity and rerun the failed job.

The client makes at most three requests with a 30-second request timeout and
10-second retry delays (110 seconds), bounded by a 120-second process timeout
and a three-minute CI step timeout. Retries are pnpm's native transport retries;
vulnerability findings are not retried or ignored. No alternate registry,
advisory exclusions, or `--ignore-registry-errors` fallback is used.

During `Setup pnpm` only, `npm_config_audit=false` disables npm's implicit audit
of the bootstrap tool. The separately required project audit still runs. An
npm advisory outage therefore does not also stall unrelated setup jobs.

`test:audit-production` exercises the real pinned pnpm client against a local
fixture registry for clean, vulnerable, transient-error, unavailable, and
timeout cases. These fixtures prove gate behavior, not current dependency
safety; the live production audit remains required before merge.

## Common Failure Modes

- Local passes but CI fails because a generated artifact was present locally but
  missing in a clean checkout.
- Backend Jest cannot resolve workspace package subpath exports such as
  `@worksync/auth-policy/*`.
- Docker image build fails because Prisma Client was not generated inside the
  image before backend compilation.
- Database-backed tests fail because `DATABASE_URL` is missing, points at the
  wrong port, or does not select a database whose name ends in `_test`.
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

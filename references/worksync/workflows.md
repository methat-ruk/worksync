# WorkSync Workflows

## Engineering Checks

Run the relevant repository commands for:

- TypeScript typecheck
- ESLint and configured formatting checks
- unit, integration, contract, end-to-end, and regression tests
- security tests and scanner checks selected in `testing.md`
- frontend and backend builds
- Prisma migration validation
- Docker image or Compose validation

Use commands defined by the repository rather than inventing parallel scripts.

## Validation Evidence

- Backend builds must produce `app/backend/dist/main.js`.
- Backend production artifacts must not contain `app/backend/dist/test` or a nested `app/backend/dist/src/main.js`.
- PostgreSQL integration tests require `TEST_DATABASE_URL` and must pass rather than skip in CI.
- Report skipped suites separately from passed tests.
- Business API routes use `/api`; `/health`, `/health/live`, `/health/ready`, and `/docs` remain outside that prefix.
- For GitHub Actions failures, inspect the exact failing step and distinguish setup, primary-command, cache, cleanup, and post-step failures before changing code or dependency policy.

## Documentation

- Update Swagger documentation when API contracts change.
- Update migration and operational documentation when production behavior changes.

## Communication and Tracking

- Use the active issue tracking system and pull request system selected by the team.
- Preserve issue keys, pull request identifiers, owners, and customer-impact references in status communication.
- Do not assume JIRA, GitHub, Slack, or any particular vendor unless configured for the current environment.

## Completion

- Fix review findings and rerun affected checks.
- Report checks that could not run and the remaining risk.
- Require delivery-pipeline and infrastructure-readiness evidence for production deployment.
- Define post-deploy verification and rollback or containment.

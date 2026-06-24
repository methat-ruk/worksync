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
- browser-visible route rendering when frontend page-level UI, auth entry
  points, route guards, or navigation changed
- local runtime start/stop and service reachability when Docker Compose,
  environment examples, host/container URLs, or local run modes changed

Use commands defined by the repository rather than inventing parallel scripts.

Backend lint coverage must include both `src/**/*.ts` and `test/**/*.ts`.
Typecheck success does not replace linting test helpers and test suites.

Shared workspace packages must remain single sources of truth. Do not duplicate
rules from `packages/*` into `app/backend` or `app/frontend` to work around
resolver failures.

## Feature Quality Gate

Every feature, bug fix, or observable behavior change requires:

- proportionate automated behavioral evidence mapped to the changed guarantees
- `coding-standards` validation for code-level maintainability
- `web-security-baseline` for every web-facing change
- `frontend-review` and/or `backend-review` for the affected implementation domain
- specialized review when architecture, security, data, reliability, observability, timeout, or performance concerns are triggered

Existing tests may be extended; a new test file is not required when the current suite already owns the behavior.

The baseline must record applicable controls and explicit non-applicability.
Material authentication, authorization, workspace-isolation, sensitive-data,
upload, callback, external-URL, redirect, or abuse risk must route to
`security-review`. Controls whose failure could expose data, bypass access, or
execute attacker-controlled content require `security-testing` evidence.

When automated coverage is impractical, record the reason, alternative evidence, unverified behavior, remaining risk, and follow-up owner. Required integration, contract, end-to-end, or security suites that skip leave validation incomplete.

## Validation Evidence

- Backend builds must produce `app/backend/dist/main.js`.
- Backend production artifacts must not contain `app/backend/dist/test` or a nested `app/backend/dist/src/main.js`.
- PostgreSQL integration tests require `TEST_DATABASE_URL` and must pass rather than skip in CI.
- Local backend test setup may load `app/backend/.env` without overriding environment variables already injected by CI.
- Authentication integration and security suites must fail closed in CI when the PostgreSQL test prerequisite is unavailable.
- Report skipped suites separately from passed tests.
- Business API routes use `/api`; `/health`, `/health/live`, `/health/ready`, and `/docs` remain outside that prefix.
- For GitHub Actions failures, inspect the exact failing step and distinguish setup, primary-command, cache, cleanup, and post-step failures before changing code or dependency policy.
- Backend Jest must resolve workspace package imports, including package subpath
  exports such as `@worksync/auth-policy/constants` and
  `@worksync/auth-policy/evaluate`, from the command itself. If the backend
  test command does not build the shared package first, Jest must map those
  imports to the package source rather than depending on stale `dist` output.
- Frontend visual evidence for critical pages must verify visible content,
  loaded styles, and absence of blocking console errors.
- Local runtime evidence must distinguish Compose/config validation from actual
  startup, health, dependency reachability, log leakage, and stop/down behavior.

## Documentation

- Update Swagger documentation when API contracts change.
- Update migration and operational documentation when production behavior changes.

## Communication and Tracking

- Use the active issue tracking system and pull request system selected by the team.
- Preserve issue keys, pull request identifiers, owners, and customer-impact references in status communication.
- Do not assume JIRA, GitHub, Slack, or any particular vendor unless configured for the current environment.

## Completion

- Map material acceptance criteria to validation evidence.
- Confirm implementation is maintainable, locally understandable, and proportional to the requirement.
- Fix review findings and rerun affected checks.
- Report checks that could not run and the remaining risk.
- Require delivery-pipeline and infrastructure-readiness evidence for production deployment.
- Define post-deploy verification and rollback or containment.

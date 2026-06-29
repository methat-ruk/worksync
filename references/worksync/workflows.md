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

## CI Job Ownership

WorkSync CI should keep required evidence authoritative while splitting
independent guarantees into separately named jobs:

- backend validation: Prisma, backend typecheck, lint, all backend Jest
  projects, build, and backend artifact shape
- frontend validation: shared auth policy tests, frontend typecheck, lint,
  unit/component tests, and production build
- frontend E2E: Playwright browser coverage for critical frontend auth and
  navigation behavior
- container topology and images: Compose topology checks and backend/frontend
  Docker image builds
- dependency audit: production dependency vulnerability gate

Do not combine jobs merely for convenience when they do not share required
services or failure ownership. Do not split checks so far that failures become
harder to interpret or required evidence becomes optional.

## Feature Quality Gate

Every feature, bug fix, or observable behavior change requires:

- business and requirement correctness validation before normal-case technical
  correctness
- proportionate automated behavioral evidence mapped to the changed guarantees
- code-level maintainability review
- web security baseline review for every web-facing change
- frontend and/or backend domain review for the affected implementation domain
- specialized review when architecture, security, data, reliability, observability, timeout, or performance concerns are triggered

Existing tests may be extended; a new test file is not required when the current suite already owns the behavior.

The baseline must record applicable controls and explicit non-applicability.
Material authentication, authorization, workspace-isolation, sensitive-data,
upload, callback, external-URL, redirect, or abuse risk must route to
security review. Controls whose failure could expose data, bypass access, or
execute attacker-controlled content require security testing evidence.

When automated coverage is impractical, record the reason, alternative evidence, unverified behavior, remaining risk, and follow-up owner. Required integration, contract, end-to-end, or security suites that skip leave validation incomplete.

Performance-sensitive changes must report the baseline or budget, measured
evidence, skipped measurements, and remaining regression risk. Do not treat
performance evidence as required for every change; require it when data volume,
API latency, database access, queue behavior, bundle size, route load, or
critical user journeys are materially affected.

AI or LLM behavior requires AI engineering review when model output,
retrieval, embeddings, tool calls, prompt orchestration, or AI-generated content
affects user-visible behavior, persistence, tools, or business decisions. Such
work requires AI behavior evidence such as structured-output validation,
tool-call tests, RAG source tests, safety tests, or prompt/model regression
cases. Manual prompt trials alone are not sufficient production-readiness
evidence for important AI behavior.

## Validation Evidence

- Backend builds must produce `app/backend/dist/main.js`.
- Backend production artifacts must not contain `app/backend/dist/test` or a nested `app/backend/dist/src/main.js`.
- PostgreSQL integration tests require `TEST_DATABASE_URL` and must pass rather than skip in CI.
- Local PostgreSQL integration defaults must stay aligned with the Compose
  exposed port documented in `deployment.md`; a connection refusal is a topology
  or environment failure until proven otherwise.
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
- Confirm business and requirement correctness before claiming technical
  correctness.
- Confirm implementation is maintainable, locally understandable, and proportional to the requirement.
- Fix review findings and rerun affected checks.
- Report checks that could not run and the remaining risk.
- Require delivery pipeline and infrastructure readiness evidence for production deployment.
- Define post-deploy verification and rollback or containment.

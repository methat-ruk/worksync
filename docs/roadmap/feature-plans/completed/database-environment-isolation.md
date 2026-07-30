# Feature Plan: Database Environment Isolation

Status: Completed

Plan review: Implemented and post-implementation reviewed on 2026-07-30; no
blocking findings remain

Environment-layout note: the later Environment Layout and Docker Test Runtime
plan supersedes this plan's root `.env` ownership statement. Backend
development and test selection described here remains unchanged.

Intended PR: `feat/database-environment-isolation`

Milestone: Cross-cutting - Runtime and Validation

Impact: Material Change (Tier 2) because this slice changes shared backend,
Prisma, test, migration, CI, and production configuration behavior. The
application schema and product behavior do not change, but an incorrect
environment selection could write test data to the development or production
database, and the planned local reset commands intentionally destroy data in a
selected disposable development or test target.

## Goal

Use `DATABASE_URL` as the only database connection variable in development,
test, and production while selecting a distinct database through the active
backend environment. Remove the retired test-specific database key after every
active consumer has been migrated, and make database-backed test commands reject non-test targets
before they can write data. Provide explicit, guarded development and test
reset commands so an operator can intentionally recreate the selected local
database without using an ambiguous raw Prisma command.

## Requirement Baseline

The approved planning baseline is:

- backend-local environment files own host-run NestJS and Prisma configuration
- root `.env` remains the Docker Compose and run-mode environment
- `app/backend/.env` selects the development database
- `app/backend/.env.test` selects the test database
- `app/backend/.env.production` may select production for controlled
  non-container execution, while deployed containers and CI/CD normally inject
  `DATABASE_URL`
- Prisma reads `DATABASE_URL` through `app/backend/prisma.config.ts`
- NestJS validates the already selected `DATABASE_URL` at startup
- test tooling must not branch on, translate, or require the retired
  test-specific database key
- PostgreSQL test database names must end in `_test`
- database reset is local-only, interactive, and unavailable for production or
  CI/CD
- Prisma 7 reset reapplies migrations but does not automatically seed; seeding
  remains a separate explicit command
- database schema, migrations, business logic, authentication, and product
  features remain unchanged

Actual `.env`, `.env.test`, and `.env.production` files remain ignored because
they may contain secrets. The repository supplies non-secret examples and
instructions rather than modifying a developer's existing secret-bearing
files.

## Acceptance Criteria

- tracked source, configuration, CI, examples, and documentation contain no
  reference to the retired test-specific database key
- application runtime, Prisma, scripts, and tests consume only `DATABASE_URL`
- development commands select `app/backend/.env`
- test commands select `app/backend/.env.test` or an explicitly injected CI
  environment
- production commands select `app/backend/.env.production` when present and
  otherwise require injected runtime configuration
- NestJS cannot silently fall back from test or production configuration to
  development `.env`
- Prisma generate, validate, development migration, test migration, and
  production migration commands receive the intended `DATABASE_URL`
- inherited development `DATABASE_URL` values are overridden by `.env.test`
  when that file exists and are rejected when they do not identify a `_test`
  database
- database-backed tests do not skip because a legacy variable is absent; they
  run against PostgreSQL and fail if the selected test database is unavailable
- test seed, migration, smoke, and live E2E commands reject a database whose
  name does not end in `_test` before making a connection
- `prisma:reset:dev` can reset only the local `worksync` development database
  selected from `app/backend/.env`
- `prisma:reset:test` can reset only a local database whose name ends in
  `_test` selected from `app/backend/.env.test`
- reset commands show only a sanitized target, retain Prisma's interactive
  confirmation, never pass `--force`, never auto-seed, and reject production,
  non-local hosts, wrong database names, and non-interactive CI execution
- CI injects the test database through `DATABASE_URL` and continues to apply
  migrations and run all required database-backed suites
- no Prisma schema, migration, public API, authentication, authorization, or
  business behavior changes

## Scope

- backend environment examples and ignored-file guidance
- explicit environment selection in backend package commands
- NestJS ConfigModule environment-file behavior
- Prisma 7 configuration and CLI command environment loading
- Jest setup and PostgreSQL integration suites
- test database target validation
- test seed, migration status/deploy, runtime smoke, and frontend live E2E
  tooling
- guarded development/test database reset commands and documentation
- GitHub Actions database environment variables
- setup, validation, database workflow, CI workflow, roadmap-history, and
  project workflow documentation

## Out of Scope

- Prisma schema or migration changes
- execution of a database reset while implementing the configuration change;
  any destructive validation run requires separate explicit approval for the
  named disposable target
- database creation, manual deletion, data copy, or production migration
  execution
- changing PostgreSQL ports, containers, volumes, users, passwords, or schema
- changing Redis or `TEST_REDIS_URL`
- staging-environment design
- production provider, secret store, deployment target, or CD implementation
- application modules, API contracts, business logic, authentication,
  authorization, or frontend product behavior
- consolidating backend environment files into the repository root
- dependency upgrades, formatting-policy changes, or unrelated refactoring

## Configuration Contract

The backend environment selection is:

| Context | Source | Database key |
| --- | --- | --- |
| Host development | `app/backend/.env` | `DATABASE_URL` |
| Local test | `app/backend/.env.test` | `DATABASE_URL` |
| CI test | injected job environment | `DATABASE_URL` |
| Controlled host production | `app/backend/.env.production` | `DATABASE_URL` |
| Container or CD production | injected runtime secret | `DATABASE_URL` |

Root `.env` continues to configure Compose interpolation and local run modes.
It is not the backend test environment.

Command wrappers select an environment before NestJS or Prisma starts.
NestJS validates preloaded variables without loading another env file.
`prisma.config.ts` keeps `datasource.url: env("DATABASE_URL")` and does not
choose an environment or reference a test-specific variable.

The production file is optional because production secret injection is the
preferred path. Missing production `DATABASE_URL` must fail validation; it must
not fall back to development.

## Reset Contract

This contract follows Prisma's
[`migrate reset` development-only and data-loss contract](https://docs.prisma.io/docs/cli/migrate/reset)
and its
[Prisma 7 explicit-seeding behavior](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7).

Expose two root commands:

| Command | Environment file | Allowed target |
| --- | --- | --- |
| `pnpm prisma:reset:dev` | `app/backend/.env` | local PostgreSQL database named `worksync` |
| `pnpm prisma:reset:test` | `app/backend/.env.test` | local PostgreSQL database whose name ends in `_test` |

Both commands run through one reset wrapper that:

- loads only the requested backend environment file
- requires `NODE_ENV` to match `development` or `test`
- accepts only `postgresql:` or `postgres:` URLs on the existing local host or
  Compose service allowlist
- rejects production mode, a missing URL, malformed URL, non-local host, or
  database name outside the command's contract
- prints environment, host, port, and database name but never username,
  password, query parameters, or the full URL
- provides a non-destructive `--check` mode for configuration validation
- invokes the fixed `prisma migrate reset` argument set without forwarding
  arbitrary flags and without `--force`
- preserves Prisma's interactive confirmation and does not set or bypass
  dangerous-action consent controls
- never runs a seed automatically

After a reset, developers may separately run `pnpm seed:auth-user` or
`pnpm seed:auth-user:test`. This separation is required because Prisma 7 no
longer auto-seeds after `migrate reset` and because reset must not introduce
surprising application data.

There is no staging or production reset command. CI and CD must use
`prisma migrate deploy`, never reset.

## Audit Baseline

The planning audit found `DATABASE_URL` in 19 tracked files and the retired
test-specific database key in 23 tracked files.

This planned document is an intentional temporary documentation reference to
the retired identifier. During feature-plan closeout, replace its exact
identifier mentions with a historical description so the final tracked-tree
search can reach zero.

## Affected Surfaces

Active legacy consumers that must be migrated:

- backend Jest setup and four PostgreSQL integration suites
- authentication test seed
- Prisma test migration status tooling
- backend runtime smoke tooling
- frontend live E2E orchestration
- backend and frontend-E2E CI jobs

Configuration and documentation surfaces that must be reconciled:

- root local and Docker env examples plus the backend env example
- root and backend package commands
- README, project setup, validation matrix, database workflow, and CI workflow
- completed feature plans whose historical prerequisites name the legacy
  variable
- WorkSync workflow references that define CI database-test evidence

Completed plans retain their historical meaning but describe the test
environment as `DATABASE_URL` selected for the test database.

## Implementation Steps

1. Add a non-secret backend test-environment example with
   `NODE_ENV=test`, `DATABASE_URL` targeting `worksync_test`, and the existing
   test Redis setting. Allow that example through `.gitignore`. Remove the
   retired test-specific database key from development and Docker examples
   without modifying ignored local env files.
2. Make backend commands select their environment explicitly:
   development and `prisma migrate dev` use `.env`; Jest and test-only commands
   use `.env.test` with file values overriding inherited local values;
   production start/deploy uses `.env.production` while preserving injected
   environment precedence.
3. Configure NestJS to validate the preloaded environment and ignore implicit
   env-file loading. Keep the existing typed `DATABASE_URL` validation and
   PrismaService consumption unchanged.
4. Keep `prisma.config.ts` as the single Prisma connection contract through
   `env("DATABASE_URL")`, but remove implicit `.env` loading so each command
   must supply the intended environment. Preserve schema and migration paths.
5. Add a small reusable CJS test-database guard for JavaScript test tooling.
   It parses the URL without logging it, requires PostgreSQL, and requires the
   database pathname to end in `_test`. Unit-test its accepted and rejected
   cases.
6. Update Jest setup to stop loading backend `.env`, set test-safe runtime
   defaults, accept `.env.test` or injected `DATABASE_URL`, reject an inherited
   non-test URL, and use the documented local `worksync_test` URL only as the
   safe default needed by non-database unit tests.
7. Remove legacy conditional skips and assignments from PostgreSQL integration
   suites. They consume the validated `DATABASE_URL`; a missing or unreachable
   database makes required database evidence fail rather than pass as skipped.
8. Update test seed, migration status, runtime smoke, and live E2E tooling to
   load the test environment, consume `DATABASE_URL`, and run the target guard
   before connection, migration, seed, or application startup. Preserve the
   existing `--test` seed mode only as a safety/labeling mode.
9. Add a test migration-deploy command that uses the same guarded test
   environment. Keep the generic production deploy command fail-closed when
   production configuration is absent.
10. Add one fixed-argument reset wrapper plus root/backend
    `prisma:reset:dev` and `prisma:reset:test` commands. Reuse the environment
    parsing and sanitized-target rules from test database safety where
    practical, add `--check`, preserve Prisma's interactive prompt, and keep
    seeding separate.
11. Replace CI declarations and remapping for the retired test-specific
    database key with a job-level
    `DATABASE_URL` pointing to `worksync_test`. Preserve PostgreSQL service
    topology, migration order, job names, and required checks. Verify neither
    reset command appears in CI or CD.
12. Update all current and historical documentation references, explain the
    one-time local move from the retired test-specific database key in `.env`
    to `DATABASE_URL` in `.env.test`, document that `DATABASE_URL` is the
    single source of truth,
    and document reset data loss, target restrictions, separate seeding, and
    recovery expectations.
13. At closeout, replace the exact retired identifier in this feature plan with
    a historical description, move the plan to `completed`, and reconcile the
    feature-plan index so the repository-wide tracked-file search reaches zero.
14. Inspect the complete working-tree diff and apply the
    post-implementation review gate for backend configuration, test-data
    safety, destructive reset boundaries, Prisma commands, CI, secret handling,
    and documentation drift.
    Resolve findings before final validation.

## Validation Contract

### Single database variable

- Changed guarantee: every environment uses `DATABASE_URL`; the legacy key is
  absent.
- Evidence: repository-wide tracked-file search plus configuration and
  documentation inspection.
- Regression detected: an active script, CI job, test, example, or document
  still depends on the retired test-specific database key.

### Test database isolation

- Changed guarantee: test tooling cannot target the development database.
- Evidence: guard unit tests for valid `_test`, development, missing,
  malformed, credential-bearing, and non-PostgreSQL URLs; real PostgreSQL
  integration execution against `worksync_test`.
- Required service: local Compose PostgreSQL on `localhost:5433` or the CI
  PostgreSQL service on `localhost:5432`.
- Regression detected: inherited development configuration reaches a
  test-side connection or a required database suite skips silently.

### NestJS runtime configuration

- Changed guarantee: the selected environment reaches ConfigModule validation
  without fallback to another env file.
- Evidence: existing environment-validation unit tests, backend typecheck,
  build, and runtime smoke with test configuration; negative startup check with
  missing production `DATABASE_URL`.
- Regression detected: test/production starts with development configuration,
  or valid injected configuration is overwritten.

### Prisma and migrations

- Changed guarantee: Prisma reads the selected `DATABASE_URL`, development
  migrations remain on development, and guarded test migration commands remain
  on `_test`.
- Evidence: Prisma validate/generate, read-only development migration status,
  guarded test migration deploy/status, and confirmation that schema and
  migration files are unchanged.
- Regression detected: Prisma implicitly loads development `.env`, applies a
  test command to a non-test database, or changes migration history.

### Guarded database reset

- Changed guarantee: an operator can intentionally reset only the selected
  local development or test database and cannot use the repository commands
  against staging or production.
- Evidence: reset-wrapper unit tests for environment, protocol, host, database
  name, sanitization, fixed arguments, non-interactive rejection, and
  `--check`; successful check mode for both local examples; inspection proving
  `--force`, automatic seed, arbitrary argument forwarding, and CI/CD
  invocation are absent.
- Real-boundary evidence: after separate explicit approval, run
  `prisma:reset:test` against the named disposable `worksync_test` database,
  then verify migration status and optional explicit test seed behavior. Do not
  reset the development database merely to validate the wrapper.
- Regression detected: a production-like target passes preflight, credentials
  appear in output, reset bypasses confirmation, reset runs in CI, or seed data
  appears without a separate seed command.

### CI and developer workflow

- Changed guarantee: clean CI runs migrations and all database-backed evidence
  using injected `DATABASE_URL`; existing command names and job ownership
  remain stable.
- Evidence: YAML inspection, local command equivalents, backend validation,
  runtime smoke, and live E2E when the required services are available.
- Regression detected: CI omits the database URL, remaps a removed key, skips a
  required suite, or changes required job identity.

Final validation runs only after review findings are fixed. Report passed,
failed, skipped, unavailable, and not-run checks separately.

## Failure Modes and Stop Conditions

- If `.env.test` contains a non-`_test` database, stop before any connection or
  mutation and report only the safe reason, never the URL.
- If `.env.test` is absent, unit-only tests may use the documented safe test
  URL without connecting; database-backed validation must fail when PostgreSQL
  is unreachable rather than skip.
- If CI injects a non-test database name, fail before migrations or tests.
- If production configuration is absent, production start or migration must
  fail rather than load development `.env`.
- If a reset target is production-like, remote, incorrectly named, or selected
  from the wrong environment file, stop before invoking Prisma.
- If reset is invoked non-interactively, reject it; CI/CD must never use
  `--force` or another bypass.
- If an agent or automation is asked to execute reset, require separate
  explicit consent identifying the environment and exact disposable database;
  planning or implementing the command is not execution approval.
- If a reset succeeds but optional seeding fails, report the reset as complete
  and the seed as a separate failed operation; do not repeat reset
  automatically.
- If a required Prisma command cannot be made explicit without changing schema
  or migration behavior, stop and re-plan.
- If implementation requires changing authentication, business logic,
  database topology, credentials, schema, migrations, or required CI job names,
  stop because the approved slice no longer applies.
- Do not print resolved env files, database URLs, or Compose configuration that
  may contain credentials.

## Rollback and Forward Fix

No data rollback or migration rollback is required for implementing this slice
because implementation does not execute reset or change schema or data.

An executed reset is intentionally destructive and cannot restore the deleted
local rows. Recovery is to restore an independently created local backup when
one exists, then verify migration status, or accept a clean database and run
the appropriate explicit seed command. The wrapper must warn that reset is
irreversible before delegating to Prisma's confirmation.

The code rollback is to revert command, ConfigModule, test-tooling, CI, example,
and documentation changes together. Do not partially restore the retired
test-specific database key; mixed configuration would recreate the ambiguous source
of truth. Existing ignored local env files remain recoverable and untouched.

If CI exposes an environment-loading difference after merge, forward-fix the
affected command while preserving `DATABASE_URL` as the only contract and keep
database-writing checks blocked until the target guard passes.

## Alternatives Considered

### Keep the retired test-specific database key

Rejected because it creates two names for the same runtime contract and forces
tests, Prisma commands, scripts, and CI to translate between them.

### Put every env file at repository root

Rejected for this slice. Root `.env` currently owns Compose/run-mode values,
while backend-local files own host-run NestJS and Prisma. Consolidation would
expand the blast radius without improving the requested database guarantee.

### Select env files inside application business code

Rejected. Command/runtime composition should select the environment before
NestJS and Prisma consume configuration. Application code continues to read
only the validated `DATABASE_URL`.

### Trust `.env.test` without validating its target

Rejected because a mislabeled file can still contain the development or
production URL. The `_test` database-name guard provides the required
fail-before-write boundary.

### Publish one generic reset command

Rejected because selecting the target through flags or ambient environment
would recreate the ambiguity this feature removes. Separate fixed dev/test
commands make the destructive boundary reviewable and prevent a production
variant from appearing accidental.

### Auto-seed after reset

Rejected because Prisma 7 no longer auto-seeds, and coupling reset to seed
would add surprising writes. Seed commands remain explicit and can fail or be
retried independently.

## Assumptions and Remaining Risk

- The current local and CI test database remains `worksync_test`.
- Database names ending in `_test` are reserved for disposable test data.
- CI continues to inject secrets and environment values rather than relying on
  committed env files.
- Existing ignored `.env` files may retain an unused legacy key until a
  developer follows the documented one-time migration; application and test
  tooling will no longer read it.
- `TEST_REDIS_URL` remains intentionally unchanged.
- Local reset hosts remain `localhost`, loopback, `postgres`, and
  `worksync-postgres`; changing deployment topology does not expand this
  allowlist automatically.
- Reset removes all data in the selected PostgreSQL schema. The repository does
  not promise recovery unless the operator created a separate backup.
- A developer can still put sensitive data into an ignored env file; the plan
  prevents tracked example leakage but does not inspect or rewrite private
  secrets.
- Confidence is high for the implemented configuration and local backend
  evidence. GitHub CI on the supported Node.js 22 runtime remains the final
  clean-checkout confirmation.

## Plan Review

Review verdict: **Implemented and reviewed; no blocking findings remain.**

Resolved findings:

- the original requirement conflict was resolved by migrating active
  references before removing the retired test-specific database key
- backend-local env ownership was selected to preserve existing Compose run
  modes
- implicit `.env` fallback was removed from the design so test and production
  cannot silently inherit development configuration
- a test-target guard was added because file naming alone cannot prevent
  writes to the wrong database
- database reset was added only as separate guarded dev/test commands with
  interactive confirmation, no `--force`, no automatic seed, and no CI/CD path
- database-backed evidence fails on unavailable PostgreSQL rather than being
  reported as passed after a legacy-variable skip
- production remains runtime-secret driven; no production secret file is
  committed

Non-blocking concern:

- developers must perform a one-time local configuration move from the retired
  test-specific database key in `app/backend/.env` to `DATABASE_URL` in
  `app/backend/.env.test`; documentation and the new example make this
  explicit.

Approval covers only the configuration, test-tooling, reset-command
implementation, CI, example, and documentation changes described here. It does
not authorize executing a reset, schema migration, production deployment,
secret mutation, or unrelated cleanup.

Post-implementation review:

- CI migrations use the guarded test deploy command rather than the generic
  production deploy path
- database-backed suites fail closed instead of reporting a legacy-variable
  skip
- reset wrapper arguments are fixed, `--force` is absent, CI/non-interactive
  execution is rejected, and sanitized check mode passed for both local targets
- all 183 backend tests, Prisma validation/generation, typecheck, lint, build,
  artifact validation, test migration status/deploy, and runtime smoke passed
- no reset was executed; destructive reset evidence remains intentionally not
  run without separate target-specific approval
- Prisma schema and migration history remained unchanged

## Done Criteria

- the retired test-specific database key has no tracked repository reference
- all runtime and tooling database access uses `DATABASE_URL`
- development, test, CI, and production selection behavior matches the
  configuration contract
- wrong-database guard evidence and real PostgreSQL integration evidence pass
- dev/test reset check mode and reset-wrapper negative tests pass; actual test
  reset evidence is either approved and passed or reported as not run with the
  remaining unverified destructive-boundary risk
- Prisma schema and migration history are unchanged
- NestJS validation, Prisma commands, CI, runtime smoke, and affected
  documentation are current
- the implementation diff receives a post-implementation review and all
  required findings are fixed or explicitly dispositioned
- final reporting lists every changed file, its reason, test-database write
  risk, passed/failed/skipped validation, remaining risk, and confidence

## Dependencies

- existing PostgreSQL Compose service and `worksync_test` database
- existing Prisma 7 configuration and NestJS ConfigModule validation
- injected CI environment support

## Follow-up

- production deployment foundation remains responsible for provider-specific
  secret storage, CD configuration, staging design, and target verification
- consider applying the same single-source environment pattern to Redis only
  as a separate reviewed change; it is not part of this PR

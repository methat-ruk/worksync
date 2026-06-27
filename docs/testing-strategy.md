# WorkSync Testing Strategy

This document summarizes how WorkSync should validate behavior. Detailed project-specific testing surfaces live in `references/worksync/testing.md`.

## Testing Priorities

WorkSync should prioritize:

1. workspace isolation and authorization
2. authentication and token lifecycle
3. API contract stability
4. persistent data correctness
5. realtime delivery boundaries
6. background job idempotency and retry behavior
7. critical user journeys
8. security regression evidence

## Test Layers

### Unit Tests

Use for isolated rules:

- permission helper logic
- task status transitions
- mention parsing
- notification decision rules
- reminder date calculation
- pure domain utilities

### Backend Integration Tests

Use for behavior across backend boundaries:

- authentication flow
- RBAC guards
- workspace ownership checks
- project/task/comment CRUD
- Prisma transactions
- Redis-backed behavior
- BullMQ enqueue/process/retry behavior
- Socket.IO room authorization

### API Contract Tests

Use for:

- response envelope
- error format
- status codes
- auth and permission behavior
- pagination/filter/sort behavior
- Swagger/OpenAPI consistency
- generated client or shared package drift when applicable

### Frontend/UI Tests

Use for:

- loading, empty, error, and success states
- browser-visible rendering, styles, route guards, navigation, and blocking
  console errors for page-level changes
- form validation and pending states
- shared frontend/backend password policy parity
- confirm-password exclusion from API requests
- permission-based action visibility
- task board/list interaction
- comment and mention UI
- notification surfaces

Frontend test organization:

- colocate unit/component specs with the feature they protect
- keep cross-page browser journeys under `app/frontend/test/e2e`
- keep shared test setup under `app/frontend/test`
- ignore generated `test-results`, `playwright-report`, coverage, and traces;
  never ignore test source

### End-to-End Tests

Use Playwright for:

- sign up, login, logout
- create workspace
- invite or add member
- create project
- create/update/move task
- comment and mention
- notification appears
- restricted action fails for lower-privilege role
- cross-workspace direct navigation fails

### Security Tests

Use security testing for:

- auth/session abuse tests
- role escalation attempts
- cross-workspace IDOR checks
- file upload abuse tests
- realtime boundary checks
- job side-effect isolation
- dependency, secret, static, dynamic, and artifact scans when configured

### Migration Tests

Use for:

- schema migration apply
- existing data validity
- backfill correctness
- compatibility between old and new app versions when needed
- rollback, containment, or forward-fix validation

### Release Smoke Tests

Use for:

- health check
- login
- create/update task
- comment or notification flow
- queue worker health
- database/cache reachability
- file upload smoke when storage changes
- realtime smoke when realtime changes

## Minimum Coverage by Milestone

| Milestone | Required Evidence |
|---|---|
| Identity and Workspace | backend integration, API contract, security isolation |
| Projects and Tasks | domain unit tests, integration, contract, E2E happy path |
| Comments and Notifications | integration, realtime, queue, E2E |
| Files and Jobs | upload security, job idempotency, storage smoke |
| Production Readiness | release smoke, security testing, deployment validation |

## Test Data Rules

- Use deterministic fixtures.
- Model at least two workspaces for isolation tests.
- Model at least one user per role.
- Use allowed and denied actors for authorization-sensitive behavior.
- Keep parallel tests isolated by transaction, schema, namespace, or disposable
  infrastructure.
- Avoid real secrets and real personal data.
- Redact tokens and private URLs from traces and screenshots.

## CI Expectations

CI includes:

- typecheck
- lint and formatting checks
- unit tests
- backend integration tests
- API contract tests
- frontend/UI tests
- selected E2E tests
- selected security checks
- build

Authentication browser E2E runs on every CI validation job. Long-running or
expensive future checks may run on schedule or before release, but release
readiness must know what did and did not run.

## Open Decisions

- Whether TestSprite is used, and review process for generated tests
- Which dependency, secret, SAST, DAST, and artifact scanners are selected
- Which checks are required on every PR versus scheduled or release-gated

# WorkSync Testing Profile

This profile maps reusable testing and security-testing guidance to WorkSync-specific risks, tools, and high-value scenarios.

Do not assume a tool is available until its repository command, configuration, or CI job exists.

## Tool Mapping

| Abstraction | WorkSync Selection |
|---|---|
| Browser Automation Tool | Playwright, when configured |
| Exploratory / Generated Test Tool | TestSprite, when configured and reviewed before acceptance |
| API Test Harness | repository-selected HTTP test runner |
| Component / UI Test Harness | repository-selected frontend test runner |
| Dependency Scanner | repository-selected dependency vulnerability scanner |
| Secret Scanner | repository-selected secret scanning tool |
| Static Security Analyzer | repository-selected SAST tool |
| Dynamic Application Scanner | repository-selected DAST tool, when configured |
| Runtime Artifact Scanner | repository-selected container or artifact scanner |

Prefer repository-defined commands over inventing parallel scripts.

## Boundary Mapping

| Generic Term | WorkSync Mapping |
|---|---|
| Identity Provider / Credential Mechanism | JWT access token and refresh token flow |
| Authorization Model | OWNER, ADMIN, MEMBER, VIEWER roles |
| Tenant Boundary | Workspace |
| Protected Resources | Workspace, Project, Task, Comment, File, Notification, Activity Log |
| Web Framework | Next.js App Router |
| Backend Framework | NestJS |
| ORM / Data Access Layer | Prisma |
| Relational Database | PostgreSQL |
| Cache Layer | Redis |
| Queue System | BullMQ |
| Realtime Transport | Socket.IO |
| File Intake / Object Storage | S3-compatible upload flow; MinIO locally; AWS S3 production target |

## Testing Emphasis

WorkSync risk is concentrated in:

- authentication and refresh-token lifecycle
- RBAC and workspace isolation
- workspace, project, task, comment, notification, and activity-list
  performance as data volume grows
- project, task, comment, file, and notification authorization
- API contract stability between frontend and backend
- realtime event delivery and room membership
- background jobs, retries, and idempotency
- persistent data transitions
- file upload and access control
- release smoke coverage for critical collaboration flows

Prefer integration, contract, end-to-end, and security isolation tests over a large number of low-value unit tests.

Maintain one reusable Google OAuth provider harness for deterministic profiles,
provider failures, single-use authorization codes, and callback transactions.
Reuse it across contract, security, and integration suites rather than creating
independent provider semantics in each suite.

## Unit Tests

Use unit tests for isolated deterministic logic:

- permission decision helpers
- task lifecycle or status-transition rules
- mention parsing
- notification routing rules
- reminder and date calculation
- pure domain utilities

Do not use unit tests as proof of authorization, persistence, queue, or realtime behavior.

## Backend Integration Tests

Prioritize:

- login, refresh, logout, and token invalidation
- Google OAuth state, nonce, PKCE, verified claims, identity creation, safe
  linking, rejected unsafe linking, callback redirects, provider timeout, and
  transaction rollback
- refresh rotation against real PostgreSQL persistence
- concurrent refresh where one request succeeds, the competing request is rejected, and the affected session is revoked
- signup transaction rollback so user and initial session cannot partially commit
- RBAC guards and workspace ownership checks
- workspace, project, task, comment, file, notification, and activity-log flows
- Prisma persistence and transaction behavior
- bounded list behavior for workspace-scoped reads, including pagination,
  filtering, sorting, and relation loading on representative data shapes
- Redis-backed cache or ephemeral state when behavior depends on it
- BullMQ job enqueueing, processing, retry, and failure behavior
- Socket.IO authentication and room membership

Use production-like boundaries where practical while keeping tests deterministic.

## API Contract Tests

Protect:

- response envelope shape
- error shape
- status codes
- required fields
- pagination, filtering, and sorting behavior
- documented limits and performance-sensitive response shapes for list
  endpoints
- auth-required and permission-denied behavior
- Swagger/OpenAPI consistency when contracts change

Contract tests should catch frontend/backend drift before E2E tests become the first signal.

## Frontend and UI Tests

Cover important UI behavior:

- loading, empty, error, and success states
- loading lifecycle on critical screens: loading appears when work starts and
  exits into success, empty, error, timeout, cancellation, or navigation
- failed API responses must render error feedback rather than indefinite loading
- form validation and submission states
- button and interactive-control feedback for hover, focus, active, disabled,
  loading, success, and error states on critical actions
- duplicate-submit prevention for async form or mutation actions
- permission-based action visibility
- task board or task list behavior
- comment and mention UI
- notification surfaces
- responsive behavior on critical screens
- request-waterfall, payload, or route-load regressions on critical screens when
  a performance budget or baseline exists

UI visibility checks do not replace backend authorization tests.

## Performance Evidence

For performance-sensitive WorkSync changes, record:

- the critical journey, endpoint, query, job, or page being evaluated
- the baseline or performance budget used for comparison
- representative data volume or workload shape
- p50, p95, and p99 evidence when practical for API, database, queue, or UI
  latency
- whether the path is bounded by pagination, limits, queue deadlines, or timeout
  budgets
- skipped measurements, why they were skipped, and the remaining risk

## AI and LLM Tests

WorkSync does not currently define a production AI feature. When AI, LLM, RAG,
embeddings, tool-calling, structured-output, prompt orchestration, or
AI-generated-content behavior is introduced, cover:

- deterministic input validation before model calls
- structured-output or schema validation when downstream code depends on model
  fields
- invalid, malformed, unsafe, or unsupported model output
- tool-call argument validation, authorization, duplicate handling, and tool
  failure behavior
- RAG no-result, stale source, conflicting source, unauthorized source, and
  prompt-injection-in-context behavior
- hallucination or unsupported-claim checks for user-visible answers
- provider timeout, rate-limit, unavailable, and fallback behavior
- prompt or model regression cases for important workflows

Manual prompt testing alone is not production-readiness evidence for important
AI behavior.

## End-to-End Tests

Use Playwright when configured for critical journeys:

- sign up, login, logout
- create workspace
- add or invite member
- create project
- create, update, move, and complete task
- comment and mention another user
- notification appears for the intended user
- lower-privilege role cannot perform restricted action
- user cannot access another workspace through direct navigation

Keep the suite small enough to run reliably in CI. Use traces and screenshots carefully to avoid sensitive data exposure.

## Security Tests

High-value security checks:

- every web-facing feature has applicable baseline negative cases for input
  bounds, authorization, ownership, leakage, browser boundaries, and abuse
- lower-privilege role cannot perform owner-only or admin-only actions
- final workspace owner cannot be demoted or removed unless a safe transfer rule exists
- user from one workspace cannot read, mutate, search, export, or infer resources from another workspace
- direct API calls cannot bypass frontend restrictions
- project, task, comment, file, notification, and activity-log queries include workspace boundary enforcement
- Socket.IO events are delivered only to authorized workspace members
- BullMQ jobs do not process or emit cross-workspace side effects
- file upload rejects mismatched content type, oversized payloads, unsafe filenames, and unauthorized access
- refresh token reuse, revoked tokens, expired tokens, and malformed tokens are rejected safely
- access tokens are rejected after their persisted session is revoked
- refresh and logout reject untrusted origins and set or clear cookies with the required attributes
- password login treats provider-only users as the same public invalid-credentials failure
- Google callbacks reject state mismatch, replayed codes, invalid claims, and
  non-authoritative email collisions without exposing provider material
- sensitive data does not appear in browser storage, logs, telemetry, errors, or public file responses

Browser checks supplement backend security tests; they do not prove backend authorization by themselves.

## Queue and Background Job Tests

Cover:

- email, reminder, and daily-summary payload validation
- retry behavior
- idempotency and duplicate job handling
- delayed job timing using controlled clocks where possible
- failed job and dead-letter behavior
- job side effects scoped to the correct workspace and user

Avoid sleep-based timing assertions when a controlled clock or queue test utility can be used.

## Realtime Tests

Cover:

- authenticated connection
- rejected unauthenticated connection
- workspace room join authorization
- task, comment, and notification event delivery
- disconnect and reconnect behavior
- no cross-workspace broadcast
- event payload shape compatibility

Realtime tests should assert both delivery to intended recipients and non-delivery to unauthorized recipients.

## Migration Tests

When Prisma schema or data interpretation changes, verify:

- migration applies cleanly
- existing data remains valid
- backfill correctness
- old and new application compatibility when required
- rollback, containment, or forward-fix plan
- post-migration verification queries

Use production-like data shapes and legacy rows where possible.

## Release and Smoke Tests

For deployment or post-deploy verification, cover affected critical paths:

- health check
- login
- create or update task
- comment or notification path
- queue worker health
- PostgreSQL and Redis reachability when affected
- file upload smoke when storage is touched
- realtime smoke when Socket.IO behavior is touched

Smoke tests prove release viability, not full correctness.

## Generated and Exploratory Tests

Use TestSprite only when configured and reviewed.

Generated tests must be treated as proposals:

- inspect for correctness and sensitive data exposure
- remove brittle implementation coupling
- align with `test-strategy`
- keep only tests that protect meaningful behavior

Do not accept generated tests into the suite without human review.

## Evidence Rules

- Do not store raw access tokens, refresh tokens, secrets, or private file URLs in test output.
- Redact personal data from traces, screenshots, logs, and scanner output.
- Preserve test identity, role, workspace, resource, artifact, and command evidence.
- Record false-positive rationale for scanner findings.
- Convert confirmed vulnerabilities into regression tests or tracked follow-up.
- Report checks that could not run and what remains unverified.

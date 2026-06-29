# Frontend and Backend API Workflow

## Purpose

Use this workflow when changing how the frontend calls the backend, how API
responses are shaped, how auth state is represented in the browser, or how UI
states map to backend failures.

## API Boundary

- Business API routes keep the `/api` prefix.
- Health and Swagger routes stay outside the business API prefix:
  `/health`, `/health/live`, `/health/ready`, and `/docs`.
- Frontend code should call the backend through the configured API base URL.
- Backend API responses use the established success/error envelope.
- Prisma models are not public API contracts.

## Local URL Model

In hybrid development:

- frontend runs on `http://localhost:3000`
- backend runs on `http://localhost:4000`
- `NEXT_PUBLIC_API_BASE_URL` points to `http://localhost:4000`

In full Docker mode, the browser still needs a host-reachable URL for frontend
to backend calls. Do not use internal Compose hostnames in browser-executed
requests.

## Auth-Aware Request Flow

```text
frontend user action
-> client validation
-> API request to /api
-> backend DTO validation and business/security checks
-> standardized success/error envelope
-> frontend maps result to loading, success, error, or redirect state
```

The refresh token is transported by HttpOnly cookie. Frontend code should not
read it directly.

## UI State Expectations

Every async API interaction needs a clear state model:

- idle
- loading or pending
- success
- error
- timeout or retry state when the operation can hang or exceed the expected
  response budget

Loading must have an exit. Do not hide backend failures behind indefinite
spinners.

## Contract Change Rules

When backend contract changes:

- update DTOs and response types
- update Swagger/OpenAPI documentation
- update frontend request/response mapping
- update contract tests
- update browser E2E coverage for user-visible behavior
- document new error codes or status codes

When frontend behavior changes without backend contract changes:

- keep API contract tests unchanged
- update component/unit/E2E tests for the UI behavior
- verify loading, disabled, hover/focus, error, and success states where
  relevant

## Common Failure Modes

- Frontend assumes a success shape that backend no longer returns.
- Backend adds a new stable error code but frontend treats it as a generic
  unknown failure.
- Browser calls use Docker service hostnames and fail outside the Compose
  network.
- Auth redirect logic loops because refresh failure and unauthenticated state
  are not separated.
- A form sends frontend-only fields such as confirm password to the backend.
- UI shows a permanent loading state after a failed request.

## Validation Commands

```bash
corepack pnpm validate:frontend
corepack pnpm --filter @worksync/frontend test:e2e
corepack pnpm validate:backend
```

Run backend validation when API contracts, auth behavior, validation rules, or
Swagger output change. Run frontend validation and E2E when browser-visible
behavior changes.

## Related Docs

- [API Design](../api-design.md)
- [Testing Strategy](../testing-strategy.md)
- [Auth Workflow](auth-workflow.md)
- [CI Validation Workflow](ci-validation-workflow.md)

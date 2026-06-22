# WorkSync API Design

This document defines API conventions for WorkSync. Swagger/OpenAPI should reflect these rules as implementation is added.

## API Style

- Use REST.
- Prefer JSON request and response bodies.
- Use resource-oriented routes.
- Prefix application routes with `/api`.
- Keep response shapes predictable.
- Enforce authentication and authorization on the backend.

Operational routes such as `/health`, `/health/live`, `/health/ready`, and
Swagger at `/docs` remain outside the application API prefix.

## HTTP Methods

| Method | Use |
|---|---|
| GET | read resources |
| POST | create resources or execute non-idempotent commands |
| PATCH | partially update resources or transition state |
| DELETE | remove or archive resources |

Use `PUT` only if a complete replacement contract is intentionally designed.

## Response Envelope

Use this envelope unless an existing contract explicitly requires otherwise:

```ts
{
  success: boolean;
  message?: string;
  data?: unknown;
}
```

For list endpoints:

```ts
{
  success: true;
  data: {
    items: unknown[];
    page?: number;
    pageSize?: number;
    total?: number;
    nextCursor?: string;
  }
}
```

## Error Shape

Errors should be useful without leaking internals:

```ts
{
  success: false;
  message: string;
  data?: {
    code?: string;
    fields?: Record<string, string[]>;
    correlationId?: string;
  }
}
```

Do not expose stack traces, raw database errors, secrets, tokens, provider payloads, or internal infrastructure details.

Public error codes must be registered in the shared backend error-code registry
before use. Runtime normalization and Swagger documentation use the shared API
error DTO so feature modules do not define competing error envelopes.

Every HTTP response includes `x-correlation-id`. A valid incoming
`x-correlation-id` is preserved; otherwise the backend generates one. Error
responses include the same identifier in `data.correlationId` when request
context is available.

## Operational Endpoints

- `GET /health` remains the compatibility liveness endpoint.
- `GET /health/live` reports process liveness without checking dependencies.
- `GET /health/ready` verifies PostgreSQL connectivity and returns `503` with
  code `SERVICE_NOT_READY` when the backend cannot serve database-backed work.

## Status Codes

| Status | Meaning |
|---|---|
| 200 | successful read or update |
| 201 | successful create |
| 204 | successful delete with no body, only when no envelope is needed |
| 400 | invalid request |
| 401 | missing or invalid authentication |
| 403 | authenticated but not authorized |
| 404 | resource does not exist or is not visible to caller |
| 409 | state conflict or invalid transition |
| 422 | semantically invalid input when validation distinguishes it from malformed input |
| 429 | rate limit exceeded |
| 500 | unexpected server failure |

Use 404 instead of 403 when revealing resource existence would leak cross-workspace information.

## Authentication

The authentication foundation exposes:

- `POST /api/auth/signup` to create a password-authenticated user, persisted session, access token, and refresh cookie.
- `POST /api/auth/login` to authenticate and create a new persisted session.
- `POST /api/auth/refresh` to rotate the refresh cookie and issue a new access token.
- `POST /api/auth/logout` to revoke the current refresh-token session.
- `POST /api/auth/logout-all` to revoke every session for the authenticated user.
- `GET /api/auth/me` to return the authenticated public user.
- `GET /api/auth/google` to start Google Authorization Code + PKCE login.
- `GET /api/auth/google/callback` to verify Google OpenID Connect identity,
  issue the normal WorkSync session, and redirect to the configured frontend.

Access tokens use the `Authorization: Bearer <token>` header. Public user
contracts never include password hashes. Unknown-email and incorrect-password
login attempts return the same public failure.

Refresh tokens are one-time-use JWTs stored only in a scoped HttpOnly cookie.
Their hashes and session lifecycle state are persisted in PostgreSQL. Rotation
retains the original absolute session expiry, token reuse revokes that session,
and logout invalidates access tokens for the revoked session immediately.
Browser auth requests with an `Origin` header must match the configured CORS
origin.

Google callbacks return only fixed frontend status parameters. Authorization
codes, access tokens, refresh tokens, provider payloads, and account identifiers
must never appear in callback redirect URLs.

Explicit account linking, account recovery, email verification, and
session/device listing remain future lifecycle work.

## Authorization

Every protected endpoint must enforce:

- workspace membership
- role authority
- resource ownership or workspace boundary
- action-specific rules

Frontend visibility does not authorize backend actions.

## Workspace Boundary

Workspace is the tenant boundary.

All routes that operate on workspace-scoped resources must derive or validate workspace scope from trusted backend state, not only from client-provided identifiers.

High-risk endpoints:

- list/search/count
- exports
- file access
- realtime subscription setup
- background-job-triggering endpoints

## Pagination, Filtering, and Sorting

List endpoints should define:

- pagination model: page/pageSize or cursor
- maximum page size
- allowed filters
- allowed sort fields
- stable default sort
- workspace scoping behavior

Reject unknown filters or unsafe sort fields.

## State Transitions

Use explicit transition semantics for lifecycle changes such as task status or membership role changes.

Prefer command-shaped PATCH payloads when a transition has rules:

```json
{
  "status": "IN_PROGRESS"
}
```

Return `409` when the transition is invalid for the current state.

## Realtime Events

API mutations that emit realtime updates must:

- persist the authoritative state first
- emit only to authorized workspace members
- avoid exposing sensitive payloads
- keep event payloads compatible with API contracts

Common event names:

- `task.created`
- `task.updated`
- `comment.created`
- `notification.created`

## Swagger/OpenAPI

Swagger must document:

- auth requirements
- request body schemas
- response envelope
- error responses
- pagination/filter/sort options
- role or workspace access notes where useful

Swagger updates are required when API contracts change.

## Contract Testing

API contract tests should cover:

- response envelope
- error shape
- auth-required behavior
- permission-denied behavior
- workspace isolation behavior
- pagination/filter/sort contract
- Swagger/OpenAPI consistency

## Open Decisions

- Cursor pagination or page/pageSize for MVP?
- Whether DELETE means hard delete or archive for each resource?
- API versioning policy before public release?

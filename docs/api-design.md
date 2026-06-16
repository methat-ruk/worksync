# WorkSync API Design

This document defines API conventions for WorkSync. Swagger/OpenAPI should reflect these rules as implementation is added.

## API Style

- Use REST.
- Prefer JSON request and response bodies.
- Use resource-oriented routes.
- Keep response shapes predictable.
- Enforce authentication and authorization on the backend.

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
  }
}
```

Do not expose stack traces, raw database errors, secrets, tokens, provider payloads, or internal infrastructure details.

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

- Use JWT access tokens and refresh tokens.
- Access tokens authenticate API calls.
- Refresh token rotation, invalidation, and reuse handling must be specified during implementation.
- Logout must invalidate the relevant refresh token/session state.

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
- Exact refresh token storage and rotation policy?
- Whether DELETE means hard delete or archive for each resource?
- API versioning policy before public release?

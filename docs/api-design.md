# WorkSync API Design

This document is the entry point for WorkSync API contracts. Keep it short and
move detailed contract rules into the topic files under `docs/api-design/`.

Swagger/OpenAPI should reflect these rules as implementation is added.

## Reading Map

| Topic | File |
|---|---|
| API style, methods, envelopes, status codes, pagination, transitions, Swagger, and contract tests | [Conventions](api-design/conventions.md) |
| Public error shape, correlation IDs, and operational endpoints | [Errors and Operational Endpoints](api-design/errors-and-operational.md) |
| Password auth, sessions, refresh/logout, Google OAuth, and auth limits | [Authentication](api-design/authentication.md) |
| Workspace create/read/list contracts and workspace DTO shape | [Workspace Management](api-design/workspaces.md) |
| Project create/list/read/update contracts and project DTO shape | [Project Management](api-design/projects.md) |
| Task create/read/update/status, assignment search, filtering, and lifecycle contracts | [Task Management](api-design/tasks.md) |
| Comment list/create, mention occurrences, candidate search, cursor, and role contracts | [Comments and Mentions](api-design/comments.md) |
| Recipient-scoped mention notifications, read state, pagination, and public payload rules | [Notifications](api-design/notifications.md) |
| Task attachment upload, list, forced download, delete, lifecycle, and failure contracts | [Task Attachments](api-design/attachments.md) |
| Server-side authorization, workspace boundary rules, and realtime event safety | [Authorization and Boundaries](api-design/authorization-boundaries.md) |

## Ownership Rules

- API contracts must stay smaller than internal persistence models.
- Feature modules must use the shared response envelope and API error DTO unless
  a contract explicitly says otherwise.
- Public error codes must be registered in the backend error-code registry
  before use.
- Swagger updates are required when API contracts change.
- Contract tests should protect response shape, error shape, auth behavior,
  workspace isolation, pagination, and Swagger/OpenAPI consistency.

## Current Open Decisions

Current API-wide open decisions live in
[Conventions](api-design/conventions.md#open-decisions).

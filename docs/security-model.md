# WorkSync Security Model

Security in WorkSync is centered on identity, role authority, workspace isolation, safe file handling, and sensitive-data protection.

## Protected Assets

- user accounts
- access tokens and refresh tokens
- workspace data
- projects and tasks
- comments and mentions
- uploaded files
- notifications
- activity logs
- background job payloads
- audit and operational logs

## Trust Boundaries

Untrusted:

- browser clients
- request bodies
- query parameters
- route parameters
- uploaded files
- realtime client events
- external provider callbacks
- background job payloads until validated

Trusted only after validation and authorization:

- authenticated identity
- workspace membership
- role authority
- resource ownership or workspace boundary

## Authentication

Use:

- JWT access token
- refresh token

Required controls:

- reject missing, malformed, expired, and revoked tokens
- invalidate refresh tokens on logout
- detect or safely handle refresh token reuse
- avoid storing tokens in logs, telemetry, screenshots, or errors
- define token lifetimes before production

## Authorization Model

Roles:

| Role | Security Meaning |
|---|---|
| OWNER | full workspace control and owner-only actions |
| ADMIN | workspace administration except owner-only actions |
| MEMBER | normal collaboration actions |
| VIEWER | read-only access |

Authorization must be enforced by backend guards or services.

Every protected action should answer:

1. Who is the principal?
2. Which workspace is the resource in?
3. Is the principal a member of that workspace?
4. Does the role allow this action?
5. Are there resource-specific constraints?

## Workspace Isolation

Workspace is the tenant boundary.

Controls:

- every workspace-scoped query includes workspace boundary enforcement
- list, search, count, and export endpoints must not leak other workspaces
- background jobs must include validated workspace context
- realtime rooms must be joined only after authorization
- file access must verify permission to the associated resource
- logs and errors must not reveal cross-workspace existence

Use 404 instead of 403 where existence leakage is a risk.

## Role Matrix Draft

| Capability | OWNER | ADMIN | MEMBER | VIEWER |
|---|---:|---:|---:|---:|
| View workspace | yes | yes | yes | yes |
| Update workspace metadata | yes | yes | no | no |
| Manage members | yes | yes, except owner-only actions | no | no |
| Change owner role | yes | no | no | no |
| Create project | yes | yes | maybe | no |
| Update project | yes | yes | maybe | no |
| Create task | yes | yes | yes | no |
| Update task | yes | yes | yes, when allowed | no |
| Comment | yes | yes | yes | no or maybe |
| Upload file | yes | yes | yes, when allowed | no |
| View activity log | yes | yes | maybe | maybe |

Open decisions must be resolved before implementation for `maybe` cells.

## File Upload Security

Controls:

- validate content type and extension
- enforce maximum size
- normalize filenames
- prevent path traversal
- store metadata with workspace/resource scope
- verify access before download or preview
- do not expose private object URLs directly unless intentionally signed and bounded
- add malware/content scanning hook when selected

## Realtime Security

Controls:

- authenticate connection
- authorize workspace room join
- validate client events
- never trust client-provided workspace membership
- emit only to authorized members
- avoid sensitive payloads in realtime events

## Background Job Security

Controls:

- validate job payloads
- include workspace and actor context where required
- re-check authorization or authority for sensitive side effects
- keep jobs idempotent
- prevent cross-workspace side effects
- avoid secrets in job payloads

## Sensitive Data Handling

Never expose:

- secrets
- access or refresh tokens
- password material
- private file URLs
- raw provider credentials
- unnecessary personal data

Review:

- logs
- telemetry
- error responses
- browser storage
- screenshots and traces
- exported files

## Security Testing Baseline

Required high-value checks:

- lower-privilege role cannot perform restricted action
- user cannot access another workspace's resources
- direct API calls cannot bypass frontend restrictions
- revoked or malformed tokens fail safely
- realtime event does not cross workspace boundary
- file upload rejects unsafe inputs
- sensitive data does not appear in logs, browser storage, or errors

See `references/worksync/testing.md` for the detailed testing profile.

## Open Decisions

- Exact role matrix for project/task/comment/file actions
- Refresh token storage and rotation implementation
- File type allowlist and size limits
- Audit log retention
- Whether viewer can comment or only read

# Comment and Mention API

Comments are nested under a workspace, project, and task. Every operation first
proves current workspace membership and that the project and task belong to the
same workspace boundary.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/comments` | List a bounded comment page |
| `POST` | `/api/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/comments` | Create a plain-text comment |
| `GET` | `/api/workspaces/:workspaceId/mention-candidates` | Search eligible workspace members |

## Roles and Isolation

- `OWNER`, `ADMIN`, `MEMBER`, and `VIEWER` may list comments and search mention
  candidates.
- `OWNER`, `ADMIN`, and `MEMBER` may create comments; `VIEWER` is read-only.
- Wrong-workspace, wrong-project, and invisible task identifiers use the safe
  not-found contract.
- Candidate search excludes the caller and returns only `id`, `displayName`,
  and the server-derived `mentionLabel`.

## Plain-Text and Mention Contract

The create request accepts a canonical plain-text `body` of 1–4,000 UTF-16 code
units and `mentions: Array<{ userId, start, end }>`. LF is supported; outer
whitespace, CR, tabs, C0/C1 controls, and noncanonical line endings are
rejected.

Each range is a non-overlapping UTF-16 occurrence whose visible slice must be
`@` plus the current server-derived mention label. The server resolves every
target against current workspace membership inside the comment transaction.
Self, removed-member, nonmember, stale-label, overlapping, duplicate, and
out-of-range occurrences fail with one safe validation response. A comment is
bounded to 10 distinct recipients and 20 occurrences.

The public comment contains `id`, `taskId`, `body`, a narrow author summary,
`mentions: Array<{ start, end }>`, and `createdAt`. Recipient IDs remain
server-side and are not exposed in comment history.

## Listing and Candidate Bounds

Comment listing defaults to 30 and accepts `limit` 1–100. It selects the latest
page by `(createdAt, id) DESC`, returns that page chronologically, and supplies
an opaque versioned cursor only when an older page exists. Malformed or
unsupported cursors return `400`; no total count is returned.

Candidate search requires a trimmed query of 1–100 characters, returns at most
10 deterministic results ordered by display name and user ID, and remains
workspace-scoped.

## Persistence and Concurrency

Comment and mention-occurrence rows are created atomically in a serializable
PostgreSQL transaction. Serialization conflicts use the shared bounded retry
policy and return a stable `409` after exhaustion. Historical comment text,
author attribution, and occurrence ranges remain readable after membership
removal. The internal versioned `comment.created` result carries stable IDs and
deduplicated recipient IDs but is not published by this foundation.

## Errors and Documentation

The endpoints use the shared response envelope and API error shape. Swagger,
contract tests, real-PostgreSQL integration tests, and security tests protect
validation, role, cursor, transaction, and tenant-isolation behavior.

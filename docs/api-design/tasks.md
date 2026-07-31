# Task Management API

Task endpoints are nested under a workspace and project. Every lookup proves
workspace membership and project ownership before returning or mutating task
data.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/workspaces/:workspaceId/projects/:projectId/tasks` | Create a task |
| `GET` | `/api/workspaces/:workspaceId/projects/:projectId/tasks` | List and filter tasks |
| `GET` | `/api/workspaces/:workspaceId/projects/:projectId/tasks/:taskId` | Read one task |
| `PATCH` | `/api/workspaces/:workspaceId/projects/:projectId/tasks/:taskId` | Update task details or assignment |
| `PATCH` | `/api/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/status` | Apply one lifecycle transition |
| `GET` | `/api/workspaces/:workspaceId/task-assignees` | Search assignable workspace members |

## Public Task Contract

The task DTO contains:

- `id`, `projectId`, `title`, `description`, and `status`
- narrow creator and assignee summaries
- `dueDate`
- `createdAt` and `updatedAt`

Persistence-only relations and internal membership data are not public task
fields.

## Roles and Isolation

- `OWNER`, `ADMIN`, and `MEMBER` may create, edit, assign, and transition tasks.
- `VIEWER` may list, filter, and read tasks but cannot mutate them.
- Assignee search is available to all workspace roles because it returns only
  the minimum task-assignment identity shape.
- An assignee must be an active member of the task's workspace.
- Cross-workspace and wrong-project task identifiers return the same safe
  not-found response and do not reveal resource existence.

## Lifecycle

The fixed MVP statuses are `BACKLOG`, `IN_PROGRESS`, `DONE`, and `CANCELED`.

Allowed transitions:

```text
BACKLOG -> IN_PROGRESS | CANCELED
IN_PROGRESS -> DONE | CANCELED
DONE -> IN_PROGRESS
CANCELED -> no transition
```

Unsupported transitions return `INVALID_TASK_TRANSITION`.

## Assignment and Membership Concurrency

Removing a workspace member and clearing their task assignments happen in one
serializable PostgreSQL transaction. A concurrent assignment cannot leave a
removed member assigned to a task. Serialization conflicts are retried only for
Prisma `P2034`, with three total attempts and bounded backoff.

## Listing

Task lists use bounded page pagination and accept optional `status` and
`assigneeId` filters. Boolean query values, where present in shared list
contracts, accept only the exact strings `true` and `false`; unsupported values
remain invalid input rather than being coerced.

## Errors and Documentation

All endpoints use the shared response envelope and public API error shape.
Swagger documents DTOs, filters, role failures, not-found behavior, and invalid
status transitions. Contract, integration, and security tests protect the
documented behavior.

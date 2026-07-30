# Project Management API

Project endpoints require a valid access token and current workspace
membership. Projects are always addressed beneath their workspace so the
workspace tenant boundary remains explicit.

## Endpoints

- `POST /api/workspaces/:workspaceId/projects` creates a project from
  `{ "name": string, "key": string }`.
- `GET /api/workspaces/:workspaceId/projects` lists projects using `page` and
  `pageSize`.
- `GET /api/workspaces/:workspaceId/projects/:projectId` reads a project only
  when it belongs to the route workspace.
- `PATCH /api/workspaces/:workspaceId/projects/:projectId` updates the project
  name from `{ "name": string }`.

Project deletion, archival, key changes, descriptions, and task operations are
outside this contract.

## Public Project DTO

Project responses expose only:

- `id`
- `name`
- `key`
- `createdAt`
- `updatedAt`

They do not expose workspace relations, tasks, membership, authorization
context, or Prisma records.

## Name and Key Contract

- names are trimmed, required after trimming, and limited to 100 characters
- keys are trimmed and converted to uppercase
- keys must match `^[A-Z][A-Z0-9]{1,9}$`
- keys are 2-10 characters, start with a letter, and contain only uppercase
  ASCII letters and digits
- a key is immutable after project creation
- a normalized key is unique within one workspace but may be reused in a
  different workspace
- duplicate workspace/key creation returns `409 RESOURCE_CONFLICT`

Unknown request or query fields are rejected. Clients cannot assign project ID,
workspace ID, key, timestamps, relations, or role data through update.

## List Contract

Project lists default to `page=1` and `pageSize=20`. The maximum page is
10,000, and the maximum page size is 100. Results are ordered by `updatedAt`
descending with `id` ascending as a stable tie-breaker.

List responses include `items`, `page`, `pageSize`, and `total`.

## Role and Workspace Rules

- `OWNER`, `ADMIN`, and `MEMBER` can create and update projects.
- `VIEWER` can list and read projects but cannot mutate them.
- missing, removed, or cross-workspace caller membership returns the existing
  tenant-hiding workspace `404 RESOURCE_NOT_FOUND` contract.
- a missing project or project ID outside the proven workspace returns
  `404 RESOURCE_NOT_FOUND` with `Project not found`.
- a proven viewer attempting create or update receives
  `403 AUTHORIZATION_DENIED`.

Every project route resolves the internal trusted workspace actor from
server-owned authenticated identity and route workspace ID. Project-by-ID
queries constrain both project ID and the actor's workspace ID. Frontend role
visibility is not authorization.

## Response Envelopes

Single-project responses use:

```ts
{
  success: true;
  message?: string;
  data: {
    project: PublicProjectDto;
  };
}
```

List responses use:

```ts
{
  success: true;
  data: {
    items: PublicProjectDto[];
    page: number;
    pageSize: number;
    total: number;
  };
}
```

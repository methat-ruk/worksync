# Feature Plan: Project Foundation

Status: Planned

Intended PR: `feat/project-foundation`

Milestone: 2 - Projects and Tasks

## Goal

Allow authorized workspace members to create, list, read, and update projects
inside a workspace boundary.

## Scope

- project create/list/read/update APIs
- consume the reusable trusted workspace actor boundary for every project route
- define project-action policy without duplicating workspace membership queries
- project DTO and error contract
- Swagger docs
- backend integration/contract/security tests
- minimal frontend project list or creation entry if the contract is stable

## Out of Scope

- task CRUD
- project archival lifecycle unless required for MVP
- project templates
- realtime project updates

## Affected Surfaces

- backend API
- Prisma project queries
- Swagger
- frontend API client if UI is included

## Security and Data Boundary

Every project query must prove workspace membership. Direct project ID access
must not bypass workspace authorization. Membership identity and role must come
from the shared server-owned workspace authorization boundary, not from client
input or a project-specific membership implementation.

## Required Evidence

- allowed member project create/read
- cross-workspace project read rejected
- role restrictions if the role matrix limits project creation
- contract tests for validation and errors
- frontend loading/error/empty states if UI is included

## Done Criteria

- project contract can support task foundation
- project routes cannot leak cross-workspace data

## Dependencies

- workspace foundation
- workspace membership/RBAC
- [workspace authorization boundary](workspace-authorization-boundary.md)

## Follow-up

- task foundation

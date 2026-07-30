# Feature Plan: Task Foundation

Status: Planned

Intended PR: `feat/task-foundation`

Milestone: 2 - Projects and Tasks

## Goal

Allow authorized workspace members to create, read, update, and transition tasks
within a project.

## Scope

- task CRUD APIs
- task status transition rules
- assignment and due date support if required for MVP
- workspace/project-scoped authorization
- task DTO and Swagger docs
- integration, contract, and security tests
- frontend task list or board path if API is stable

## Out of Scope

- comments
- mentions
- notifications
- file attachments
- configurable workflow statuses

## Affected Surfaces

- backend API
- Prisma task queries
- frontend task workflows if included
- security tests

## Security and Data Boundary

Task access must verify the task's project and workspace membership. Assignee
or creator IDs must not allow cross-workspace relation tampering.

## Required Evidence

- create/read/update task success
- invalid status transition rejected
- cross-workspace project/task access rejected
- assignee relation tampering rejected
- frontend state coverage if UI is included

## Done Criteria

- task lifecycle invariants are documented and tested
- task foundation is ready for comments and notifications

## Dependencies

- [project foundation](../completed/project-foundation.md)
- workspace membership/RBAC

## Follow-up

- comments and mentions foundation
- notifications foundation

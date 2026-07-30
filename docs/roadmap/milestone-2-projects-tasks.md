# Milestone 2 - Projects and Tasks

Status: Partial

## Goal

Workspace members can create projects, create and update tasks, assign work,
track status, and see task activity inside the correct workspace boundary.

## Foundation Already Present

- Prisma `Project` model
- Prisma `Task` model
- `TaskStatus` enum with `BACKLOG`, `IN_PROGRESS`, `DONE`, and `CANCELED`
- user relations for task creator and assignee

## Delivered

- project create, list, read, and update APIs
- workspace-scoped project authorization and tenant isolation
- project key normalization, immutability, and workspace-local uniqueness
- frontend selected-workspace project list/create workflow
- project unit, contract, integration, security, component, and browser evidence

## Still Required

- task CRUD APIs
- task status transition rules
- assignment and due date support
- task list view
- board view
- activity log model and write path
- workspace-scoped authorization for all task routes
- frontend project update and task workflows
- task API contract, integration, and security tests

Feature plan order:

1. [Project Foundation](feature-plans/completed/project-foundation.md)
2. [Task Foundation](feature-plans/planned/task-foundation.md)

## Exit Criteria

- task lifecycle invariants are documented: Partial
- task APIs follow response and error conventions: Not done
- frontend covers loading, empty, error, and success states: Done for project
  list/create; not done for tasks

## Related Docs

- [Domain Model](../domain-model.md)
- [API Design](../api-design.md)
- [Security Model](../security-model.md)
- [Frontend and Backend API Workflow](../workflows/frontend-backend-api-workflow.md)

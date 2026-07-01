# Milestone 2 - Projects and Tasks

Status: Partial foundation only

## Goal

Workspace members can create projects, create and update tasks, assign work,
track status, and see task activity inside the correct workspace boundary.

## Foundation Already Present

- Prisma `Project` model
- Prisma `Task` model
- `TaskStatus` enum with `BACKLOG`, `IN_PROGRESS`, `DONE`, and `CANCELED`
- user relations for task creator and assignee

## Still Required

- project CRUD APIs
- task CRUD APIs
- task status transition rules
- assignment and due date support
- task list view
- board view
- activity log model and write path
- workspace-scoped authorization for all project/task routes
- frontend project/task workflows
- API contract, integration, and security tests

## Exit Criteria

- task lifecycle invariants are documented: Partial
- task APIs follow response and error conventions: Not done
- frontend covers loading, empty, error, and success states: Not done for
  projects/tasks

## Related Docs

- [Domain Model](../domain-model.md)
- [API Design](../api-design.md)
- [Security Model](../security-model.md)
- [Frontend and Backend API Workflow](../workflows/frontend-backend-api-workflow.md)

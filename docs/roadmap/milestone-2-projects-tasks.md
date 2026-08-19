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
- task create, list, read, update, and status-transition APIs
- fixed `BACKLOG`, `IN_PROGRESS`, `DONE`, and `CANCELED` lifecycle rules
- task assignment, due dates, bounded filters, and assignee search
- workspace/project-scoped task authorization and safe tenant isolation
- atomic member removal and task unassignment under concurrent assignment
- frontend task list, create/edit, assignment auto-search, filters, and status
  workflow
- task unit, contract, integration, security, component, mocked browser, and
  live browser evidence

## Still Required

- task UI boundary/accessibility remediation before adding comments
- shared frontend pagination reconciliation
- production-dead task authorization policy cleanup
- board view
- activity log model and write path
- frontend project update workflow

Feature plan order:

1. [Project Foundation](feature-plans/completed/project-foundation.md)
2. [Task Foundation](feature-plans/completed/task-foundation.md)
3. [Frontend UI Runtime Compatibility](feature-plans/completed/frontend-ui-runtime-compatibility.md)
4. [Frontend Recovery and App-Shell Copy Consistency](feature-plans/completed/frontend-recovery-app-shell-copy-consistency.md)
5. [Task UI Boundaries](feature-plans/planned/task-ui-boundaries.md)
6. [Frontend Pagination Reconciliation](feature-plans/planned/frontend-pagination-reconciliation.md)
7. [Task Authorization Policy Cleanup](feature-plans/planned/task-authorization-policy-cleanup.md)

## Exit Criteria

- task lifecycle invariants are documented: Done
- task APIs follow response and error conventions: Done
- frontend covers loading, empty, error, and success states: Done for project
  list/create and the task workflow

## Related Docs

- [Domain Model](../domain-model.md)
- [API Design](../api-design.md)
- [Security Model](../security-model.md)
- [Frontend and Backend API Workflow](../workflows/frontend-backend-api-workflow.md)

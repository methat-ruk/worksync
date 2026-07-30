# WorkSync Feature Plans

Feature plans sit between roadmap milestones and implementation plans.

```text
Roadmap -> Milestone -> Feature Plan -> PR / Issue -> Implementation Plan
```

A feature plan should normally fit one reviewable PR. Split it when the review,
security, migration, or validation surface becomes too large. Merge slices only
when they cannot be validated independently.

## How to Choose What Comes Next

Prioritize planned work by:

1. milestone order and dependency chain
2. security or data boundary risk
3. ability to unlock the next user-visible workflow
4. smallest complete slice that can be reviewed deeply
5. availability of validation evidence

For the current roadmap, this means:

1. task foundation
2. comments, notifications, files, jobs, and production readiness

Do not start project/task/comment/file work before workspace ownership and
tenant-isolation evidence exist.

## Planned Feature Plans

| Order | Plan | Milestone | Status |
|---|---|---|---|
| 1 | [Task Foundation](planned/task-foundation.md) | 2 | Next |
| 2 | [Comments and Mentions Foundation](planned/comments-mentions-foundation.md) | 3 | Planned |
| 3 | [Notifications Foundation](planned/notifications-foundation.md) | 3 | Planned |
| 4 | [File Upload Foundation](planned/file-upload-foundation.md) | 4 | Planned |
| 5 | [Background Jobs Foundation](planned/background-jobs-foundation.md) | 4 | Planned |
| 6 | [Production Deployment Foundation](planned/production-deployment-foundation.md) | 5 | Planned |

## Completed Feature Summaries

Completed summaries are intentionally lighter than planned feature plans. They
capture delivered scope, key decisions, evidence, and follow-up without
reconstructing every historical implementation detail.

| Plan | Status |
|---|---|
| [Runtime and Validation Foundation](completed/runtime-validation-foundation.md) | Done |
| [Auth Foundation](completed/auth-foundation.md) | Done |
| [Auth Session Lifecycle](completed/auth-session-lifecycle.md) | Done |
| [Google OAuth Login](completed/auth-google-oauth.md) | Done |
| [Frontend Auth and App Shell](completed/frontend-auth-app-shell.md) | Done |
| [Workspace Foundation](completed/workspace-foundation.md) | Done |
| [Workspace Membership and RBAC](completed/workspace-membership-rbac.md) | Done |
| [Workspace Frontend Bootstrap](completed/workspace-frontend-bootstrap.md) | Done |
| [Frontend Structure Boundaries](completed/frontend-structure-boundaries.md) | Done |
| [Frontend Auth State and Redirect Safety](completed/frontend-auth-state-and-redirect-safety.md) | Done |
| [Auth Session Concurrency Hardening](completed/auth-session-concurrency-hardening.md) | Done |
| [Workspace Pagination and Selection](completed/workspace-pagination-and-selection.md) | Done |
| [Workspace Authorization Boundary](completed/workspace-authorization-boundary.md) | Done |
| [Project Foundation](completed/project-foundation.md) | Done |
| [Database Environment Isolation](completed/database-environment-isolation.md) | Done |

## Feature Plan Template

Use this shape for future plans:

```md
# Feature Plan: Name

Status:
Intended PR:
Milestone:

## Goal

## Scope

## Out of Scope

## Affected Surfaces

## Security and Data Boundary

## Required Evidence

## Done Criteria

## Dependencies

## Follow-up
```

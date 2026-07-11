# WorkSync Roadmap

This roadmap is the dashboard for product progress. Milestone details live in
separate files so this page stays easy to scan. PR-sized feature slices live in
[Feature Plans](roadmap/feature-plans/README.md).

Last updated: 2026-07-11

## Current Snapshot

WorkSync is past the basic foundation phase and currently sits between
Milestone 0 and Milestone 1.

Done:

- application foundation
- authentication foundation
- session lifecycle and refresh rotation
- Google OAuth login
- frontend auth flows and protected routing
- auth rate limiting
- workspace creation, list/read APIs, owner membership, workspace isolation
  evidence, workspace membership/RBAC APIs, and frontend workspace bootstrap
- Docker hybrid and full run modes
- backend/frontend validation commands and CI structure
- project setup, workflow, API, security, deployment, and roadmap docs

Still missing before the collaboration MVP works:

- repository-health remediation for frontend auth state/redirect safety,
  multi-context refresh concurrency, workspace pagination, and a reusable
  workspace authorization boundary
- project/task APIs and frontend workflows
- workspace-scoped authorization for project, task, comment, file, and activity
  resources
- comments, mentions, notifications, realtime, files, jobs, and production
  readiness

## Milestone Status

| Milestone | Status | Summary | Details |
|---|---|---|---|
| 0 Foundation | Done | App skeleton, auth foundation, CI, Docker, validation, and docs are in place. | [Milestone 0](roadmap/milestone-0-foundation.md) |
| 1 Identity and Workspace | Partial | Auth, workspace APIs, workspace membership/RBAC, and frontend workspace bootstrap are in place; downstream workspace-scoped resource authorization remains. | [Milestone 1](roadmap/milestone-1-identity-workspace.md) |
| 2 Projects and Tasks | Partial foundation only | Prisma models exist; APIs, UI, authorization, and tests are not implemented. | [Milestone 2](roadmap/milestone-2-projects-tasks.md) |
| 3 Comments, Mentions, and Notifications | Partial foundation only | Comment model exists; mentions, notifications, and realtime are not implemented. | [Milestone 3](roadmap/milestone-3-comments-notifications.md) |
| 4 File Uploads and Background Jobs | Planned | MinIO and Redis local services exist; storage and job features are not implemented. | [Milestone 4](roadmap/milestone-4-files-jobs.md) |
| 5 Production Readiness | Partial | CI, Docker, artifact checks, and docs exist; deployment target and production ops are not ready. | [Milestone 5](roadmap/milestone-5-production-readiness.md) |

## Current Priorities

1. [Frontend Auth State and Redirect Safety](roadmap/feature-plans/planned/frontend-auth-state-and-redirect-safety.md)
   and [Auth Session Concurrency Hardening](roadmap/feature-plans/planned/auth-session-concurrency-hardening.md)
   - make session state, navigation, and concurrent refresh behavior explicit
     before more authenticated workflows depend on them.
2. [Workspace Pagination and Selection](roadmap/feature-plans/planned/workspace-pagination-and-selection.md)
   and [Workspace Authorization Boundary](roadmap/feature-plans/planned/workspace-authorization-boundary.md)
   - close the existing workspace UX gap and establish the reusable tenant
     boundary required by downstream resources.
3. [Project Foundation](roadmap/feature-plans/planned/project-foundation.md)
   - create the first workspace-scoped project API on the shared authorization
     boundary.
4. [Task Foundation](roadmap/feature-plans/planned/task-foundation.md)
   - build the first task workflow inside the workspace/project boundary.
5. Add activity, comments, notifications, files, jobs, and production readiness
   only after workspace-scoped project/task authorization evidence exists.

## Guiding Principles

- Use milestones for capability sequence and feature plans for PR-sized
  execution slices.
- Protect workspace isolation and authorization from the first workspace feature.
- Prefer a small complete workflow over many partial features.
- Keep frontend, backend, data, documentation, and tests moving together.
- Treat realtime, jobs, storage, and release readiness as production concerns,
  not polish.
- Do not start Workspace/RBAC-adjacent product work without IDOR/BOLA,
  ownership, and tenant-isolation evidence.

## MVP Goal

A user can create a workspace, manage members, create a project, create and
update tasks, comment on work, receive relevant notifications, and trust that
access is scoped to the correct workspace.

## Out of Scope for MVP

- billing
- public marketplace integrations
- advanced automation rules
- advanced analytics
- mobile application
- offline mode
- complex portfolio planning
- explicit account-linking UI/API
- email verification
- forgot/reset password
- account deletion
- session/device listing

## Open Questions

- Invitation flow: email invite only, link invite, direct member add, or a
  staged combination?
- Task workflow: fixed status model or configurable statuses?
- Project/task permission matrix: can MEMBER create projects, or only tasks?
- Viewer behavior: read-only only, or can viewers comment?
- File upload: direct-to-storage upload or backend proxy?
- File policy: allowed types, maximum size, preview rules, and malware scanning
  hook?
- Notification channels: in-app only for MVP, or email as well?
- Activity log retention period?
- Pagination model: cursor or page/pageSize for MVP lists?

## Roadmap Detail Policy

This page should answer "where are we, what is next, and where do I read more?"

Keep here:

- current snapshot
- milestone status table
- current priorities
- major open decisions

Put milestone details in `docs/roadmap/milestone-*.md`.

Put PR-sized execution slices in `docs/roadmap/feature-plans/`.

Keep outside the roadmap:

- per-file implementation tasks
- individual test case lists
- sprint-level assignments
- long validation logs
- detailed API schemas already owned by API documentation or Swagger

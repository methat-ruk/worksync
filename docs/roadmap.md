# WorkSync Roadmap

This roadmap is the dashboard for product progress. Milestone details live in
separate files so this page stays easy to scan. PR-sized feature slices live in
[Feature Plans](roadmap/feature-plans/README.md).

Last updated: 2026-09-03

## Current Snapshot

WorkSync has completed the project and task foundation slices in Milestone 2
and the comments, mentions, and stored-notification foundations in Milestone 3.
The frontend runtime compatibility, recovery/app-shell copy, task UI, and shared
pagination findings from the repository health review are resolved. The
production-dead task read-policy abstraction is also removed with real-database
role and tenant-isolation evidence. The next planned product capability is the
File Upload Backend and Storage Foundation, followed by Task Attachment UI
Integration.

Done:

- application foundation
- authentication foundation
- session lifecycle and refresh rotation
- Google OAuth login
- frontend auth flows and protected routing
- explicit frontend auth recovery states, existing-session handling on public
  auth routes, Google OAuth completion retry, and same-origin post-login
  redirects
- auth rate limiting
- workspace creation, list/read APIs, owner membership, workspace isolation
  evidence, workspace membership/RBAC APIs, and frontend workspace bootstrap
- reusable trusted workspace actor boundary for downstream resources
- workspace-scoped project create/list/read/update APIs, project authorization
  and tenant-isolation evidence, and frontend project list/create workflow
- workspace/project-scoped task create/list/read/update/status APIs, fixed task
  lifecycle, assignment and due dates, viewer read-only access, membership
  removal concurrency protection, and task authorization/isolation evidence
- explicit task read-policy ownership with the production-dead role helper
  removed and PostgreSQL role/isolation regressions
- frontend task list, filters, create/edit/status workflow, assignee auto-search,
  semantic action colors, and concise authentication errors
- Docker hybrid and full run modes
- backend/frontend validation commands and CI structure
- coherent Tailwind CSS 4/shadcn runtime contract with current-engine
  Chromium, Firefox, and WebKit compatibility evidence
- accurate auth-recovery messages, announced retry loading, and app-shell copy
  that exposes only current routes and actions
- maintainable task UI component boundaries, accessible assignee search, and a
  separate viewer-accessible discussion host
- workspace-scoped plain-text task comments, durable mention occurrences,
  bounded mention search, stable cursor pagination, viewer read access, and
  accessible desktop/mobile task discussion UI
- private stored mention notifications with atomic source persistence,
  deterministic read state, recipient-scoped APIs, and an accessible responsive
  app-shell panel
- project setup, workflow, API, security, deployment, and roadmap docs

Still missing before the collaboration MVP works:

- workspace-scoped authorization for file and activity resources
- realtime, files, jobs, and production readiness

## Milestone Status

| Milestone | Status | Summary | Details |
|---|---|---|---|
| 0 Foundation | Done | App skeleton, auth foundation, CI, Docker, validation, and docs are in place. | [Milestone 0](roadmap/milestone-0-foundation.md) |
| 1 Identity and Workspace | Partial | Auth, workspace APIs, membership/RBAC, frontend workspace bootstrap, and the reusable actor boundary are in place; remaining downstream resource policy and scoping continue by feature. | [Milestone 1](roadmap/milestone-1-identity-workspace.md) |
| 2 Projects and Tasks | Partial | Project and task foundations, authorization, UI, and evidence are complete; board view, project update UI, and activity logging remain. | [Milestone 2](roadmap/milestone-2-projects-tasks.md) |
| 3 Comments, Mentions, and Notifications | In progress | Comments, mentions, and stored notifications are delivered; realtime remains. | [Milestone 3](roadmap/milestone-3-comments-notifications.md) |
| 4 File Uploads and Background Jobs | Planned | MinIO and Redis local services exist; storage and job features are not implemented. | [Milestone 4](roadmap/milestone-4-files-jobs.md) |
| 5 Production Readiness | Partial | CI, Docker, artifact checks, and docs exist; deployment target and production ops are not ready. | [Milestone 5](roadmap/milestone-5-production-readiness.md) |

## Current Priorities

1. [File Upload Backend and Storage Foundation](roadmap/feature-plans/planned/file-upload-foundation.md)
   - establish the task-scoped attachment persistence, storage, API, security,
     reconciliation, and real-MinIO validation boundary.
2. [Task Attachment UI Integration](roadmap/feature-plans/planned/task-attachment-ui-integration.md)
   - complete progress, cancel, retry, list, download, delete, accessibility,
     and live-browser evidence on the merged backend contract.
3. Add jobs, activity, and production readiness in
   dependency order. If attachments require asynchronous scanning, split the
   work around the attachment lifecycle contract, scan worker, and final
   availability/UI integration rather than creating a file/job dependency
   cycle.

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
- Future file policy: what evidence or product need justifies broadening beyond
  the PNG/JPEG-only, 10 MiB, forced-download foundation and introducing
  scanning, previews, or direct/resumable transport?
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

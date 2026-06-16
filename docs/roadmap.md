# WorkSync Roadmap

This roadmap defines the initial product build sequence. It is intentionally milestone-based rather than date-based until implementation velocity is known.

## Guiding Principles

- Protect workspace isolation and authorization from the first milestone.
- Prefer a small complete workflow over many partial features.
- Keep frontend, backend, data, and tests moving together.
- Treat realtime, jobs, storage, and release readiness as production concerns, not polish.

## MVP Goal

A user can create a workspace, manage members, create a project, create and update tasks, comment on work, receive relevant notifications, and trust that access is scoped to the correct workspace.

## Milestone 0 - Foundation

Deliver:

- repository app skeleton
- local development setup
- `.env.example`
- database schema baseline
- authentication strategy
- shared validation and response conventions
- first CI checks

Exit criteria:

- frontend and backend start locally
- database migration applies cleanly
- typecheck, lint, test, and build commands are documented

## Milestone 1 - Identity and Workspace

Deliver:

- sign up, login, logout
- access token and refresh token flow
- workspace creation
- membership model
- OWNER, ADMIN, MEMBER, VIEWER roles
- workspace isolation enforcement

Exit criteria:

- direct API calls cannot access another workspace
- role matrix has backend integration coverage
- critical auth and workspace flows have contract tests

## Milestone 2 - Projects and Tasks

Deliver:

- project CRUD
- task CRUD
- task status lifecycle
- assignment and due dates
- task list and board views
- activity log for task changes

Exit criteria:

- task lifecycle invariants are documented
- task APIs follow response and error conventions
- frontend covers loading, empty, error, and success states

## Milestone 3 - Comments, Mentions, and Notifications

Deliver:

- comments on tasks
- mention parsing
- notification creation
- notification read/unread state
- realtime notification delivery

Exit criteria:

- mention and notification rules are tested
- realtime events do not cross workspace boundaries
- background jobs are idempotent where applicable

## Milestone 4 - File Uploads and Background Jobs

Deliver:

- file metadata model
- upload flow
- file access controls
- email jobs
- reminder jobs
- daily summary jobs

Exit criteria:

- file upload security tests exist
- jobs validate payloads and handle retries
- storage access is scoped to authorized users

## Milestone 5 - Production Readiness

Deliver:

- deployment pipeline
- infrastructure readiness review
- observability for critical journeys
- release smoke tests
- backup and restore evidence
- security testing baseline

Exit criteria:

- release readiness can make a ready / not-ready decision from evidence
- rollback, containment, or forward-fix paths are documented
- post-deploy verification covers login, task, notification, queue, data, and storage paths

## Out of Scope for MVP

- billing
- public marketplace integrations
- advanced automation rules
- advanced analytics
- mobile application
- offline mode
- complex portfolio planning

## Open Questions

- Invitation flow: email invite only, link invite, or both?
- Task workflow: fixed status model or configurable statuses?
- File upload: direct-to-storage upload or backend proxy?
- Notification channels: in-app only for MVP, or email as well?
- Activity log retention period?

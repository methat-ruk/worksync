# Feature Plan: Comments and Mentions Foundation

Status: Planned

Intended PR: `feat/comments-mentions-foundation`

Milestone: 3 - Comments, Mentions, and Notifications

## Goal

Allow workspace members to comment on tasks and mention relevant workspace
members without leaking data across workspace boundaries.

## Scope

- comment create/list APIs
- mention parsing rules
- workspace-member validation for mentioned users
- frontend comment thread foundation
- API contracts and tests

## Out of Scope

- realtime delivery
- notification read/unread state
- rich text editor
- file attachments

## Affected Surfaces

- backend API
- Prisma comment queries
- frontend task detail/comment UI
- security tests

## Security and Data Boundary

Mention targets must belong to the task workspace. Comment reads must be scoped
through task/project/workspace membership.

## Required Evidence

- comment create/list success
- cross-workspace task comment rejected
- mention of non-member rejected or ignored according to contract
- frontend loading/error/empty states if UI is included

## Done Criteria

- comments are ready to emit notifications in a later slice
- mention rules are explicit and tested

## Dependencies

- task foundation
- workspace membership/RBAC

## Follow-up

- notifications foundation

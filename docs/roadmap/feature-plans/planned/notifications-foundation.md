# Feature Plan: Notifications Foundation

Status: Planned

Intended PR: `feat/notifications-foundation`

Milestone: 3 - Comments, Mentions, and Notifications

## Goal

Create and display relevant notifications for task collaboration events.

## Scope

- notification model if not already present
- notification creation rules
- read/unread state
- authenticated notification list API
- frontend notification surface
- tests for workspace-scoped delivery

## Out of Scope

- email notifications
- realtime transport if it needs a separate slice
- notification preferences
- mobile push

## Affected Surfaces

- backend API
- persistence
- frontend app shell
- security and integration tests

## Security and Data Boundary

Notifications must only be visible to the intended workspace member. Event
payloads must not include data from workspaces the user cannot access.

## Required Evidence

- notification creation for a supported event
- read/unread update
- cross-user notification access rejected
- no cross-workspace notification leakage
- frontend notification state coverage

## Done Criteria

- notification contract can later support realtime or email delivery
- notification privacy boundary is tested

## Dependencies

- comments and mentions foundation or another event source

## Follow-up

- realtime notification delivery
- background jobs for email summaries

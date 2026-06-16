# WorkSync Domain Model

This document captures business meaning and invariants. It is not a database schema, API contract, or UI model.

## Vocabulary

| Term | Definition |
|---|---|
| Workspace | Tenant boundary for team data, membership, projects, tasks, comments, files, notifications, and activity |
| Member | User with a role inside a workspace |
| Role | Workspace-level authority level: OWNER, ADMIN, MEMBER, VIEWER |
| Project | Container for related tasks within a workspace |
| Task | Unit of work tracked inside a project |
| Comment | Discussion entry attached to a task |
| Mention | Reference to a workspace member inside comment content |
| Notification | User-visible signal caused by relevant work activity |
| File | Uploaded or attached object associated with permitted workspace resources |
| Activity Log | Durable record of meaningful domain changes |

## Concepts

| Concept | Identity | Notes |
|---|---|---|
| User | stable user identity | May belong to many workspaces |
| Workspace | stable workspace identity | Primary tenant boundary |
| Membership | user + workspace relationship | Carries role |
| Project | stable project identity | Belongs to one workspace |
| Task | stable task identity | Belongs to one project and one workspace through that project |
| Comment | stable comment identity | Belongs to one task |
| Notification | stable notification identity | Belongs to one recipient |
| File | stable file identity | Metadata and authorization are in WorkSync; bytes live in object storage |
| Activity Log Entry | stable event record | Used for audit and debugging |

## Core Invariants

- A workspace is the tenant boundary.
- A protected resource belongs to exactly one workspace.
- A user may access a protected resource only through valid workspace membership and role authority.
- Frontend visibility never grants permission.
- A project belongs to one workspace.
- A task belongs to one project.
- A comment belongs to one task.
- A notification has one intended recipient.
- Realtime events must be delivered only to authorized workspace members.
- Background jobs must not create side effects outside the intended workspace boundary.
- Redis is not the source of truth for persistent business data.

## Role Invariants

- OWNER can manage workspace-level destructive or administrative actions.
- ADMIN can manage workspace work and members except owner-only actions.
- MEMBER can perform ordinary work actions allowed by product rules.
- VIEWER can read permitted resources but cannot mutate them.
- The final OWNER cannot be demoted or removed unless a safe ownership transfer rule exists.

## Task Lifecycle

Initial proposed task states:

```text
BACKLOG -> IN_PROGRESS -> DONE
BACKLOG -> CANCELED
IN_PROGRESS -> CANCELED
DONE -> IN_PROGRESS when reopen is allowed
```

Open questions:

- Are task statuses fixed globally or configurable per project?
- Is task archival separate from completion?
- Who may reopen a completed task?

## Membership Lifecycle

Initial proposed membership states:

```text
INVITED -> ACTIVE
INVITED -> EXPIRED
ACTIVE -> REMOVED
ACTIVE -> ROLE_CHANGED
```

Open questions:

- Are invitations email-only, link-based, or both?
- Can removed members be restored or only re-invited?
- Can a workspace have multiple OWNER members?

## Comment and Mention Rules

- A comment can mention only users who are valid members of the same workspace unless product rules allow external mentions.
- A mention may create a notification for the mentioned member.
- Comment visibility follows task and workspace authorization.

Open questions:

- Are comments editable?
- Are comments deletable?
- Do edits trigger notifications?

## Notification Rules

- Notifications are scoped to a recipient.
- Notifications must not expose resources outside the recipient's authorized workspace access.
- Realtime delivery is an optimization over persistent notification state.

Open questions:

- Which events create notifications in MVP?
- Are notifications persisted before realtime delivery?
- What is the retention policy?

## File Rules

- File metadata belongs to a workspace-scoped resource.
- File access requires permission to the associated resource.
- File content is untrusted input.
- Upload limits and content validation are required.

Open questions:

- Are files attached to tasks, comments, or both?
- Are previews generated?
- What file types and sizes are allowed?

## Activity Log Rules

- Activity logs record meaningful domain changes.
- Activity logs are workspace-scoped.
- Activity logs must not leak sensitive implementation details or secrets.

Open questions:

- Which changes are audit-worthy in MVP?
- Can users see all activity logs or only project/task-scoped logs?
- What is the retention period?

## Consistency Boundaries

Must be atomic:

- membership role change and authorization state
- task mutation and required activity log entry when audit is required
- notification persistence when the product treats notification as durable

May be eventual:

- email delivery
- daily summaries
- reminder jobs
- realtime delivery after persistent state is updated

## Domain Events

Candidate events:

- workspace.created
- membership.invited
- membership.role_changed
- project.created
- task.created
- task.updated
- task.completed
- comment.created
- notification.created
- file.attached

Events must preserve workspace boundary and avoid leaking sensitive data.

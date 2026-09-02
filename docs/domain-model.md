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
- OWNER can manage ADMIN, MEMBER, and VIEWER memberships, but cannot create,
  remove, demote, or transfer OWNER through the current member-management slice.
- ADMIN can manage workspace work and MEMBER or VIEWER memberships except
  owner-only and admin-only actions.
- MEMBER can perform ordinary work actions allowed by product rules.
- VIEWER can read permitted resources but cannot mutate them.
- The final OWNER cannot be demoted or removed unless a safe ownership transfer rule exists.
- Users cannot remove themselves or demote their own membership through member
  management.

## Task Lifecycle

Task statuses are fixed for the MVP task foundation:

```text
BACKLOG -> IN_PROGRESS -> DONE
BACKLOG -> CANCELED
IN_PROGRESS -> CANCELED
DONE -> IN_PROGRESS
```

- `OWNER`, `ADMIN`, and `MEMBER` may create, edit, assign, transition, and
  reopen tasks.
- `VIEWER` is read-only.
- `CANCELED` is terminal.
- Task archival, hard deletion, and configurable project workflows are outside
  the current contract.
- A task assignee must be an active member of the task's workspace.
- Removing a member and clearing that member's task assignments must be atomic
  with respect to concurrent assignment.

## Membership Lifecycle

Initial proposed membership states:

```text
INVITED -> ACTIVE
INVITED -> EXPIRED
ACTIVE -> REMOVED
ACTIVE -> ROLE_CHANGED
```

Open questions:

- Are invitations email-only, link-based, or both? The current backend member
  management slice adds only existing users directly.
- Can removed members be restored or only re-invited?
- Can a workspace have multiple OWNER members? The current backend member
  management slice does not create or transfer OWNER memberships.

## Comment and Mention Rules

- `OWNER`, `ADMIN`, `MEMBER`, and `VIEWER` may read comments; `VIEWER` remains
  read-only while the other three roles may create them.
- Comment bodies are bounded canonical plain text. Mention occurrences are
  UTF-16 ranges tied to stable user identities and validated against current
  workspace membership when the comment is created.
- A comment can mention only current members of its workspace. Self, external,
  removed-member, and stale-label mentions are rejected.
- Historical body text, attribution, and mention ranges remain stable after a
  display-name change or membership removal; that history grants no current
  resource access.
- Comment creation derives a versioned `comment.created` event and persists
  mention notifications in the same transaction.
- Comment visibility follows task, project, and workspace authorization.

Open questions:

- Are comments editable?
- Are comments deletable?
- If editing is added later, do edits trigger notifications?

## Notification Rules

- Notifications are private and scoped to one recipient.
- `COMMENT_MENTION` is currently the only notification type. One row is created
  per distinct mentioned member and source comment; repeated occurrences for
  one member do not create duplicate notifications.
- Source comments, mention occurrences, and notifications commit or roll back
  together. The source comment is the stable logical event identity.
- A recipient can list or mutate a notification only while they retain access
  to its workspace and source resource.
- Notification records reference source entities and do not duplicate comment
  bodies or rendered copy.
- Removing a member deletes their notifications for that workspace atomically;
  deleting the source comment, workspace, or recipient cascades to its
  notifications.
- Read state is monotonic and idempotent. Realtime delivery remains an
  optimization over persistent notification state.

Open questions:

- Which additional events create notifications in MVP?
- What time-based retention policy, if any, is required before production?

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

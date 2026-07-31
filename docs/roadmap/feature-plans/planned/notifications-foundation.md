# Feature Plan: Notifications Foundation

Status: Planned

Intended PR: `feat/notifications-foundation`

Milestone: 3 - Comments, Mentions, and Notifications

Impact: Material private user-event feature

## Goal

Persist and display private, workspace-scoped in-app notifications for an
approved collaboration event with deterministic delivery, deduplication, and
read-state behavior.

## Acceptance Criteria

- The first supported event is selected from a delivered server-side source,
  preferably a task-comment mention.
- One logical event produces at most one notification per intended recipient,
  including transaction retry and duplicate-delivery cases.
- Notification creation is atomic with the source write when both use the same
  database, or an approved outbox contract closes the consistency gap.
- Only the intended user can list or mutate a notification, and payloads cannot
  expose inaccessible workspace resources.
- Listing uses deterministic bounded cursor pagination.
- Mark-one and mark-all-read commands are idempotent and safe under concurrent
  requests and newly arriving notifications.
- The app shell provides an accessible notification entry, unread indication,
  list, loading, empty, error, retry, and pagination behavior.
- Client cache/update behavior does not lose new notifications or resurrect read
  state after races.
- Retention and deletion behavior is explicit.
- Contract, real-database, security, component, and live-browser evidence pass.

## Scope

- notification persistence model, indexes, and migration
- one supported event-to-notification mapping from comments/mentions
- deterministic event identity and recipient deduplication
- list, mark-one-read, and mark-all-read APIs
- app-shell unread indicator and notification list/panel
- explicit cache invalidation/update semantics
- retention/deletion policy for MVP
- API, security, domain, and roadmap documentation

## Out of Scope

- realtime/WebSocket delivery
- email, mobile push, digests, preferences, or per-event settings
- notification actions beyond navigating to an already available host
- generic event bus or outbox when a same-database transaction satisfies the
  approved guarantee

## Affected Surfaces

- notification persistence, indexes, and migration
- source-event mapping and transaction boundary
- authenticated notification APIs
- frontend app shell, unread state, and notification list/panel
- API, security, domain, workflow, and roadmap documentation
- unit, contract, real-Postgres, concurrency, security, component, and browser
  tests

## Security and Data Boundary

Notification recipient and workspace scope are server-derived from the source
event. Only the intended authenticated user can list or mutate a notification.
Stored or rendered payloads must not preserve inaccessible workspace data after
membership/resource changes, and identifiers must not become an IDOR channel.

## API, Data, and Concurrency Contract

- Store recipient, workspace/resource identifiers needed for authorization,
  event type/version, stable source-event identity, created/read timestamps, and
  a presentation-safe payload or server-resolvable reference.
- Enforce a unique deduplication key for logical event plus recipient.
- Order pages by `(createdAt, id)` with a matching recipient-scoped index and an
  opaque cursor.
- Make mark-read commands successful when the target is already read.
- Define mark-all-read with a server timestamp/cutoff so notifications created
  concurrently are not accidentally marked read unless the contract says so.
- Never trust event payload display text or recipient IDs supplied by clients.
- Delete or retain notifications consistently with source-resource deletion and
  workspace membership removal; inaccessible source content must not remain
  exposed through old payloads.

## Engineering Improvement Review

### UX/UI and Accessibility

- Use an app-shell badge and panel/list that remain usable by keyboard and
  screen reader, including focus return and Escape behavior.
- Show loading, empty, partial pagination, error, and retry distinctly.
- Avoid optimistic unread-count changes unless rollback and concurrent-arrival
  behavior are deterministic.
- Keep mobile layout and long notification text usable.

### Frontend

- Keep one cache owner for list pages and unread count.
- Update read state from accepted server responses and invalidate predictably
  after mark-all.
- Do not add realtime polling or a global state library in this slice.

### Backend, Database, and Security

- Prefer a same-Postgres transaction for source and notification rows. Introduce
  an outbox only if asynchronous delivery becomes a current guarantee.
- Validate event type/version strictly and generate recipients server-side.
- Protect list and mutation endpoints from cross-user and cross-workspace IDOR.
- Log event IDs and outcome, not private notification bodies.

### Code Quality and Testing

- Separate event validation, event-to-recipient mapping, persistence, and API
  presentation.
- Use explicit discriminated event payload types; avoid `any`/`unknown` across
  internal notification contracts.
- Test retries, duplicates, source rollback, and concurrent read/new-event races.

## Ordered Implementation Plan

1. Approve the source event, recipient rules, navigation target, retention, and
   same-transaction versus outbox decision.
2. Design the versioned notification schema, unique dedupe constraint, stable
   cursor index, and rollback-safe migration.
3. Implement typed source-event mapping and atomic/deduplicated persistence.
4. Implement recipient-scoped list and idempotent read-state commands.
5. Build the app-shell entry and accessible list/panel with explicit async
   states and deterministic cache updates.
6. Add unit, contract, real-Postgres integration, concurrency, security,
   component, accessibility, and live-browser evidence.
7. Update affected API, security, domain, workflow, and roadmap documentation.
8. Run the post-implementation review gate before final validation.

## Validation Contract

| Guarantee | Required evidence |
|---|---|
| Exactly one recipient notification per event | unique-constraint and retry/duplicate real-DB tests |
| Source/notification consistency | transaction rollback or outbox integration tests |
| Recipient and workspace privacy | cross-user, cross-workspace, removed-member security tests |
| Stable bounded list | cursor/order/concurrent-insert integration tests |
| Idempotent race-safe read state | concurrent mark-one/mark-all/new-event integration tests |
| Accessible notification UI | component tests and real-browser keyboard/mobile flow |
| Existing collaboration flow preserved | comment/task live E2E and regression gates |

## Post-Implementation Review Gate

Review for client-selected recipients, payload leakage, missing dedupe, race-prone
unread counts, unbounded queries, stale cache resurrection, invalid navigation,
or an unnecessary generic event framework. Resolve in-scope findings and rerun
affected validation.

## Rollback and Forward Fix

- Keep notification creation behind the delivered source mapping so UI/API can
  be disabled without corrupting the source event.
- Preserve created rows during a code rollback when schema is backward-
  compatible; avoid destructive rollback.
- Re-plan if consistency requires a worker/outbox and operational dependency not
  approved in this plan.

## Dependencies

- [Comments and Mentions Foundation](comments-mentions-foundation.md) or another
  approved, delivered event source
- app-shell and workspace authorization foundations

## Re-plan Conditions

- realtime or email becomes part of acceptance
- navigation requires a new task route
- event delivery crosses databases/services and requires an outbox/worker
- notification preferences become required for the first event

## Follow-up

- realtime in-app delivery
- background email/digest jobs
- user notification preferences

# Feature Plan: Comments and Mentions Foundation

Status: Planned

Intended PR: `feat/comments-mentions-foundation`

Milestone: 3 - Comments, Mentions, and Notifications

Impact: Material workspace-scoped collaboration feature

## Goal

Allow authorized workspace members to read and add plain-text task comments and
mention eligible workspace members without leaking task, membership, comment,
or search data across workspace boundaries.

## Existing Foundation

- The Prisma `Comment` model already stores `id`, `taskId`, `authorId`, `body`,
  and `createdAt` with task and author indexes.
- Task/project/workspace authorization and trusted workspace actor resolution
  are implemented and tested.
- The current task workflow is hosted under Home rather than a dedicated task
  route.
- Mentions, comment APIs, comment UI, and notification persistence are not yet
  implemented.

## Acceptance Criteria

- The role matrix explicitly states who may list and create comments. The MVP
  decision on whether `VIEWER` may comment is approved before implementation.
- Comment reads and writes resolve the task through project/workspace scope and
  the trusted workspace authorization boundary.
- Comments have a deterministic bounded order and pagination contract that
  remains stable when new comments arrive.
- Comment bodies are strictly validated as bounded plain text; empty,
  whitespace-only, oversized, and invalid payloads fail explicitly.
- Mention syntax, normalization, maximum count, duplicate/self mention, removed
  member, and nonmember behavior are documented and tested.
- Mention suggestions auto-search on an eligible `@query` with debounce, stale
  request cancellation, IME safety, bounded results, keyboard navigation, and
  correct ARIA.
- The comment thread has loading, empty, submitting, error, and retry states.
- Submitted comments are not shown as durable until the server accepts them,
  unless an approved idempotent optimistic contract with rollback is added.
- Existing comments remain attributable after membership removal, and mention
  history behavior is explicit.
- A notification-ready domain result/event contains only stable server-derived
  identifiers; notification storage/delivery remains outside this PR.
- API, database, security, component, and live-browser evidence cover the real
  boundary, not only mocks.

## Required Decisions Before Implementation

### Comment role matrix

Approve one explicit matrix using `WorkspaceAuthorizationService`:

| Action | OWNER | ADMIN | MEMBER | VIEWER |
|---|---:|---:|---:|---:|
| List task comments | Allow | Allow | Allow | Allow |
| Create task comment | Allow | Allow | Allow | Decision required |

The recommended MVP is to keep `VIEWER` read-only for consistency with the
current task workflow. Allowing viewers to comment is a product-policy change
and requires the security model, tests, and UI affordances to change together.

### Task-detail host

Use the existing task Sheet if the preceding frontend-boundary plan confirms it
can host an accessible comment thread. If a dedicated task route is required,
stop and create a separate prerequisite plan rather than adding routing to this
PR.

### Mention persistence contract

Choose an explicit representation that preserves notification and historical
display semantics. If structured mention records or extra indexes are required,
include the smallest migration. Do not infer durable mentions repeatedly from
mutable free text.

## Scope

- comment list/create API contracts with deterministic cursor pagination
- reuse of the existing Comment model, adding schema only for approved mention
  persistence or query indexes
- strict plain-text comment validation and output encoding
- server-side mention parsing and eligible-member validation
- bounded member mention-search endpoint or an approved reuse of an existing
  workspace-member search contract
- accessible task comment thread, composer, and mention suggestions
- notification-ready server result/event contract without notification writes
- role, tenant-isolation, integration, contract, component, and live E2E tests
- affected API, security, domain, and roadmap documentation

## Out of Scope

- rich text, Markdown rendering, reactions, editing, deletion, or attachments
- realtime transport
- notification persistence, badges, read/unread state, email, or preferences
- a new task route
- cross-workspace or free-form email mentions
- optimistic submission without idempotency and rollback guarantees

## Affected Surfaces

- comment and task backend modules and HTTP contracts
- Prisma comment/mention schema and indexes when approved
- workspace authorization and role-policy composition
- task-detail frontend, comment composer, and mention-search UI
- API, security, domain, workflow, and roadmap documentation
- unit, contract, real-Postgres, security, component, and browser tests

## Security and Data Boundary

Every comment and mention operation must derive workspace scope through the
task and project using the trusted workspace actor. Client-provided task,
member, author, or mention identifiers are untrusted. Unauthorized or
cross-workspace resources follow the existing tenant-hiding error contract, and
plain-text content is validated and safely output-encoded.

## API and Data Contract

- Scope every operation through task -> project -> workspace and a current
  workspace actor; use tenant-hiding failures where the existing contract does.
- Use a bounded cursor ordered by `(createdAt, id)` and add a matching composite
  index such as `(taskId, createdAt, id)` if query evidence requires it.
- Return an explicit page type with items and continuation metadata. Do not
  return unbounded comment arrays.
- Validate body type, trimmed non-empty content, maximum length, and permitted
  control characters before persistence.
- Treat comment text as plain text and output-encode it. Do not render supplied
  HTML.
- Define mention grammar and maximum distinct mentions per comment. Reject
  invalid structured mention input rather than silently coercing it.
- Resolve mention targets from server-side workspace membership. The client
  suggestion list is not authority.
- Decide whether a self mention is ignored or recorded without notification;
  duplicate occurrences must not create duplicate recipients.
- Historical comments remain after a member is removed. Display attribution and
  historical mention text without granting current access or notification.

## Engineering Improvement Review

### UX/UI

- Trigger Auto Search only for the active eligible `@query`; debounce around
  300 ms and abort stale requests.
- Preserve IME composition. Support Arrow keys, Enter, Escape, Tab, focus return,
  and screen-reader announcements.
- Distinguish no comments from no mention matches and from request failure.
- Disable duplicate submits while pending. Prefer pessimistic submit for MVP.
- Keep the composer and thread usable at mobile widths and with long words.

### Frontend

- Keep comment server state within the task feature's existing ownership.
- Reuse request cancellation and pagination semantics, not the assignee picker's
  domain-specific component.
- Invalidate or append the accepted server result predictably after create.
- Do not add a global state/cache dependency for this slice.

### Backend, Database, and Security

- Authorization, task existence, membership, body validation, mention
  resolution, and persistence must have a clear transaction boundary.
- Avoid a partial state where a comment persists but its durable mention
  representation does not.
- Rate-limit comment creation and mention search using existing web-boundary
  conventions when abuse analysis shows the generic limits are insufficient.
- Log rejected/failed operations without comment bodies, secrets, or cross-
  tenant identifiers.
- Before a second resource requires membership-removal cleanup, revisit whether
  explicit per-resource policies remain sufficient; do not add a generic
  lifecycle orchestrator in this slice.

### Code Quality and API Design

- Keep comment validation separate from mention parsing and persistence mapping.
- Parser names and return types must express whether they return parsed mentions
  or fail; avoid `unknown` and mixed-type results.
- Reuse the trusted workspace actor and response/error contracts.

## Ordered Implementation Plan

1. Approve the comment role matrix, task-detail host, mention grammar, mention
   persistence, body limit, and pagination contract.
2. Add or adjust schema/indexes only where the approved contract requires it;
   validate migration forward and rollback behavior.
3. Implement strict body and mention validators/parsers as separate typed units.
4. Implement list/create and bounded mention-search services through the trusted
   workspace actor and task/project/workspace scope.
5. Expose documented API contracts and notification-ready result identifiers.
6. Build the comment thread, composer, and accessible auto-search suggestions
   in the approved task-detail host.
7. Add unit, contract, real-Postgres integration, security, component,
   accessibility, mocked E2E, and live E2E evidence.
8. Reconcile API, security, domain, workflow, and roadmap documentation.
9. Run the post-implementation review gate before final validation.

## Validation Contract

| Guarantee | Required evidence |
|---|---|
| Role and tenant policy | real-Postgres role-matrix and cross-workspace security tests |
| Stable bounded listing | integration tests for ordering, cursors, concurrent insert, and empty page |
| Strict body/mention contract | unit and HTTP contract tests for valid and invalid boundaries |
| Atomic durable state | integration tests for mention failure and transaction rollback |
| Search race/accessibility behavior | component tests plus real-browser debounce, abort, IME, keyboard, and ARIA flow |
| Safe rendering | component/browser evidence with HTML-like and long text inputs |
| Existing task flow preserved | critical task live E2E and frontend/backend regression gates |

## Post-Implementation Review Gate

Review for IDOR/BOLA, role drift, unbounded reads/search, unstable ordering,
client-authoritative mention targets, HTML injection, duplicate recipients,
partial transactions, leaked comment content in logs, broken focus/ARIA, stale
request races, and undocumented schema behavior. Fix in-scope findings and rerun
affected validation.

## Rollback and Forward Fix

- Keep schema changes backward-compatible with the existing Comment rows.
- If mention persistence cannot be safely delivered in the same transaction,
  stop and split the persistence contract before exposing the UI.
- API/UI can be rolled back while retaining compatible comment data; destructive
  data rollback is not part of this plan.

## Dependencies

- [Frontend UI Runtime Compatibility](../completed/frontend-ui-runtime-compatibility.md)
- [Task UI Boundaries](task-ui-boundaries.md)
- completed task foundation and workspace authorization boundary
- approved comment role matrix

## Re-plan Conditions

- `VIEWER` write policy changes the broader role model
- a dedicated task route is required
- rich text, edit/delete, attachments, or realtime enter current scope
- mention delivery requires notifications to be implemented atomically in the
  same PR

## Follow-up

- [Notifications Foundation](notifications-foundation.md)
- realtime collaboration as a separate authorized slice

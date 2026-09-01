# Feature Plan: Comments and Mentions Foundation

Status: Done - implemented and validated 2026-09-01

Intended PR: `feat/comments-mentions-foundation`

Milestone: 3 - Comments, Mentions, and Notifications

Impact: Material workspace-scoped collaboration feature

## Completion Evidence

- additive Prisma migration validated and applied to the local development and
  isolated test databases; generated client and migration status are current
- backend 43-suite/240-test validation, including unit, HTTP contract,
  security, and real-PostgreSQL integration tests, covers
  canonical bodies, UTF-16 ranges, role/tenant policy, cursor boundaries,
  candidate bounds, historical attribution, transaction races, retry
  exhaustion, and the matching comment index
- frontend 27-file/193-test validation plus five Node tests covers model, API,
  component, safe-rendering, pessimistic
  submission, stale-search cancellation, composition events, older-page
  reconciliation, error recovery, and read-only viewer behavior
- mocked Chromium E2E passes 24/24 journeys; guarded live Chromium E2E passes
  3/3 journeys including member creation, real candidate search, mention
  posting, and API readback through Nest/PostgreSQL; interactive desktop/mobile
  browser checks cover task-detail opening, keyboard mention selection,
  plain-text display, responsive layout, ARIA/focus behavior, and absence of
  console errors
- repository typecheck, lint, test, and production builds pass on Node.js 22
- notifications, realtime, editing/deletion, rich text, attachments, and a
  shared production collaboration rate limiter remain explicitly out of scope

## Goal

Allow authorized workspace members to read and add plain-text task comments and
mention eligible workspace members without leaking task, membership, comment,
or search data across workspace boundaries.

## Foundation at Planning Time

- The Prisma `Comment` model already stores `id`, `taskId`, `authorId`, `body`,
  and `createdAt` with task and author indexes.
- Task/project/workspace authorization and trusted workspace actor resolution
  are implemented and tested.
- The current task workflow is hosted under Home rather than a dedicated task
  route.
- The current `TaskFormSheet` is a create/edit surface available only to roles
  that may mutate tasks; it is not the task-detail host.
- Mentions, comment APIs, comment UI, and notification persistence had not yet
  been implemented when this plan was approved.

## Acceptance Criteria

- `OWNER`, `ADMIN`, `MEMBER`, and `VIEWER` may list task comments. `OWNER`,
  `ADMIN`, and `MEMBER` may create comments; `VIEWER` remains read-only in
  accordance with the current domain role invariant.
- Comment reads and writes resolve the task through project/workspace scope and
  the trusted workspace authorization boundary.
- Comments load the latest bounded page and use an opaque older-comments cursor
  over `(createdAt, id)` that remains stable when new comments arrive.
- Comment bodies are strictly validated as bounded plain text; empty,
  whitespace-only, oversized, and invalid payloads fail explicitly.
- Mention occurrences use server-validated UTF-16 body ranges tied to stable
  workspace-member user IDs. Maximum count, duplicate/self mention,
  removed-member, nonmember, and renamed-user behavior are documented and
  tested.
- Mention suggestions auto-search on an eligible `@query` with debounce, stale
  request cancellation, IME safety, bounded results, keyboard navigation, and
  correct ARIA.
- The comment thread has loading, empty, submitting, error, and retry states.
- Submitted comments are not shown as durable until the server accepts them.
- Existing comments remain attributable after membership removal, and mention
  history behavior is explicit.
- A notification-ready domain result/event contains only stable server-derived
  identifiers; notification storage/delivery remains outside this PR.
- API, database, security, component, and live-browser evidence cover the real
  boundary, not only mocks.

## Approved Implementation Decisions

### Comment role matrix

Use this matrix through `WorkspaceAuthorizationService`:

| Action | OWNER | ADMIN | MEMBER | VIEWER |
|---|---:|---:|---:|---:|
| List task comments | Allow | Allow | Allow | Allow |
| Create task comment | Allow | Allow | Allow | Deny |

This preserves the existing domain invariant that `VIEWER` is read-only.
Allowing viewers to comment is a product-policy change and requires a separate
re-plan of the security model, tests, and UI affordances.

### Task-detail host

Use a viewer-accessible `TaskDetailSheet` composed from the existing Sheet
primitive. Keep it separate from `TaskFormSheet`: the detail Sheet owns task
display and the comment thread for every role allowed to read comments, while
task-editing affordances remain conditional on the existing task mutation
contract. This comments PR introduces the detail Sheet and its explicit opening
affordance; the preceding frontend-boundary refactor only establishes the named
`TaskSection` and `TaskCard` extension seam.

A dedicated task route is not required by this decision. If implementation
shows that the Sheet cannot provide accessible focus, navigation, responsive,
or long-thread behavior, stop and create a separate prerequisite route plan
rather than adding routing to this PR.

### Mention persistence contract

Keep the comment body as canonical plain text. The create request carries
mention occurrences as `{ userId, start, end }`, where `start` and `end` are
UTF-16 offsets into the canonical submitted body. The visible slice must equal
`@` followed by the selected candidate's server-derived `mentionLabel`. The
server validates every occurrence against current workspace membership and
never treats the client-selected user ID, display name, or label as authority.

Derive `mentionLabel` from the current display name by replacing each run of
Unicode whitespace with one ASCII space, removing remaining C0/C1 control
characters, and trimming. A member whose derived label is empty is not an
eligible candidate. This keeps unusual existing display names from violating
the comment body contract without changing the authentication/display-name
contract in this slice. Return `mentionLabel` from candidate search so the
frontend inserts exactly the server-owned value.

Persist one `CommentMention` row per occurrence with `commentId`,
`mentionedUserId`, `start`, and `end`. Use a uniqueness constraint on
`(commentId, start, end)`, an index on `commentId`, and an index on
`(mentionedUserId, commentId)`. Multiple occurrences may target one user, but
the notification-ready recipient set is deduplicated by user ID. Historical
body text and ranges remain stable when a display name changes or membership is
removed.

Limit a comment to 10 distinct mentioned users and 20 mention occurrences.
Exclude the current user from suggestions and reject self-mentions. Reject
overlapping or out-of-range occurrences, duplicate ranges, mismatched display
text, removed members, and nonmembers with one generic safe validation error.

An eligible mention begins at the start of the body or after whitespace or
opening punctuation. The autocomplete query is the text from the last eligible
`@` before the caret through the caret, may contain spaces for display-name
search, and ends on a newline, another `@`, closing punctuation, or IME
composition start. An email-like `name@example.com` does not trigger search.
After selection, the frontend inserts the exact returned `@mentionLabel` and
tracks its occurrence range; edits that intersect a tracked range remove that
occurrence from the structured mention list unless the user selects it again.

### Comment body contract

- The frontend converts CRLF to LF, trims outer whitespace, and derives mention
  offsets from that final value before submission.
- The backend accepts only this canonical form and does not transform it after
  offsets are supplied.
- Length is 1 through 4,000 UTF-16 code units.
- LF is allowed. NUL, CR, tabs, and other C0/C1 control characters are rejected.
- The body is stored and rendered only as plain text. HTML-like input remains
  literal text and never enters an HTML rendering sink.

### Pagination contract

- `limit` defaults to 30 and is bounded to 1 through 100.
- The first request selects the latest page by `(createdAt, id) DESC`, fetching
  `limit + 1`, then returns the selected items in chronological order for the
  thread.
- `nextCursor` is either `null` or a versioned opaque Base64URL cursor for
  comments older than the oldest returned item. A malformed or unsupported
  cursor fails with `400`.
- Cursor version 1 encodes exactly `{ v: 1, createdAt: ISO-8601 UTC string,
  id: string }`. It is an opaque pagination token rather than an authorization
  credential; decoding never bypasses task/workspace authorization.
- Subsequent requests apply the strict tuple boundary represented by the cursor
  and preserve the same ordering rules. Concurrent newer inserts do not shift
  older pages.
- Add the matching `(taskId, createdAt, id)` composite index. Do not return a
  total count.

### Abuse-control decision

This slice does not refactor the authentication-specific Redis rate limiter into
a generic limiter. Comment creation remains authenticated and bounded by body
and mention limits; mention search requires a non-empty bounded query and
returns at most 10 rows. Record representative query evidence. A shared
collaboration rate limiter is required before production exposure if measured
query cost, abuse testing, or deployment readiness shows these bounds are
insufficient. Do not add a process-local limiter that fails across replicas.

## Scope

- nested comment list/create API contracts with the approved cursor pagination
- additive `CommentMention` persistence and approved comment query indexes
- strict plain-text comment validation and output encoding
- server-side mention parsing and eligible-member validation
- bounded workspace mention-candidate endpoint that reuses membership-query
  logic without reusing the task-assignee route as its public contract
- accessible task comment thread, composer, and mention suggestions
- typed internal notification-ready result without an event bus, publication,
  or notification writes
- role, tenant-isolation, integration, contract, component, and live E2E tests
- affected API, security, domain, and roadmap documentation

## Out of Scope

- rich text, Markdown rendering, reactions, editing, deletion, or attachments
- realtime transport
- notification persistence, badges, read/unread state, email, or preferences
- a new task route
- cross-workspace or free-form email mentions
- optimistic submission

## Affected Surfaces

- comment and task backend modules and HTTP contracts
- Prisma comment/mention schema and approved indexes
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

- Expose `GET` and `POST`
  `/api/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/comments`.
- Expose `GET /api/workspaces/:workspaceId/mention-candidates` with required
  trimmed `search` length 1 through 100 and `limit` default/max 10. Order by
  `(displayName, userId)`, exclude the caller, and return only `id` and
  `displayName` plus the server-derived `mentionLabel`. Duplicate display names
  remain distinct by ID and the UI uses the existing short-ID disambiguation
  convention in the suggestion list.
- Scope comment operations through task -> project -> workspace and a current
  workspace actor. Scope candidate search through the current workspace actor.
  Use existing tenant-hiding failures for mismatched or invisible resource IDs.
- `GET comments` returns `{ items, nextCursor }` using the approved pagination
  contract. It never returns an unbounded array or total count.
- `POST comments` accepts canonical `body` plus structured mention occurrences,
  returns `201`, and returns only the accepted public comment contract.
- A public comment contains `id`, `taskId`, `body`, `author: { id,
  displayName }`, `mentions: Array<{ start, end }>`, and `createdAt`. Public
  mention occurrences omit recipient IDs because the initial UI needs only
  stable ranges to render the literal historical body; stable recipient IDs
  remain in server-side mention rows and the internal result.
- Validate the body and all ranges before persistence. Render the body through
  normal React text interpolation; do not use `dangerouslySetInnerHTML`.
- Resolve all mention targets from server-side current workspace membership in
  the same transaction as comment creation. The suggestion response is not
  authority.
- Create the comment and all mention rows atomically through the existing
  serializable-transaction pattern. A membership-removal race must either
  commit a valid linearized comment or fail safely without partial rows.
- The service produces a typed internal `comment.created` version 1 result with
  `workspaceId`, `projectId`, `taskId`, `commentId`, `authorId`, and deduplicated
  `mentionedUserIds`. It contains no body or display names and is not published
  in this slice.
- Historical comments and attribution remain after membership removal.
  Historical mention text/ranges do not grant current profile, resource, or
  notification access.
- `CommentMention.mentionedUserId` references the stable `User`, not the
  removable `WorkspaceMember`, so membership removal preserves history. Account
  deletion and its referential policy remain outside the MVP account lifecycle.

## Engineering Improvement Review

### UX/UI

- Trigger Auto Search only for the active eligible `@query`; debounce around
  300 ms and abort stale requests.
- Preserve IME composition. Support Arrow keys, Enter, Escape, Tab, focus return,
  and screen-reader announcements.
- Distinguish no comments from no mention matches and from request failure.
- Disable duplicate submits while pending. Prefer pessimistic submit for MVP.
- Keep the composer and thread usable at mobile widths and with long words.
- Add an explicit `View details` button to every readable `TaskCard`; do not
  make the whole card clickable. Return focus to this trigger when the Sheet
  closes.
- Show the composer only to `OWNER`, `ADMIN`, and `MEMBER`. `VIEWER` sees the
  task detail and thread without a disabled or misleading write affordance.
- Provide an explicit `Load older comments` action while `nextCursor` exists.
  New comments from other users require reopen or explicit refresh until
  realtime is implemented.

### Frontend

- Keep comment server state within the task feature's existing ownership.
- Reuse request cancellation and pagination semantics, not the assignee picker's
  domain-specific component.
- Append the accepted server result only when its comment ID is not already in
  the thread; do not present an unaccepted optimistic row as durable.
- Do not add a global state/cache dependency for this slice.

### Backend, Database, and Security

- Authorization, task existence, membership, body validation, mention
  resolution, and persistence must have a clear transaction boundary.
- Avoid a partial state where a comment persists but its durable mention
  representation does not.
- Enforce the approved body, mention, cursor, query, and result bounds. Record
  query evidence and the explicit pre-production rate-limiter revisit trigger;
  do not reuse the authentication policy names or add an in-memory limiter.
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

1. Add the backward-compatible `CommentMention` migration and
   `(taskId, createdAt, id)` comment index; validate schema, generated client,
   forward migration, and the non-destructive code-rollback path.
2. Implement typed canonical-body, cursor, and mention-occurrence validators.
   Keep validation, membership resolution, persistence mapping, and public DTO
   mapping separate.
3. Implement the nested comment list/create service through the trusted
   workspace actor and existing serializable-transaction pattern. Return the
   typed internal notification-ready result without publishing it.
4. Implement the bounded mention-candidate endpoint by reusing membership-query
   logic while keeping its API and DTO ownership separate from task assignees.
5. Expose Swagger-documented request, response, validation, authorization, and
   cursor contracts; add unit, HTTP contract, real-Postgres integration,
   concurrency, query-shape, and tenant-isolation evidence.
6. Add comment API/runtime schemas and a viewer-accessible `TaskDetailSheet`
   opened by an explicit `TaskCard` action. Keep task mutation affordances on
   their existing role contract.
7. Build the chronological thread, load-older flow, pessimistic composer, and
   accessible mention auto-search with debounce, abort, IME, keyboard, ARIA,
   focus-return, mobile, and long-text behavior.
8. Add component, accessibility, mocked E2E, guarded live E2E, safe-rendering,
   and existing-task regression evidence.
9. Run the post-implementation review gate, fix in-scope findings, and rerun
   affected checks before the final authoritative validation pass.
10. Reconcile API, security, domain, workflow, validation, milestone, and roadmap
    documentation only after required evidence passes.

## Validation Contract

| Guarantee | Required evidence |
|---|---|
| Role and tenant policy | real-Postgres role-matrix and cross-workspace security tests |
| Stable bounded listing | integration tests for latest-page chronology, load-older cursors, malformed cursors, concurrent newer inserts, boundary ties, and empty pages |
| Strict body/mention contract | unit and HTTP contract tests for canonical body, controls, bounds, UTF-16 ranges, overlaps, duplicates, self/nonmember/removed targets, duplicate or unusual display names, derived labels, and renamed users |
| Atomic durable state | real-Postgres tests for mention failure, membership-removal races, serialization exhaustion, and transaction rollback without partial rows |
| Bounded candidate search | contract/security tests for query/result limits, minimal and derived fields, caller/empty-label exclusion, duplicate-name disambiguation, deterministic order, and cross-workspace isolation plus representative query evidence |
| Search race/accessibility behavior | component tests plus real-browser debounce, abort, keyboard, ARIA, focus, and composition-event flow without claiming operating-system IME coverage |
| Safe rendering | component/browser evidence with HTML-like and long text inputs |
| Existing task flow preserved | critical task live E2E and frontend/backend regression gates |

## Post-Implementation Review Gate

Review for IDOR/BOLA, role drift, unbounded reads/search, unstable ordering,
client-authoritative mention targets, HTML injection, duplicate recipients,
partial transactions, leaked comment content in logs, broken focus/ARIA, stale
request races, missing abuse bounds, and undocumented schema behavior. Fix
in-scope findings and rerun affected validation.

## Rollback and Forward Fix

- Keep schema changes backward-compatible with the existing Comment rows.
- If mention persistence cannot be safely delivered in the same transaction,
  stop and split the persistence contract before exposing the UI.
- API/UI can be rolled back while retaining compatible comment and mention data.
  The additive table and index remain unused during code rollback; destructive
  schema or data rollback is not part of this plan.
- If a deployed cursor contract is wrong, forward-fix with an additional cursor
  version while retaining the reader for already issued cursors until their
  practical lifetime ends.

## Dependencies

- [Frontend UI Runtime Compatibility](../completed/frontend-ui-runtime-compatibility.md)
- [Task UI Boundaries](../completed/task-ui-boundaries.md)
- completed task foundation and workspace authorization boundary
- existing PostgreSQL and Node.js 22 validation environment

## Re-plan Conditions

- `VIEWER` write policy changes the broader role model
- a dedicated task route is required
- mention identity requires usernames, rich content, or a different structured
  editor contract
- representative query or abuse evidence requires a shared distributed rate
  limiter before exposure
- rich text, edit/delete, attachments, or realtime enter current scope
- mention delivery requires notifications to be implemented atomically in the
  same PR

## Follow-up

- [Notifications Foundation](notifications-foundation.md)
- realtime collaboration as a separate authorized slice

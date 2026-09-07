# Feature Plan: Task Attachment UI Integration

Status: Implemented and locally validated on `feat/task-attachment-ui-integration`

Intended PR: `feat/task-attachment-ui-integration`

Milestone: 4 - File Uploads and Background Jobs

Impact: Material authenticated upload/download browser journey

Dependency: [File Upload Backend and Storage Foundation](file-upload-foundation.md),
satisfied by merged PR #50 at `19c2b09`

Plan review: 2026-09-07

Implementation completed: 2026-09-07

## Goal

Complete the user-visible task-attachment journey on top of the merged backend
contract: select, validate, upload with real progress, cancel, recover, retry
safely, list, download, and delete according to current authorization.

## Reviewed Baseline

- The backend attachment schema, private S3-compatible adapter, authorization,
  rate/quota controls, reconciliation, HTTP routes, stable error codes, and
  Swagger contract are merged on `main`.
- Task details already provide a viewer-accessible sheet. The attachment section
  can be composed there as a sibling of comments without moving comment state
  into the attachment feature.
- The frontend has Zod public-contract patterns, safe API error mapping,
  component tests, mocked Playwright, and guarded live Playwright journeys.
- The current fetch API client owns bearer injection and one refresh retry but
  assumes JSON for arbitrary request bodies and cannot report upload progress.
- The selected workspace already carries `membershipRole`, and the authenticated
  page already has the current user ID. The ID is not currently threaded through
  `WorkspaceHome -> ProjectSection -> TaskSection -> TaskDetailSheet`; that prop
  path is implementation work required for creator-aware delete visibility.
- No frontend attachment schema, API module, transport, component, or browser
  journey exists yet.
- The existing live Playwright lane is auth/PostgreSQL-only. Redis, MinIO,
  attachment storage environment values, and isolated-E2E dependency startup
  must be added by this PR before the live attachment journey can be authoritative.
- The roadmap index and Milestone 4 summary still describe the backend foundation
  as awaiting merge or unimplemented. That documentation drift is non-blocking
  for this branch and remains explicit closeout work in step 10.

## Preconditions and Readiness

- **Satisfied:** PR #50 is merged into the current `main` baseline and the
  working branch starts at the same commit as `origin/main`.
- **Satisfied:** focused backend contract and security tests pass, and focused
  real PostgreSQL/Redis/MinIO attachment integration passes locally.
- **Satisfied:** the current frontend baseline passes typecheck, lint, 209
  Vitest tests, script tests, and production build.
- **Satisfied:** the accepted launch policy remains PNG/JPEG only, 10 MiB
  maximum, forced download, no preview, and no malware scanning.
- **Implementation-owned gap:** extend the live Playwright and isolated Docker
  E2E topology with healthy Redis and MinIO services and explicit test storage
  configuration. This is part of the PR, not an external dependency blocker.

The reviewed plan was approved for implementation after the dependency block
was removed and the remaining work was defined.

If implementation needs to alter the backend transport, public metadata,
idempotency, authorization, lifecycle, file policy, or security boundary, stop
and re-plan rather than hiding the contract change in this UI PR.

## Acceptance Criteria

- Task details contain an independently testable attachment section rather than
  adding attachment orchestration directly to the existing comment logic.
- All current workspace members can list and download available attachments.
- `OWNER`, `ADMIN`, and `MEMBER` can select and upload; `VIEWER` receives a clear
  read-only state.
- The uploader or an `OWNER`/`ADMIN` can delete; other `MEMBER` users do not see
  or invoke delete as an authorized action. A null creator grants no uploader
  privilege.
- Client selection rejects an empty/zero-byte file, an unsafe or overlong
  filename, unsupported extension/type combinations, and files above 10 MiB
  before network transfer, while the backend remains authoritative for filename,
  signature, size, authorization, rate, and quota enforcement.
- Upload displays real byte progress, announced status, cancel, success,
  failure, and safe retry using the same idempotency key.
- Upload authorization recovers through the existing session-refresh boundary
  without duplicating refresh coordination or creating duplicate attachments;
  cancel while waiting for refresh must not start a replacement XHR.
- List loading, empty, error, retry, pagination, unavailable, and deletion
  states always exit loading and remain keyboard/screen-reader usable.
- `DELETE_FAILED` is rendered as unavailable for download and retryable for
  deletion only by users for whom the backend returns that record.
- Download uses the authenticated backend content route and a bounded browser
  Blob/object-URL lifecycle; response length and resulting Blob size must match
  the selected public metadata and stay within 10 MiB, and object URLs are
  revoked after use.
- Permanent deletion requires confirmation and returns focus predictably.
- Long filenames wrap safely and the section remains usable on mobile layouts.
- Component, API-client, mocked browser, and real-browser PostgreSQL/Redis/MinIO
  evidence pass without leaking access tokens, file bytes, object keys, or
  private URLs into logs, traces, screenshots, or errors.

## Security and Data Boundary

The browser may validate for fast feedback but never authorizes or establishes
content safety. Access tokens stay in the existing in-memory/session-refresh
boundary; they must not enter URLs, object metadata, filenames, telemetry, or
browser artifacts. Attachment metadata and bytes are untrusted display/download
data, object keys remain backend-only, and every operation relies on the merged
backend enforcement.

The browser path is:

```text
user selection
-> local policy feedback
-> authenticated XHR with stable idempotency key
-> backend-authoritative upload result
-> authenticated list/download/delete
-> bounded Blob/object-URL cleanup
```

## Required Decisions Before Implementation

The browser decisions below are resolved for this plan. A required backend,
auth-lifecycle, storage, or file-policy change triggers re-planning.

### Upload transport

- Use `XMLHttpRequest` for real upload progress and abort support.
- Send `FormData` and let the browser generate the multipart boundary; never set
  multipart `Content-Type` manually.
- Send the current in-memory bearer access token and a client-generated opaque
  `Idempotency-Key`, plus the selected file size as `X-Upload-Length`.
- On one `401`, use the shared refresh coordinator, then retry once with the
  same file and idempotency key. Do not create a second refresh mechanism.
- Extract one transport-neutral authenticated-attempt seam: each attempt reads
  the current in-memory token, fetch and XHR both delegate the single `401`
  recovery decision to it, and the second attempt reads the refreshed token.
  Preserve credentialed fetch behavior and all current auth-store/session
  coordination semantics.
- A retryable application/storage error retains the selected file and
  idempotency key. Selecting a different file creates a new key.
- Cancel aborts the active XHR but never aborts the shared refresh operation.
  If cancellation occurs during refresh, mark that upload attempt canceled and
  suppress the retry XHR.
- An abort can race with server completion. Treat the result as locally canceled
  but potentially committed; retry with the same file/key or refresh the first
  list page to reconcile, never generate a second key for that attempt.
- Parse XHR success and error JSON through the same safe public-contract and API
  error boundaries as fetch; malformed or non-JSON responses become generic
  failures without exposing response bodies.

The existing fetch client assumes JSON for an arbitrary body and cannot expose
upload progress. Refactor only the minimum shared authenticated-recovery seam
needed by fetch and XHR, preserving existing API-client/session tests and
single-refresh behavior.

### List and download

- Load the first attachment page when task details open and abort stale requests
  when the task, project, workspace, or sheet changes. Guard state updates by
  request identity as well as `AbortSignal` so late responses cannot update the
  newly selected task.
- Use an attachment-specific cursor collection helper. Replace on first-page
  load, append older pages in backend order, deduplicate by attachment ID, and
  never reuse a cursor after a first-page refresh.
- After upload success, replace the first page so ordering and the next cursor
  come from the backend while preserving the success announcement. After delete
  success remove the item; after a stale-role `403`, inaccessible `404`, or
  ambiguous cancel, refresh the first page.
- Download through the authenticated content endpoint, derive the local download
  filename from validated public metadata, reject a missing/mismatched/oversized
  `Content-Length` or Blob, create one object URL, trigger the download, and
  revoke it on success or cleanup.
- Do not render images inline, inspect private object URLs, or trust a response
  filename over public metadata.

### Delete

- Show delete only when the frontend role/creator projection indicates the
  action may be allowed; backend authorization remains authoritative.
- Confirm the exact display filename before permanent deletion.
- Disable duplicate delete submission, show progress and failure, and remove the
  item only after backend success.
- Treat `DELETE_FAILED` as a contained server state: disable download, label the
  item unavailable, and allow the same authorized delete action to retry cleanup.
- A stale-role `403` or inaccessible `404` reconciles the item/list rather than
  repeatedly presenting an invalid action.

### Live test fixture and MinIO proof

- Use a small deterministic synthetic PNG or JPEG fixture containing no personal
  or production data. Give each run a unique display filename and idempotency key
  while keeping the expected bytes fixed.
- The primary live journey must select the fixture through the browser file input
  and upload it through the authenticated backend API. Do not pre-seed the object
  directly into MinIO because that would bypass progress, validation, metadata,
  authorization, idempotency, and lifecycle behavior.
- Prove the MinIO round trip by downloading through the authorized content route
  and comparing the returned bytes with the fixture, then delete through the UI
  and verify the attachment is no longer listed or downloadable. Do not expose or
  use the private object key in browser assertions.
- API-created setup data may support role/isolation cases, but it must still use
  the public attachment API rather than writing directly to PostgreSQL or MinIO.

## UI Composition

Add a focused attachment feature boundary:

- attachment public-contract schemas and error mapping
- attachment API transport, including the progress-capable upload path
- attachment section/list item/upload control components
- component state for list pagination, upload attempts, cancel/retry, download,
  and delete confirmation
- a narrow composition point in task details
- explicit `actorId` and `membershipRole` props threaded from the authenticated
  page/workspace composition into the attachment section; do not introduce a
  second auth store or re-fetch identity inside the feature

Keep the existing `TaskDetailSheet` location for this PR and render the focused
attachment section as a sibling of the existing comments section. Do not move
comment ownership into the attachment feature or turn task details into a
generic asset manager. Comments and attachments load independently; one failure
must not hide or block the other section.

## Accessibility and UX Contract

- The file input has a visible label, keyboard activation, accepted-type hint,
  and maximum-size hint.
- Progress uses a determinate progressbar when total bytes are known and a
  concise live status message.
- Success, failure, cancel, rate/quota rejection, and retry are announced
  without moving focus unexpectedly.
- Disabled controls explain why upload/delete is unavailable when needed.
- Delete confirmation names the file and restores focus to the next logical
  attachment control or upload control.
- Loading, empty, error, read-only, and paginated states remain distinct.
- Long filenames use safe wrapping and do not overflow the sheet on narrow
  viewports.

## Scope

- frontend attachment schemas, error mapping, and API functions
- progress-capable authenticated upload transport and minimal shared refresh
  seam
- authenticated-user ID prop plumbing required for creator-aware delete actions
- task-detail attachment section and role-aware actions
- selection validation, upload progress/cancel/retry, list/pagination,
  download, and confirmed delete
- deterministic non-sensitive PNG/JPEG browser fixture and exact-byte round-trip
  assertion through the backend-authorized MinIO path
- live-E2E and isolated Docker test topology updates for Redis, MinIO, and private
  test-bucket configuration
- component, API-client, mocked Playwright, and live
  PostgreSQL/Redis/MinIO Playwright evidence
- frontend documentation plus final roadmap/feature-plan closeout after both PRs

## Out of Scope

- backend schema, storage, authorization, lifecycle, policy, or API changes
- drag-and-drop if the accessible file input already meets the outcome
- previews, thumbnails, inline rendering, image processing, or download history
- multiple-file or directory upload
- resumable upload across page reload
- optimistic deletion or Undo
- comment attachments, public links, replacement, or versioning
- malware scanning or quarantine UI

## Affected Surfaces

- shared authenticated API retry/recovery seam and existing API-client tests
- new frontend attachment contract, error, API, and component boundaries
- authenticated-page-to-task-detail actor ID plumbing, workspace role projection,
  focus management, and responsive UI
- mocked and live Playwright routes, fixtures, artifacts, and runtime setup
- `.github/workflows/ci.yml`, `app/frontend/scripts/run-live-e2e.mjs`, and the
  isolated Docker E2E service dependency plan
- frontend/testing/roadmap/milestone/feature-plan documentation

## Ordered Implementation Plan

1. Add public attachment schemas, safe error mapping, selection-policy helpers,
   attachment-specific cursor reconciliation, and contract fixtures matching
   the merged Swagger behavior, including nullable creator and `DELETE_FAILED`.
2. Extract the minimum reusable authenticated retry/recovery seam from the
   existing fetch client. Preserve current fetch behavior, make each retry read
   the current token, define cancel-during-refresh behavior, and add focused
   regressions before adding XHR.
3. Implement the XHR upload transport with FormData, bearer auth, one refresh
   retry, stable idempotency key, byte progress, abort, safe errors, and no
   manual multipart header.
4. Implement list, bounded download, and delete API functions, including binary
   response validation, `DELETE_FAILED`, stale-role denial, and abort handling.
5. Build the focused attachment section with independent load state, stable
   cursor pagination, first-page mutation reconciliation, selection validation,
   upload progress/cancel/retry, bounded download handling, and confirmed delete.
6. Thread the current authenticated user ID and workspace role through the
   existing composition tree and render the attachment section in task details,
   keeping comment and attachment state/failure isolated.
7. Extend the live-E2E and isolated Docker E2E topology before writing the live
   journey: provision healthy Redis and MinIO, pass explicit test-only storage
   configuration, preserve the private auto-created test bucket contract, and
   add topology/self-test assertions so the lane fails closed when either
   dependency is unavailable.
8. Add component, pure-helper, API-client, upload-transport, and existing auth
   regressions for role/state/refresh/cancel/pagination/download/delete behavior.
9. Extend mocked browser coverage for desktop/mobile interaction and live
   browser coverage for real upload/list/download/delete through
   PostgreSQL/Redis/MinIO. Upload the deterministic fixture through the browser,
   compare authenticated download bytes, delete it through the UI, and include
   viewer behavior and cross-workspace denial without inspecting private keys.
10. Reconcile frontend, testing, roadmap, milestone, and feature-plan docs, run
   the post-implementation review gate, fix findings, and rerun authoritative
   validation.

## Validation Contract

| Guarantee | Required evidence |
|---|---|
| Public contract and errors | Zod cases for nullable creator, dates, status allowlist, malformed payloads, and stable mapping for attachment/rate/service/auth errors |
| Client policy feedback | Pure/component cases for PNG/JPEG, extension/type mismatch, zero-byte/oversize files, unsafe/overlong filenames, and long safe filenames |
| Progress and cancellation | XHR transport tests plus browser-visible progress, abort, cancel during refresh, ambiguous completion reconciliation, canceled state, and same-key retry |
| Session recovery and idempotency | Concurrent fetch/XHR `401` uses one shared refresh, retries once with the refreshed token and same key/file, does not retry a canceled attempt, and creates no duplicate attachment |
| Role behavior | OWNER/ADMIN/MEMBER upload, VIEWER read-only, uploader/OWNER/ADMIN delete visibility, null-creator handling, and backend denial reconciliation |
| List and pagination | Initial/empty/error/retry, replace/append cursor behavior, merge without duplicates, stale-response suppression, task-switch abort, and load-more behavior |
| Delete lifecycle | Confirmed delete, duplicate-submit prevention, success removal, stale `403`/`404` reconciliation, and `DELETE_FAILED` unavailable/retry behavior |
| Download safety | Authenticated content request, content-length/metadata/Blob bounds, filename source, single object-URL creation/revoke, and failure feedback |
| Accessible journey | Keyboard, label, live announcement, focus return, confirmation, responsive layout, and no blocking console errors |
| Runtime topology | CI and isolated Docker E2E prove healthy PostgreSQL, Redis, and MinIO plus explicit private test storage configuration before browser execution |
| Real user journey | A deterministic non-sensitive fixture is uploaded through the browser into the real PostgreSQL/Redis/MinIO path, listed, downloaded with an exact byte match, deleted through the UI, and covered by viewer read-only/list/download plus cross-workspace API denial; direct MinIO seeding and private-key assertions are forbidden |

Required checks include frontend typecheck, lint/canonical Tailwind validation,
Vitest/component tests, production build, mocked Playwright, live Playwright with
real backend/PostgreSQL/Redis/MinIO, existing frontend API-client/auth-store/
session-coordinator regressions, affected live-runner and Docker-orchestration
self-tests, container topology, focused backend attachment contract/security/
integration dependency checks, and the production dependency audit. The focused
backend suites verify the unchanged dependency; they do not authorize backend
changes in this PR.

## Post-Implementation Review Gate

Review the current diff and affected consumers for client-only authorization,
manual multipart headers, duplicate upload after refresh/retry, stale task
updates, cancel-during-refresh retry, cancel/server-completion races, stale cursor
reuse, unbounded or mismatched Blob/object URLs, object-key/private-URL exposure,
indefinite loading, missing abort cleanup, inaccessible progress/status,
`DELETE_FAILED` download leakage, delete race, comment regression, mobile
overflow, token/error leakage in browser artifacts, a live lane missing
Redis/MinIO, and mocked-only end-to-end evidence. Resolve in-scope findings and
rerun affected checks before final validation.

## Rollback and Forward Fix

- This PR has no schema or object migration.
- Reverting the UI removes attachment controls while leaving the merged backend,
  metadata, and private objects intact.
- If upload UI is faulty, hide/disable new upload interaction and preserve
  list/download access when safe; do not delete attachment data.
- If live attachment evidence is unstable, keep the feature unmerged while
  fixing the test/runtime topology; do not weaken the required lane or substitute
  mocked evidence.
- Browser-created object URLs are session-local and must always be revoked.
- Backend containment and reconciliation remain owned by the merged backend
  foundation in PR #50.

## Alternatives Rejected for This Slice

- **Fetch upload with synthetic progress:** does not provide truthful portable
  upload progress for this contract.
- **Direct-to-storage browser upload:** contradicts the approved backend proxy
  boundary and would require a backend/API/security re-plan.
- **Inline image preview:** expands content-execution and privacy behavior and
  is outside the accepted no-preview malware disposition.
- **Optimistic delete/Undo:** unsafe without a reversible storage lifecycle.

## Re-plan Conditions

- the merged backend contract or launch file policy must change
- direct, resumable, multi-file, directory, or background upload becomes
  required
- preview, inline rendering, scanning/quarantine, replacement, or comment
  attachment enters scope
- files exceed the bounded browser Blob/download contract
- session refresh cannot safely be shared with XHR without changing the auth
  lifecycle
- live PostgreSQL/Redis/MinIO browser evidence cannot be made deterministic within
  the existing test topology

## Completion Evidence

- Added a dedicated attachment contract, collection reconciliation, safe error
  mapping, authenticated XHR upload transport, bounded download handling, and
  task-detail attachment section without coupling attachment state to comments.
- Preserved the existing shared auth transition while making both fetch and XHR
  attempts read the current bearer token; refresh retry keeps the same file and
  idempotency key, and cancellation during refresh suppresses the retry.
- Threaded the authenticated actor ID and selected workspace role through the
  existing composition path for creator-aware actions.
- Extended isolated Docker and GitHub live-E2E topology to require PostgreSQL,
  Redis, MinIO, and explicit test-only storage settings. The live runner now
  fails closed when any Redis/S3 setting is absent.
- Added deterministic mocked desktop/mobile journeys and a live browser journey
  that uploads a generated-in-memory PNG through the application, compares the
  downloaded bytes, verifies viewer list/download behavior and outsider denial,
  and deletes through the UI without direct MinIO seeding or private-key access.
- Post-implementation review fixed cross-realm `AbortError` recognition, an
  invalid MinIO GitHub service startup assumption, host-runner `HOME` handling,
  cleanup-action accessible naming, sub-pixel/mobile animation assertions, and
  a workspace-root min-content width that only overflowed under true mobile
  device emulation.

Authoritative local evidence on 2026-09-07:

- `corepack pnpm validate:frontend`: passed 5 auth-policy tests, 245 frontend
  Vitest tests, 7 frontend script tests, typecheck, lint/canonical Tailwind, and
  the production Next.js build.
- `corepack pnpm --filter @worksync/frontend test:e2e`: passed 27/27 mocked
  Chromium journeys, including attachment desktop and mobile coverage.
- `corepack pnpm --filter @worksync/frontend test:e2e:compatibility`: passed
  9/9 production-build compatibility journeys across Chromium, Firefox, and
  WebKit.
- `corepack pnpm --filter @worksync/frontend test:e2e:live`: passed 4/4 live
  Chromium journeys against real backend/PostgreSQL/Redis/MinIO, including the
  attachment byte, authorization, and deletion journey.
- Browser + Full CDP retest uploaded a 58,967-byte PNG through the real UI into
  MinIO and verified browser-generated multipart boundaries, bearer plus
  idempotency and exact-length headers, a public-only `201` response, bounded
  download headers, complete object-URL revocation, cancel-delete focus return
  with no `DELETE` request, no runtime/console errors, and a 390-pixel mobile
  viewport with no horizontal overflow.
- Docker Compose config validation and Docker orchestration self-test passed.
- Focused backend attachment validation passed 7/7 suites and 50/50 tests across
  unit, contract, security, and real-storage integration projects.
- Pinned OSV-Scanner 2.5.1 production audit passed with 464/464 production
  package-versions covered and no moderate-or-higher or unknown-severity
  production findings.
- A pre-merge security diff scan reviewed all 24 generated changed-source items
  plus the directly supporting backend authorization, upload-policy, and storage
  controls; it reported no findings and no deferred security work.
- The backend attachment contract, security, and real-storage integration
  baseline remained unchanged; the live browser journey re-exercised its public
  upload/list/download/delete and isolation boundary.

## Engineering Improvement Review

- **Current scope:** truthful progress, shared auth recovery, stable idempotency,
  cancellation, independent task-detail state, bounded Blob cleanup, accessible
  async states, and live MinIO browser evidence are directly coupled to the
  accepted journey.
- **Future enhancements:** drag-and-drop, multi-file/resumable upload, previews,
  scanning state, comment attachments, and direct storage transport require
  their stated triggers.
- **Simpler alternative considered:** a plain file input with truthful XHR
  progress and the existing task-details sheet is sufficient; drag-and-drop,
  a task-detail shell relocation, a new auth context, and direct storage access
  add complexity without improving the accepted outcome.
- **Scope effect:** the product boundary remains the second frontend PR, but the
  plan now explicitly includes actor-ID prop plumbing and Redis/MinIO live-test
  topology required by the existing acceptance criteria. Any backend contract
  or security-boundary change requires re-planning with PR 1 ownership.

## Plan Review Verdict

- **Impact and reasoning:** Material Change (Tier 2), full review because the
  work adds an authenticated upload/download journey, shared auth retry behavior,
  untrusted browser file handling, and external storage evidence.
- **Blocking findings resolved in this revision:** obsolete dependency status,
  missing actor-ID composition path, missing `DELETE_FAILED` behavior, ambiguous
  cancel/refresh races, underspecified cursor/mutation reconciliation, and a live
  E2E lane without Redis/MinIO.
- **Remaining blockers:** none identified for implementation on baseline
  `28e7645`, provided the implementation stays within this plan and the live
  topology work is completed before claiming browser evidence.
- **Non-blocking concern:** adjacent roadmap status text is stale relative to
  `main`; preserve it as named closeout work because this review is authorized to
  change only this plan.
- **Confidence:** high for implementation readiness; production AWS provider
  smoke and production reconciliation scheduling remain release gates owned by
  the backend/deployment plans, not blockers for this PR.

## Completion Verdict

- **Outcome:** the accepted frontend attachment journey and required local/live
  evidence are complete on the implementation branch.
- **Backend boundary:** unchanged; no schema, persistence, storage-policy, API,
  or authorization contract change was made.
- **Remaining release boundary:** remote CI and code review remain required
  before merge. AWS provider smoke and scheduled production reconciliation stay
  with the production deployment work.
- **Local environment verification:** the existing notifications and
  file-upload migrations were applied to the developer `worksync` database.
  Prisma reports all 9 migrations up to date; the original user, workspace,
  task, and comment counts were preserved, and Browser + Full CDP smoke checks
  against `.env` returned `200` for both notification and attachment reads with
  no runtime or console errors.

## Follow-up

- drag-and-drop only if the accessible input proves insufficient
- multiple-file and resumable upload after demonstrated user/transport need
- previews or inline rendering only with a reviewed content-safety boundary
- scanning/quarantine UI when the backend lifecycle adds those states
- comment attachments, public links, replacement, and versioning

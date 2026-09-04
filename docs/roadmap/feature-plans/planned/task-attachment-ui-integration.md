# Feature Plan: Task Attachment UI Integration

Status: Planned - blocked on File Upload Backend and Storage Foundation

Intended PR: `feat/task-attachment-ui-integration`

Milestone: 4 - File Uploads and Background Jobs

Impact: Material authenticated upload/download browser journey

Dependency: [File Upload Backend and Storage Foundation](../completed/file-upload-foundation.md)

## Goal

Complete the user-visible task-attachment journey on top of the merged backend
contract: select, validate, upload with real progress, cancel, recover, retry
safely, list, download, and delete according to current authorization.

## Existing Foundation

- Task details already provide a separate viewer-accessible discussion host and
  role-aware task composition point.
- The frontend has Zod public-contract patterns, safe API error mapping,
  component tests, mocked Playwright, and guarded live Playwright journeys.
- The current fetch API client owns bearer injection and one refresh retry but
  assumes JSON for arbitrary request bodies and cannot report upload progress.
- PR 1 establishes the storage/API/test topology that this plan consumes.

## Dependencies

- The backend attachment API, schema, private storage adapter, launch file
  policy, error codes, and Swagger contract from PR 1 are merged and unchanged.
- Real PostgreSQL plus MinIO backend security/integration evidence passes.
- Local, CI, isolated Docker test, and live-E2E environments provide the same
  private MinIO bucket contract.
- The accepted launch policy remains PNG/JPEG only, 10 MiB maximum, no preview,
  and no malware scanning.

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
  or invoke delete as an authorized action.
- Client selection rejects unsupported extension/type and files above 10 MiB
  before network transfer, while the backend remains authoritative.
- Upload displays real byte progress, announced status, cancel, success,
  failure, and safe retry using the same idempotency key.
- Upload authorization recovers through the existing session-refresh boundary
  without duplicating refresh coordination or creating duplicate attachments.
- List loading, empty, error, retry, pagination, unavailable, and deletion
  states always exit loading and remain keyboard/screen-reader usable.
- Download uses the authenticated backend content route and a bounded browser
  Blob/object-URL lifecycle; object URLs are revoked after use.
- Permanent deletion requires confirmation and returns focus predictably.
- Long filenames wrap safely and the section remains usable on mobile layouts.
- Component, API-client, mocked browser, and real-browser PostgreSQL/MinIO
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
- A retryable application/storage error retains the selected file and
  idempotency key. Selecting a different file creates a new key.
- Cancel aborts the XHR and leaves the UI in an explicit canceled state from
  which the user may retry safely.

The existing fetch client assumes JSON for an arbitrary body and cannot expose
upload progress. Refactor only the minimum shared authenticated-recovery seam
needed by fetch and XHR, preserving existing API-client/session tests and
single-refresh behavior.

### List and download

- Load the first attachment page when task details open and abort stale requests
  when the task or sheet changes.
- Use the backend cursor contract and merge pages without duplicates.
- Download through the authenticated content endpoint, derive the local download
  filename from validated public metadata, create an object URL for the bounded
  response, trigger the download, and revoke the URL.
- Do not render images inline, inspect private object URLs, or trust a response
  filename over public metadata.

### Delete

- Show delete only when the frontend role/creator projection indicates the
  action may be allowed; backend authorization remains authoritative.
- Confirm the exact display filename before permanent deletion.
- Disable duplicate delete submission, show progress and failure, and remove the
  item only after backend success.
- A stale-role `403` or inaccessible `404` reconciles the item/list rather than
  repeatedly presenting an invalid action.

## UI Composition

Add a focused attachment feature boundary:

- attachment public-contract schemas and error mapping
- attachment API transport, including the progress-capable upload path
- attachment section/list item/upload control components
- component state for list pagination, upload attempts, cancel/retry, download,
  and delete confirmation
- a narrow composition point in task details

Do not move comment ownership into the attachment feature or turn task details
into a generic asset manager. Comments and attachments may load independently;
one failure must not hide or block the other section.

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
- task-detail attachment section and role-aware actions
- selection validation, upload progress/cancel/retry, list/pagination,
  download, and confirmed delete
- component, API-client, mocked Playwright, and live PostgreSQL/MinIO Playwright
  evidence
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
- task-detail composition, role projection, focus management, and responsive UI
- mocked and live Playwright routes, fixtures, artifacts, and runtime setup
- frontend/testing/roadmap/milestone/feature-plan documentation

## Ordered Implementation Plan

1. Add public attachment schemas, API error mapping, list/download/delete
   functions, and contract fixtures matching merged Swagger behavior.
2. Extract the minimum reusable authenticated retry/recovery seam from the
   existing fetch client, preserve current fetch behavior, and add focused
   regressions before adding XHR.
3. Implement the XHR upload transport with FormData, bearer auth, one refresh
   retry, stable idempotency key, byte progress, abort, safe errors, and no
   manual multipart header.
4. Build a focused attachment section with independent load state, stable cursor
   pagination, selection validation, upload progress/cancel/retry, bounded
   download handling, and confirmed delete.
5. Compose the section into task details with current role and actor identity,
   keeping comment state and attachment state independent.
6. Add component and API-client tests for all role, state, refresh, retry,
   cancel, pagination, object-URL cleanup, and delete-confirmation behavior.
7. Extend mocked browser coverage for desktop/mobile interaction and live
   browser coverage for real upload/list/download/delete through PostgreSQL and
   MinIO, including a viewer and cross-workspace denial.
8. Reconcile frontend, testing, roadmap, milestone, and feature-plan docs, run
   the post-implementation review gate, fix findings, and rerun authoritative
   validation.

## Validation Contract

| Guarantee | Required evidence |
|---|---|
| Client policy feedback | Unit/component cases for PNG/JPEG, oversize, mismatch, empty selection, and long filenames |
| Progress and cancellation | XHR transport tests plus browser-visible progress, abort, canceled state, and safe retry |
| Session recovery and idempotency | One-refresh retry with the same key/file, no duplicate refresh loop, and no duplicate attachment |
| Role behavior | OWNER/ADMIN/MEMBER upload, VIEWER read-only, uploader/OWNER/ADMIN delete visibility, and backend denial reconciliation |
| List and pagination | Initial/empty/error/retry, cursor merge without duplicates, task-switch abort, and load-more behavior |
| Download safety | Authenticated content request, bounded Blob handling, filename source, object-URL revoke, and failure feedback |
| Accessible journey | Keyboard, label, live announcement, focus return, confirmation, responsive layout, and no blocking console errors |
| Real user journey | Live PostgreSQL/MinIO upload, list, download-byte check, delete, viewer read, and cross-workspace denial |

Required checks include frontend typecheck, lint/canonical Tailwind validation,
Vitest/component tests, production build, mocked Playwright, live Playwright with
real backend/PostgreSQL/MinIO, impacted backend regressions when the shared auth
seam changes, container topology, and the production dependency audit.

## Post-Implementation Review Gate

Review the current diff and affected consumers for client-only authorization,
manual multipart headers, duplicate upload after refresh/retry, stale task
updates, unbounded Blob/object URLs, object-key/private-URL exposure, indefinite
loading, missing abort cleanup, inaccessible progress/status, delete race,
comment regression, mobile overflow, token/error leakage in browser artifacts,
and mocked-only end-to-end evidence. Resolve in-scope findings and rerun affected
checks before final validation.

## Rollback and Forward Fix

- This PR has no schema or object migration.
- Reverting the UI removes attachment controls while leaving the merged backend,
  metadata, and private objects intact.
- If upload UI is faulty, hide/disable new upload interaction and preserve
  list/download access when safe; do not delete attachment data.
- Browser-created object URLs are session-local and must always be revoked.
- Backend containment and reconciliation remain owned by PR 1.

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
- live PostgreSQL/MinIO browser evidence cannot be made deterministic within
  the existing test topology

## Engineering Improvement Review

- **Current scope:** truthful progress, shared auth recovery, stable idempotency,
  cancellation, independent task-detail state, bounded Blob cleanup, accessible
  async states, and live MinIO browser evidence are directly coupled to the
  accepted journey.
- **Future enhancements:** drag-and-drop, multi-file/resumable upload, previews,
  scanning state, comment attachments, and direct storage transport require
  their stated triggers.
- **Scope effect:** unchanged from the approved second PR boundary; any backend
  contract or security change requires re-planning with PR 1 ownership.

## Follow-up

- drag-and-drop only if the accessible input proves insufficient
- multiple-file and resumable upload after demonstrated user/transport need
- previews or inline rendering only with a reviewed content-safety boundary
- scanning/quarantine UI when the backend lifecycle adds those states
- comment attachments, public links, replacement, and versioning

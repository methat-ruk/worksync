# Feature Plan: File Upload Backend and Storage Foundation

Status: Done - implemented and validated 2026-09-03

Intended PR: `feat/file-upload-foundation`

Milestone: 4 - File Uploads and Background Jobs

Impact: Material untrusted-content, persistence, authorization, Redis, and
object-storage boundary

Follow-up PR: [Task Attachment UI Integration](../planned/task-attachment-ui-integration.md)

## Goal

Deliver the complete backend, persistence, storage, security, and validation
contract for task attachments. The result must be independently usable and
provable through the API, but it does not add the user-facing attachment UI.

## Implementation Evidence

- Fresh-database migration deploy applied all nine migrations, including the
  attachment foundation, against disposable PostgreSQL.
- Complete backend validation passed locally: 55 suites and 290 tests across unit,
  integration, contract, security, and API projects, followed by backend build
  and artifact validation.
- The existing local `worksync_test` migration drift was repaired without
  deleting data, migration status reports all nine migrations applied, and the
  complete backend validation now passes against local PostgreSQL, Redis, and
  MinIO.
- Real PostgreSQL/Redis/MinIO attachment integration passed upload, idempotent
  replay, list, authorized forced download, delete, role/isolation, content
  rejection, malformed input, object lifecycle, and quota evidence.
- Docker full/test configuration and orchestration self-tests passed with MinIO
  in the backend validation topology.
- The built backend runtime smoke and production dependency audit passed; the
  latter reports no known vulnerabilities at the required threshold.
- AWS staging smoke was explicitly deferred on 2026-09-03. Current provider
  evidence is local MinIO only; AWS upload/read/delete remains a production
  release gate and must not be represented as completed.
- Production reconciliation scheduling remains a release gate, not PR merge
  evidence.

## Existing Foundation

- The branch starts from the notifications-complete `main` baseline.
- Local PostgreSQL, Redis, and MinIO services exist and can run healthily.
- No attachment model, migration, backend module, storage adapter, upload API,
  or storage integration test exists.
- S3 values exist in local environment examples and the full-Docker overlay,
  but the typed backend environment contract does not yet validate or expose
  them.
- The backend has no direct AWS S3, streaming multipart, or content-signature
  dependency.
- Backend CI and the isolated Docker test topology provide PostgreSQL and Redis,
  but not MinIO or deterministic bucket provisioning.
- The existing trusted workspace actor boundary and task-scoping pattern are
  available for reuse.

## Required Decisions Before Implementation

The decisions in this section are resolved for this plan. Reopening one is a
re-plan trigger, not an implementation detail.

### Owner and authorization

- The first owner is a task. Comment attachments remain follow-up work.
- Current members of the task's workspace may list and download attachments,
  including `VIEWER`.
- `OWNER`, `ADMIN`, and `MEMBER` may upload.
- The original uploader or an `OWNER`/`ADMIN` may delete. A `MEMBER` cannot
  delete another user's attachment.
- Every operation re-establishes current workspace, project, and task access.
  Prior upload permission and object-key knowledge grant no later authority.
- Missing, cross-project, cross-task, cross-workspace, and inaccessible
  attachment identifiers use the existing non-revealing not-found contract.

### Transport and access

- Upload uses one bounded backend proxy transport with streaming to object
  storage. The backend must not buffer the complete file in memory or write it
  to a persistent local filesystem.
- Download uses an authorized backend streaming route with forced attachment
  headers. This slice does not issue signed upload or download URLs.
- The browser-to-storage CORS contract, initialize/complete commands, and
  signed-URL expiry/replay surface are therefore not part of this foundation.
- One request contains one file. Multipart limits apply before application
  processing and the storage stream is aborted when the request is canceled.

### Launch file policy

- Allowed types are PNG and JPEG only.
- Allowed mappings are `.png` with `image/png`, plus `.jpg` or `.jpeg` with
  `image/jpeg`.
- Maximum file size is 10 MiB (`10 * 1024 * 1024` bytes).
- Extension, declared MIME type, and detected magic signature must agree.
- Filenames are display metadata only. Normalize to Unicode NFC, reject path
  components, NUL/control/bidirectional-control characters, CR/LF, empty
  results, and names longer than 255 UTF-8 bytes.
- Storage keys are random server-generated values and never derive from a
  filename or client-selected path.
- Responses force `Content-Type: application/octet-stream`, a safely encoded
  `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, and
  `Cache-Control: private, no-store`.
- Archives, SVG, HTML, text, PDF, Office documents, executables, previews, and
  inline rendering are rejected or remain out of scope.

### Malware disposition

The foundation accepts a constrained MVP without malware scanning. The narrow
PNG/JPEG allowlist, signature agreement, private storage, no preview or
server-side media processing, forced download, bounded size, current
authorization, and auditable failure/reconciliation signals are mandatory
compensating controls.

Magic-signature validation is not malware proof. Broadening the allowlist,
rendering content inline, or adding preview/transformation is a re-plan trigger
that requires a scanning/quarantine decision and may move Background Jobs ahead
of availability.

### Provider and evidence boundary

- The application contract targets AWS S3 through the supported S3 API subset.
- MinIO is the local and CI compatibility boundary.
- Real PostgreSQL plus real MinIO evidence is a merge gate for this PR.
- An AWS staging smoke is a production-release gate, not a PR merge gate. No
  claim of production-provider validation is allowed until that smoke passes.
- Multiple providers at runtime are out of scope.

## Security and Data Boundary

Protected assets are workspace/task authorization, private attachment bytes,
server-owned object keys, storage credentials, quota capacity, and failure
metadata. Treat the browser, multipart metadata, filename, declared size/type,
file bytes, Redis, network, and provider responses as untrusted or fallible.

The trusted path is:

```text
browser request
-> authenticated workspace actor and task scope
-> role, rate, quota, filename, and declared-policy checks
-> PENDING metadata reservation
-> bounded signature/digest storage stream
-> conditional AVAILABLE transition
-> re-authorized list/download/delete
```

PostgreSQL metadata is the availability and authorization authority; object
existence alone grants no access. The bucket remains private, provider details
stay behind the adapter, and public errors/logs never expose keys, credentials,
URLs, raw provider payloads, filenames, or file bytes.

## Acceptance Criteria

- A typed storage configuration contract supports local MinIO, CI MinIO, and
  the AWS default credential chain without requiring static production keys.
- Local and test environments deterministically create a private test bucket;
  production startup never auto-creates or changes a bucket.
- A backward-compatible attachment migration defines lifecycle state,
  idempotency, ownership, content metadata, cleanup lookup, and required
  indexes.
- Authorized callers can upload, list, stream-download, and delete a task
  attachment through documented HTTP contracts.
- Upload streams are bounded, cancelable, idempotent, and validated against the
  launch file policy before the attachment becomes available.
- Every list, download, replay, and delete path rechecks current task access.
- Rate, pending-count, per-task count, and workspace-byte limits prevent
  unbounded storage and request amplification.
- Object-store and database partial failures leave a private, observable,
  reconcilable state rather than a publicly available orphan.
- An idempotent dry-run/apply reconciliation command handles stale pending,
  failed, and delete-failed records without deleting unverifiable objects.
- Swagger, API, security, domain, deployment, Docker, validation, and roadmap
  documentation reflect the implemented contract.
- Unit, contract, real-PostgreSQL/MinIO integration, security, migration,
  container-topology, and dependency evidence pass.

## API Contract

Base path:

```text
/api/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/attachments
```

### Upload

```text
POST /
Content-Type: multipart/form-data
Idempotency-Key: <client-generated opaque key>
X-Upload-Length: <declared file bytes>
file: <one binary part>
```

- First successful creation returns `201` with public attachment metadata.
- A completed replay with the same actor, task, key, and request fingerprint
  returns the same attachment with `200` and does not create another object.
- Reusing the key with a different filename, declared type, or declared size
  returns `409`.
- A replay while the original upload is still active returns `409` with a
  stable upload-in-progress error.
- Oversize input returns `413`; unsupported or mismatched content returns
  `422`; count/byte quota exhaustion returns `409`; rate exhaustion returns
  `429`; unavailable required protection or storage returns `503`.

The request fingerprint is the normalized display filename, declared MIME
type, and validated `X-Upload-Length`. The header is untrusted reservation
input; the authoritative stored size and SHA-256 digest are calculated by the
server while streaming, and any size mismatch fails closed.

### List

```text
GET /?cursor=<opaque>&limit=<1..50>
```

- Default limit is 20 and maximum limit is 50.
- Ordering is stable by `createdAt DESC, id DESC`.
- Public items contain `id`, normalized display filename, authoritative byte
  size, detected content type, public status, nullable creator identity, and
  timestamps. Public status is limited to `AVAILABLE` and `DELETE_FAILED`.
- `DELETE_FAILED` is returned only to a caller currently allowed to retry the
  delete; other callers see only `AVAILABLE` items.
- `PENDING` and `FAILED` are internal reconciliation states and are not listed.
- Public items never contain an object key, provider response, internal failure
  details, or an idempotency key.

### Download

```text
GET /:attachmentId/content
```

- Authorization and `AVAILABLE` state are checked before starting the stream.
- Storage failure before headers returns the standard safe JSON error.
- Failure after streaming begins closes the stream and emits safe correlated
  telemetry; it cannot switch to a JSON envelope after bytes were sent.

### Delete

```text
DELETE /:attachmentId
```

- The uploader or an `OWNER`/`ADMIN` may delete.
- Successful deletion removes the object before hard-deleting metadata and
  returns `204`.
- A storage failure preserves a `DELETE_FAILED` record, denies future download,
  emits a safe signal, and allows an authorized retry.

## Data and Lifecycle Contract

Use explicit states:

```text
PENDING -> AVAILABLE
PENDING -> FAILED
AVAILABLE -> DELETING -> metadata removed
DELETING -> DELETE_FAILED -> DELETING
```

The attachment record stores:

- stable attachment ID and task relation
- nullable creator relation so user removal does not delete file metadata
- normalized display filename
- random server-owned object key
- declared and detected content type
- declared and authoritative byte size
- SHA-256 digest
- status and bounded public-safe failure reason code
- idempotency key and request fingerprint
- created/updated timestamps and last-attempt timestamp

Required access paths include unique idempotency per task/creator, stable task
listing, and stale-state reconciliation. The task relation must restrict
database cascade while object-bearing metadata exists; a future task/project/
workspace delete flow must explicitly remove or reconcile objects before its
database cascade can proceed.

## Abuse and Capacity Controls

Conservative launch defaults:

- 20 object-bearing attachments per task
- 1 GiB of pending plus object-bearing attachment bytes per workspace
- 3 concurrent `PENDING` uploads per actor
- 20 concurrent `PENDING` uploads per workspace
- 10 upload attempts per actor per 10 minutes
- 100 upload attempts per workspace per 10 minutes

Enforce count and byte reservations transactionally before streaming. Release
reservations on verified failure or deletion. Redis-backed rate protection
fails closed for upload while list/download continue to use PostgreSQL and
storage. If the existing Redis fixed-window store is extracted for reuse,
preserve all authentication limiter behavior and regression evidence.

Revisit these defaults only with observed rejection, storage growth, request
latency, memory, bandwidth, or abuse evidence. Changing them is a policy change,
not an incidental configuration tweak.

## Failure and Reconciliation Contract

- Client disconnect or cancel: abort the object-store upload, record a safe
  failed state, and release reserved capacity after absence of an object is
  verified.
- Object-store failure: fail closed, never mark available, and expose a retryable
  user-safe error.
- Database availability transition failure after object success: retain
  `PENDING`; reconciliation re-streams the bounded private object through the
  size, signature, and digest validator before promoting or deleting it.
- Delete failure: retain `DELETE_FAILED`, deny download, and retry only through
  the authorized delete or reconciler path.
- Redis failure: reject new upload with `503`; do not weaken authorization,
  quotas, or rate protection.
- Stale `PENDING` threshold: one hour since the last attempt.
- A verified object-free `FAILED` record may be hard-deleted after 24 hours.
- `DELETE_FAILED` remains unavailable and is retried in bounded batches; after
  repeated provider failure it remains contained for operator action rather
  than being silently discarded.
- Reconciliation defaults to dry-run, requires an explicit apply flag, uses
  bounded batches, is idempotent, and records counts/reason codes without names,
  bytes, credentials, URLs, or object keys in normal logs.
- Production enablement requires a reviewed schedule/owner for reconciliation.
  The command itself belongs to this PR; production scheduling belongs to
  deployment readiness.

## Scope

- backend storage dependencies and typed environment validation
- local/test private-bucket provisioning and MinIO topology
- attachment schema, migration, indexes, and lifecycle
- task-attachment authorization policy
- streaming S3-compatible adapter
- upload/list/download/delete HTTP contracts and Swagger
- idempotency, content validation, quotas, rate limiting, and cancellation
- reconciliation command and failure telemetry
- backend/unit/contract/integration/security/migration/container evidence
- affected API, security, domain, deployment, Docker, testing, validation, and
  roadmap documentation

## Out of Scope

- frontend attachment API client, components, or browser journey
- comment attachments
- malware scanning or quarantine worker
- signed direct upload or signed download URLs
- previews, thumbnails, inline rendering, replacement, or versioning
- public links, rich media processing, multiple runtime providers
- production AWS credentials, bucket mutation, deployment, or reconciliation
  scheduling

## Affected Surfaces

- backend dependencies, configuration validation, startup, and error registry
- Prisma schema, generated client, migration, indexes, and deletion behavior
- task authorization, new attachment module, HTTP/Swagger contracts, and logs
- Redis rate-protection reuse and authentication limiter regressions
- MinIO local/test provisioning, Docker topology, CI services, and test harnesses
- API, security, domain, deployment, Docker, testing, validation, milestone, and
  roadmap documentation

## Dependencies

- completed workspace/project/task membership, authorization, and isolation
  foundations
- PostgreSQL, Redis, and private S3-compatible storage availability in the
  selected validation environment
- MinIO bucket provisioning for local/test and the AWS S3 API subset as the
  production target contract
- [Task Attachment UI Integration](../planned/task-attachment-ui-integration.md) depends on
  this PR; this PR does not depend on the UI slice

## Ordered Implementation Plan

1. Add the smallest supported S3, streaming multipart, and signature-detection
   dependencies; update the lockfile and validate their runtime/module fit.
2. Add fail-fast typed S3 configuration. Require paired static credentials when
   supplied, permit the AWS credential chain when absent, make custom endpoint
   and path-style behavior local/test-specific, and redact all secret values.
3. Add deterministic private MinIO bucket provisioning to local/test topology,
   add MinIO to backend CI and isolated Docker tests, and update topology
   self-tests before relying on storage evidence.
4. Add the attachment lifecycle schema, migration, relations, constraints, and
   indexes. Validate migration apply/status and cascade restriction against real
   PostgreSQL.
5. Implement the focused storage adapter with server-generated keys, bounded
   external waits, streaming upload/download, abort propagation, safe provider
   error translation, and test fault injection.
6. Implement attachment policy, role decisions, strict filename/type/signature
   validation, transactional reservations, rate limits, and idempotency.
7. Implement transport-focused controllers plus upload/list/download/delete
   services and register stable error codes and Swagger contracts.
8. Implement the bounded reconciliation command with dry-run/apply, stale-state
   verification, safe telemetry, and retry behavior.
9. Add unit, contract, real-PostgreSQL/MinIO integration, security, migration,
   topology, and dependency evidence, including partial-failure cases.
10. Reconcile affected documentation and run the post-implementation review
    gate before final authoritative validation.

## Validation Contract

| Guarantee | Required evidence |
|---|---|
| Workspace/task authorization | Real-PostgreSQL cross-role, cross-project, cross-task, and cross-workspace tests |
| Object-key privacy | Contract/security tests showing attacker keys are ignored and keys/providers never enter public payloads or normal logs |
| Streaming bounds | Real-MinIO upload/download plus cancel, oversize, slow/failing storage, and no-full-buffer inspection |
| Content policy | Boundary tests for size, filename, extension, declared MIME, PNG/JPEG signature, mismatch, and rejected active/archive formats |
| Idempotency and quotas | Duplicate, in-progress, mismatched replay, concurrent reservations, task count, workspace bytes, and Redis failure tests |
| Lifecycle integrity | Real database/storage tests for success, DB transition failure, client abort, delete failure, stale pending, and reconciler retry |
| Provider compatibility | Real MinIO in PR; recorded AWS staging smoke before production release |
| Runtime topology | Compose/CI service assertions, private bucket setup, backend artifact, and dependency audit |

Required repository checks include Prisma validation/generation, guarded test
migration apply/status, backend typecheck/lint/all Jest projects/build/artifact,
Docker topology and orchestration self-tests, relevant image builds, and the
production dependency audit.

## Post-Implementation Review Gate

Review the current diff and affected callers for IDOR/BOLA, task/workspace
scope, filename/header injection, object-key exposure, public bucket access,
type/signature trust, full-file buffering, slow-client/resource exhaustion,
quota races, idempotency replay, unsafe cascade, object/metadata partial
failure, reconciliation overreach, provider errors, secret/URL leakage, and
mock-only storage evidence. Resolve in-scope findings and rerun affected checks
before final validation.

## Rollback and Forward Fix

- The migration is additive. A code rollback leaves the table in place and
  must not apply a destructive down migration.
- During failure, stop new upload/delete admission while preserving private
  objects and metadata for verification.
- A rollback to pre-attachment code makes attachment routes unavailable but
  does not delete user objects.
- Reconciliation may delete only an object whose server-owned key, state, age,
  and absence of availability are verified. Unverifiable objects require
  containment and operator review.
- Never bulk-delete a bucket or remove user objects as part of schema rollback.

## Alternatives Rejected for This Slice

- **Signed direct upload:** reduces backend bandwidth but adds browser/storage
  CORS, initialize/complete commands, abandoned pending records, signed-policy
  scope, and post-upload verification. Revisit when the 10 MiB proxy path shows
  measured hosting or bandwidth pressure.
- **Scanning worker before availability:** stronger for broader file types, but
  unnecessary for the approved PNG/JPEG-only, forced-download foundation. It
  becomes required when the allowlist or rendering behavior expands.
- **Database byte storage or local persistent files:** conflicts with the
  selected S3 authority, portability, and bounded application-runtime design.

## Re-plan Conditions

- comment attachments enter current acceptance
- PDF, Office, archive, SVG, HTML, executable, preview, inline rendering, or
  transformation enters scope
- malware scanning becomes mandatory before availability
- the selected hosting target cannot support a bounded 10 MiB streaming proxy
- signed URLs, direct-to-storage upload, resumable upload, or files above the
  launch limit become required
- task/project/workspace deletion is introduced before explicit object cleanup
- quota, rate, provider, reconciliation scheduling, or AWS staging evidence
  changes the security or release boundary

## Engineering Improvement Review

- **Current scope:** transactional storage quota, bounded streaming and cancel,
  reusable fail-closed rate protection, real MinIO CI evidence, explicit
  reconciliation, safe download headers, and cascade restriction are coupled
  safeguards required for this boundary.
- **Future enhancements:** scanning/quarantine, broader file types, direct or
  resumable upload, previews, comment attachments, and provider-specific
  production hardening require their stated triggers.
- **Scope effect:** the original end-to-end plan is split into this backend PR
  and one dependent UI PR so each security and validation boundary can be
  reviewed independently.

## Follow-up

- [Task Attachment UI Integration](../planned/task-attachment-ui-integration.md)
- AWS staging upload/download/delete smoke before production release
- production reconciliation schedule and owner in deployment readiness
- scanning/quarantine before broader or inline-rendered file types
- direct/resumable transport only after measured proxy pressure
- comment attachments, previews, thumbnails, replacement, and versioning

# Feature Plan: File Upload Foundation

Status: Planned

Intended PR: `feat/file-upload-foundation`

Milestone: 4 - File Uploads and Background Jobs

Impact: Material untrusted-content and object-storage boundary

## Goal

Deliver one complete, authorized task-attachment journey from file selection to
later download while preserving workspace isolation, storage safety, content
policy, cleanup, and production portability.

## Existing Foundation

- Local MinIO is available as an S3-compatible development service.
- Production storage is intended to use an S3-compatible contract but is not
  integrated.
- No attachment metadata model, storage client, upload API, or upload UI exists.

## Acceptance Criteria

- The first attachment owner is explicitly selected. The recommended MVP is a
  task attachment; comment attachments remain later work.
- Authorized users can select, upload, observe progress/failure, retry safely,
  list attachments, and download an authorized attachment.
- Object keys are server-generated and cannot be chosen or traversed by clients.
- Declared type, allowed extension, actual content signature, and maximum size
  are validated according to one documented policy.
- Upload authorization does not imply permanent read authorization; every list,
  complete, download, and delete operation re-establishes current resource
  access.
- Signed URLs, if selected, are short-lived and scoped. A proxy path, if
  selected, preserves streaming limits and authorization.
- Incomplete uploads, abandoned objects, failed metadata commits, replacement,
  and deletion have explicit reconciliation behavior.
- Malware scanning/quarantine has an approved MVP disposition rather than an
  unqualified deferral.
- Real S3-compatible integration, API/security, and live-browser evidence pass.

## Required Decisions Before Implementation

### Resource owner

Use task attachments unless the product requirement explicitly prioritizes
comment attachments. Supporting both owners expands schema, authorization, UI,
and lifecycle scope and requires re-planning.

### Upload transport

Choose either:

- short-lived signed direct upload with server-created pending metadata and a
  verified completion command, or
- bounded backend proxy upload with streaming limits.

The decision must account for target hosting limits, CORS, observable progress,
content verification, and orphan cleanup. Do not support both in the foundation
slice.

### Malware risk disposition

Choose one:

1. Require scanning/quarantine before download. Move Background Jobs before this
   plan's availability/UI slice if asynchronous scanning is required. First
   split out the minimal attachment metadata and storage-lifecycle contract the
   worker needs.
2. Accept a constrained MVP without scanning only with an explicit allowed-type
   policy, forced attachment download where appropriate, safe content headers,
   short-lived access, size limits, auditability, and a recorded residual risk.

## Scope

- task attachment metadata, status lifecycle, indexes, and migration
- one S3-compatible storage client contract for MinIO and the selected
  production provider
- one approved upload transport
- strict size/type/signature and filename-display validation
- server-generated keys and current-authorization download access
- upload progress, success, failure, retry, list, and download UI
- incomplete/orphan reconciliation and authorized deletion policy
- approved scanning/quarantine path or constrained-MVP controls
- API, security, domain, deployment, and roadmap documentation

## Out of Scope

- comment attachments unless chosen instead of task attachments
- previews, thumbnails, versioning, public links, or collaborative editing
- multiple storage providers at runtime
- rich media transcoding
- a generic asset-management platform

## Affected Surfaces

- attachment persistence, indexes, migration, and resource lifecycle
- task authorization and attachment HTTP contracts
- S3-compatible storage adapter and environment configuration
- task-detail upload/list/download UI
- local Docker and production storage documentation
- unit, contract, real-Postgres/MinIO, security, component, and browser tests

## Security and Data Boundary

Attachment access is derived from current task/project/workspace authorization,
not object-key knowledge or prior upload permission. Filenames, MIME metadata,
file contents, completion claims, and storage responses are untrusted. Storage
must remain private, with server-generated keys and bounded, authorized access.

## API, Data, and Lifecycle Contract

- Store workspace/resource ownership, display filename, server object key,
  detected/declared content type, size, status, creator, and timestamps.
- Use an explicit lifecycle such as pending -> available or quarantined/failed;
  invalid transitions fail fast.
- Completion must be idempotent and verify the exact server-issued key, object
  size, and content policy before availability.
- Use current task/project/workspace authorization for metadata and object
  access; never authorize from object-key knowledge.
- Define cascade behavior for task/workspace deletion and whether metadata uses
  soft or hard deletion. Object deletion failures must be observable and
  reconciled.
- Preserve attachment audit metadata needed to diagnose orphan cleanup without
  logging file contents or signed URLs.

## Engineering Improvement Review

### UX/UI and Accessibility

- Show selection validation, progress, success, failure, retry, and unavailable
  or quarantined states.
- Support keyboard file selection, accessible labels/status announcements,
  cancel where transport supports it, mobile layout, and long filename wrapping.
- Require confirmation for permanent deletion; Undo is optional only if storage
  lifecycle makes it reliable.

### Backend, Storage, and Security

- Enforce limits at HTTP, application, and storage-completion boundaries.
- Treat filenames and MIME metadata as untrusted display data.
- Set safe download headers and prevent inline active content unless explicitly
  permitted.
- Rate-limit upload initialization/completion and cap outstanding pending
  uploads per actor/workspace.
- Monitor failure, orphan, quarantine, and cleanup counts.

### Code Quality and Testing

- Separate upload command validation, storage adapter, metadata lifecycle, and
  authorization.
- Use explicit status/result types; do not return mixed `unknown` values from
  parsers or adapters.
- Keep provider-specific behavior behind the smallest S3-compatible adapter.

## Ordered Implementation Plan

1. Approve resource owner, role matrix, upload transport, file policy,
   scanning disposition, deletion, and production provider assumptions.
2. Design the attachment lifecycle/schema/indexes and validate migration plus
   cascade/cleanup behavior.
3. Implement the S3-compatible adapter and server-generated object-key policy.
4. Implement authorized initialize/upload-or-proxy, completion, list, download,
   and delete commands with idempotency and strict validation.
5. Implement orphan/incomplete reconciliation and scanning/quarantine controls
   selected by the approved risk disposition.
6. Build the complete task attachment UI with accessible async states.
7. Add unit, contract, real-MinIO integration, security, component, and live
   browser evidence, including cleanup failures.
8. Reconcile API, security, domain, deployment, Docker, and roadmap docs.
9. Run the post-implementation review gate before final validation.

## Validation Contract

| Guarantee | Required evidence |
|---|---|
| Workspace/resource authorization | real-DB and real-MinIO cross-role/cross-workspace security tests |
| Object key and URL safety | contract tests for attacker keys, expiry, replay, and unauthorized download |
| Content policy | boundary tests for size, extension, declared MIME, signature mismatch, and active content |
| Lifecycle consistency | integration tests for retry, duplicate completion, interrupted upload, DB/storage failure, and cleanup |
| Provider compatibility | real MinIO plus selected production-compatible staging/provider contract evidence |
| Accessible user journey | component tests and live-browser select/progress/error/retry/download flow |

## Post-Implementation Review Gate

Review for IDOR/BOLA, path/key injection, public buckets, long-lived URLs,
content-type trust, active-content rendering, memory-buffered large files,
unbounded pending uploads, orphan leaks, destructive cascade mistakes, secrets in
logs, and mock-only storage evidence. Resolve in-scope findings and rerun the
affected validation.

## Rollback and Forward Fix

- Use backward-compatible metadata migration and explicit feature gating where
  available.
- Code rollback must leave pending objects unavailable and cleanup discoverable.
- Never delete user objects as part of an unverified schema rollback.

## Dependencies

- completed workspace/project/task authorization foundations
- selected production-compatible object storage contract
- [Background Jobs Foundation](background-jobs-foundation.md) before attachment
  availability only if approved malware scanning requires a worker; in that
  case first split out the minimal attachment metadata/storage contract and
  review the resulting three-slice dependency order

## Re-plan Conditions

- both task and comment attachments are required
- malware scanning requires a worker, triggering the explicit three-slice
  metadata/storage -> scanning worker -> availability/UI re-plan
- the hosting target cannot support the selected upload transport
- public sharing, previews, or multiple providers enter acceptance

## Follow-up

- previews/thumbnails
- comment attachments
- retention and legal/compliance policy when product requirements exist

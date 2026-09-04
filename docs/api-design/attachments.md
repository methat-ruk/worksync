# Task Attachment API

Attachments are nested under a workspace, project, and task. PostgreSQL
metadata is the availability and authorization authority; private S3-compatible
object existence alone grants no access.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/attachments` | Stream one PNG or JPEG attachment |
| `GET` | `/api/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/attachments` | List a bounded attachment page |
| `GET` | `/api/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/attachments/:attachmentId/content` | Stream an authorized forced download |
| `DELETE` | `/api/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/attachments/:attachmentId` | Delete object bytes before metadata |

Upload requires `multipart/form-data` with one `file` part, an opaque URL-safe
`Idempotency-Key` of 1–128 characters, and `X-Upload-Length`. A successful new
upload returns `201`; an identical completed replay returns the same attachment
with `200`. Reuse with another filename, MIME type, or declared size returns
`409`.

## Roles and Isolation

- Current workspace members, including `VIEWER`, may list and download.
- `OWNER`, `ADMIN`, and `MEMBER` may upload.
- The uploader or an `OWNER`/`ADMIN` may delete.
- Every operation re-establishes workspace, project, task, and attachment scope.
- Missing, inaccessible, and cross-boundary identifiers use the same safe
  not-found response.

## Content and Download Policy

Only `.png` with `image/png` and `.jpg`/`.jpeg` with `image/jpeg` are accepted.
The maximum authoritative size is 10 MiB. The normalized NFC display filename,
extension, declared MIME type, streamed size, and PNG/JPEG magic signature must
agree. Object keys are random server values and are never returned.

Downloads are backend-authorized streams with `application/octet-stream`,
`Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, and
`Cache-Control: private, no-store`. This foundation has no preview, inline
rendering, public URL, or signed direct upload contract.

## Lifecycle, Capacity, and Recovery

```text
PENDING -> AVAILABLE
PENDING -> FAILED
AVAILABLE -> DELETING -> metadata removed
DELETING -> DELETE_FAILED -> DELETING
```

Upload reservations and quotas use serializable PostgreSQL transactions. The
launch limits are 20 object-bearing attachments per task, 1 GiB reserved bytes
per workspace, 3 pending uploads per actor, and 20 pending uploads per
workspace. Redis enforces 10 actor and 100 workspace attempts per 10 minutes
and fails closed for upload when unavailable.

`attachments:reconcile` defaults to dry-run; `--apply` is required for changes.
It inspects stale pending objects, removes old verified object-free failures,
and retries contained delete failures in bounded batches. Normal output and
logs contain counts and reason codes, not filenames, bytes, object keys,
credentials, or provider URLs.

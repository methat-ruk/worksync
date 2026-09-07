# Milestone 4 - File Uploads and Background Jobs

Status: In progress

## Goal

Users can attach files and receive asynchronous workflow support without
weakening workspace isolation, storage safety, or job reliability.

## Foundation Already Present

- local MinIO service in Docker Compose
- Redis local service for future cache/queue use
- deployment and security documentation for file and job concerns
- task attachment metadata, private storage, authorization, bounded upload and
  download, reconciliation, and real-storage backend evidence
- task-detail attachment UI with progress, cancel/retry, list, authenticated
  download, confirmed delete, role handling, and live browser evidence

## Still Required

- email jobs
- reminder jobs
- daily summary jobs
- selected BullMQ/Redis integration
- worker runtime and deployment topology
- retry, idempotency, and poison-message handling

Feature plan order:

1. [File Upload Backend and Storage Foundation](feature-plans/completed/file-upload-foundation.md)
2. [Task Attachment UI Integration](feature-plans/completed/task-attachment-ui-integration.md)
3. [Background Jobs Foundation](feature-plans/planned/background-jobs-foundation.md)

This order is conditional. If the approved upload policy requires asynchronous
malware scanning before availability, split the work into attachment
metadata/storage lifecycle, Background Jobs scanning worker, and final upload
availability/UI integration slices. Do not create a dependency cycle between
file and job work.

## Exit Criteria

- file upload security tests exist: Done
- jobs validate payloads and handle retries: Not done
- storage access is scoped to authorized users: Done

## Related Docs

- [Security Model](../security-model.md)
- [Deployment](../deployment.md)
- [Docker Workflow](../workflows/docker-workflow.md)

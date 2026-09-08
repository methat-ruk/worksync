# Milestone 4 - File Uploads and Background Jobs

Status: Locally validated; Draft PR #54 awaiting review

## Goal

Users can attach files and receive asynchronous workflow support without
weakening workspace isolation, storage safety, or job reliability.

## Foundation Already Present

- local MinIO service in Docker Compose
- Redis local service, already used for rate protection; queue integration pending
- deployment and security documentation for file and job concerns
- task attachment metadata, private storage, authorization, bounded upload and
  download, reconciliation, and real-storage backend evidence
- task-detail attachment UI with progress, cancel/retry, list, authenticated
  download, confirmed delete, role handling, and live browser evidence

## Delivered Locally

- BullMQ/Redis integration with bounded expired-session cleanup as the first job
- isolated worker runtime, local topology, retry/idempotency and failed-job handling

## Still Required

- production worker enablement through the production deployment plan
- email, reminder and daily-summary jobs require their own approved use cases;
  they are not acceptance criteria for the one-job foundation

Feature plan order:

1. [File Upload Backend and Storage Foundation](feature-plans/completed/file-upload-foundation.md)
2. [Task Attachment UI Integration](feature-plans/completed/task-attachment-ui-integration.md)
3. [Background Jobs Foundation](feature-plans/completed/background-jobs-foundation.md)

The reviewed Background Jobs plan selects expired-session cleanup and does not
depend on attachment or notification work. Attachment reconciliation remains a
manual operation. If a future upload policy requires malware scanning, review
its quarantine/availability lifecycle as separate feature work; do not silently
replace the selected foundation job or reopen completed UI work.

## Exit Criteria

- file upload security tests exist: Done
- jobs validate payloads and handle retries: Done locally; Draft PR #54 awaits review
- storage access is scoped to authorized users: Done

## Related Docs

- [Security Model](../security-model.md)
- [Deployment](../deployment.md)
- [Docker Workflow](../workflows/docker-workflow.md)

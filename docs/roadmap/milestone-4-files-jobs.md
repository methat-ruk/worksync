# Milestone 4 - File Uploads and Background Jobs

Status: Planned

## Goal

Users can attach files and receive asynchronous workflow support without
weakening workspace isolation, storage safety, or job reliability.

## Foundation Already Present

- local MinIO service in Docker Compose
- Redis local service for future cache/queue use
- deployment and security documentation for file and job concerns

## Still Required

- file metadata model
- upload flow
- file access controls
- storage client integration
- file type and size policy
- signed URL or backend proxy decision
- email jobs
- reminder jobs
- daily summary jobs
- BullMQ integration
- worker runtime and deployment topology
- retry, idempotency, and poison-message handling

## Exit Criteria

- file upload security tests exist: Not done
- jobs validate payloads and handle retries: Not done
- storage access is scoped to authorized users: Not done

## Related Docs

- [Security Model](../security-model.md)
- [Deployment](../deployment.md)
- [Docker Workflow](../workflows/docker-workflow.md)

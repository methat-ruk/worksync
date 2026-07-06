# Feature Plan: File Upload Foundation

Status: Planned

Intended PR: `feat/file-upload-foundation`

Milestone: 4 - File Uploads and Background Jobs

## Goal

Allow authorized workspace members to attach files safely without weakening
storage, authorization, or content controls.

## Scope

- file metadata model
- upload flow decision: signed URL or backend proxy
- storage client integration
- file size/type policy
- workspace-scoped file access controls
- API contracts and security tests

## Out of Scope

- malware scanning unless selected as MVP required
- previews/thumbnails
- versioning
- public sharing

## Affected Surfaces

- backend API
- object storage
- Prisma migration
- frontend upload UI if included
- security tests

## Security and Data Boundary

Files must be authorized through workspace membership and resource ownership.
Upload policy must reject unsupported type/size and avoid path/key injection.

## Required Evidence

- allowed upload path
- unauthorized file read rejected
- oversized or unsupported file rejected
- storage key cannot be attacker-controlled
- migration validation if schema changes

## Done Criteria

- storage access is scoped and test-backed
- file policy is documented

## Dependencies

- workspace membership/RBAC
- project/task resource attachment decision

## Follow-up

- previews
- malware scanning hook

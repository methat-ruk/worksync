# Feature Plan: Workspace Foundation

Status: Next

Intended PR: `feat/workspace-foundation`

Milestone: 1 - Identity and Workspace

## Goal

Allow an authenticated user to create and read their own workspace foundation
without weakening tenant isolation.

## Scope

- workspace create API
- current user's workspace list/read API
- owner membership creation when a workspace is created
- public workspace and membership DTOs
- Swagger/API contract documentation
- backend integration, contract, and security tests

## Out of Scope

- invitations
- member management UI
- role editing
- project/task APIs
- realtime workspace events
- billing or organization settings

## Affected Surfaces

- backend API
- Prisma queries against existing workspace models
- Swagger/OpenAPI
- backend integration/contract/security tests
- frontend contract assumptions only if a thin placeholder call is needed

## Security and Data Boundary

Every workspace read must be scoped through authenticated membership. Frontend
route guards or hidden buttons are not authorization evidence.

## Required Evidence

- create workspace success
- creator becomes `OWNER`
- list returns only workspaces where the user is a member
- direct cross-user workspace read is rejected
- response/error envelope follows project convention
- Swagger documents success and error contracts
- typecheck, lint, relevant backend tests, and build

## Done Criteria

- API contract is stable enough for frontend bootstrap
- IDOR/BOLA tests cover direct workspace ID access
- no project/task behavior is introduced in this PR

## Dependencies

- auth foundation
- session lifecycle
- existing Prisma workspace models

## Follow-up

- workspace membership and RBAC
- workspace frontend bootstrap

# Feature Plan: Workspace Membership and RBAC

Status: Planned

Intended PR: `feat/workspace-membership-rbac`

Milestone: 1 - Identity and Workspace

## Goal

Allow workspace owners or admins to manage members and enforce role-based
workspace access consistently across backend routes.

## Scope

- finalize workspace role matrix
- membership list/add/remove or invitation decision
- RBAC guard or policy boundary
- workspace-scoped authorization helpers
- API contracts and Swagger docs
- integration/security tests for role and tenant isolation

## Out of Scope

- full invitation email workflow unless selected as the MVP member-add path
- project/task-specific role permissions
- frontend settings page polish
- billing roles

## Affected Surfaces

- backend authorization
- API contracts
- Prisma membership queries
- security tests
- frontend assumptions for workspace settings

## Security and Data Boundary

Role checks must be enforced server-side. Every protected query must include
workspace membership or an equivalent authorization proof.

## Required Evidence

- owner/admin allowed actions
- member/viewer denied actions where applicable
- cross-workspace and cross-user access rejected
- deleted or missing membership rejected
- contract tests for 401/403/404 behavior
- log output does not leak sensitive membership data

## Done Criteria

- role matrix is documented
- RBAC helpers are reusable for project/task routes
- workspace isolation evidence exists before dependent feature work begins

## Dependencies

- workspace foundation

## Follow-up

- workspace frontend bootstrap
- project foundation

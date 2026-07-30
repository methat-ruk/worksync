# Milestone 1 - Identity and Workspace

Status: Partial

## Goal

Users can authenticate, create or join a workspace, and access only the
workspace resources they are authorized to use.

## Identity and Authentication

Status: Done for MVP authentication foundation

Delivered:

- password signup and login
- email normalization
- shared password policy package used by frontend and backend
- password hashing
- JWT access tokens
- PostgreSQL-backed refresh sessions
- refresh-token rotation
- refresh-token replay protection
- logout and logout-all
- `/api/auth/me`
- auth guard and current-user contract
- request-origin protection for cookie-authenticated auth commands
- auth rate limiting for sensitive auth endpoints
- Google OAuth login with Authorization Code + PKCE/OpenID Connect
- safe Google identity linking policy
- frontend login, signup, Google login entry, protected routing, and auth
  browser E2E coverage
- explicit frontend auth recovery states, valid-session handling on public auth
  routes, recoverable Google OAuth completion, and same-origin post-login
  redirect validation

Deferred account lifecycle work:

- email verification
- forgot/reset password
- explicit account-linking UI/API
- account deletion
- session/device listing
- single-device session revocation

## Workspace and RBAC

Status: Partial

Delivered:

- Prisma `Workspace`, `WorkspaceMember`, and `WorkspaceRole` models
- role enum: `OWNER`, `ADMIN`, `MEMBER`, `VIEWER`
- API/security documentation for workspace boundaries and role expectations
- workspace creation API
- current user's workspace list/read API
- owner membership creation when a workspace is created
- workspace isolation enforcement for foundation workspace reads
- workspace foundation contract, integration, and security tests
- workspace membership list/add existing user/update role/remove APIs
- workspace-level OWNER/ADMIN RBAC policy boundary
- workspace membership contract, integration, and security tests
- frontend workspace bootstrap, current user's workspace list, empty state,
  create workspace flow, local workspace selection, and browser E2E coverage
- frontend shared API client and feature ownership boundary cleanup for auth,
  workspace, app shell, brand, and root providers
- legitimate multi-context refresh concurrency without successful-session
  revocation
- paginated workspace loading, accurate total display, later-page selection,
  and recoverable partial-failure handling
- reusable trusted workspace actor resolution with transaction participation,
  safe tenant-hiding failures, and downstream module export
- project role policy and workspace-scoped project isolation evidence

Still required:

- workspace isolation enforcement for every future workspace-scoped query
- role matrix finalization for task, comment, file, and activity actions

Feature plan order:

1. [Workspace Foundation](feature-plans/completed/workspace-foundation.md)
2. [Workspace Membership and RBAC](feature-plans/completed/workspace-membership-rbac.md)
3. [Workspace Frontend Bootstrap](feature-plans/completed/workspace-frontend-bootstrap.md)
4. [Frontend Structure Boundaries](feature-plans/completed/frontend-structure-boundaries.md)
5. [Frontend Auth State and Redirect Safety](feature-plans/completed/frontend-auth-state-and-redirect-safety.md)
6. [Auth Session Concurrency Hardening](feature-plans/completed/auth-session-concurrency-hardening.md)
7. [Workspace Pagination and Selection](feature-plans/completed/workspace-pagination-and-selection.md)
8. [Workspace Authorization Boundary](feature-plans/completed/workspace-authorization-boundary.md)

## Exit Criteria

- direct API calls cannot access another workspace: Done for workspace
  foundation and workspace membership management
- role matrix has backend integration coverage: Done for workspace-level
  membership and projects; not done for task/comment/file actions
- critical auth and workspace flows have contract tests: Auth and workspace
  foundation, workspace foundation, membership management, and frontend
  bootstrap done

## Related Docs

- [API Design](../api-design.md)
- [Security Model](../security-model.md)
- [Auth Workflow](../workflows/auth-workflow.md)
- [Google OAuth Setup](../google-oauth-setup.md)
- [Auth Foundation](feature-plans/completed/auth-foundation.md)
- [Auth Session Lifecycle](feature-plans/completed/auth-session-lifecycle.md)
- [Google OAuth Login](feature-plans/completed/auth-google-oauth.md)
- [Frontend Auth and App Shell](feature-plans/completed/frontend-auth-app-shell.md)
- [Workspace Foundation](feature-plans/completed/workspace-foundation.md)
- [Workspace Membership and RBAC](feature-plans/completed/workspace-membership-rbac.md)
- [Workspace Frontend Bootstrap](feature-plans/completed/workspace-frontend-bootstrap.md)
- [Frontend Structure Boundaries](feature-plans/completed/frontend-structure-boundaries.md)
- [Frontend Auth State and Redirect Safety](feature-plans/completed/frontend-auth-state-and-redirect-safety.md)
- [Auth Session Concurrency Hardening](feature-plans/completed/auth-session-concurrency-hardening.md)
- [Workspace Pagination and Selection](feature-plans/completed/workspace-pagination-and-selection.md)
- [Workspace Authorization Boundary](feature-plans/completed/workspace-authorization-boundary.md)

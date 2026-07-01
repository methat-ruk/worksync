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

Deferred account lifecycle work:

- email verification
- forgot/reset password
- explicit account-linking UI/API
- account deletion
- session/device listing
- single-device session revocation

## Workspace and RBAC

Status: Planned / not implemented

Foundation already present:

- Prisma `Workspace`, `WorkspaceMember`, and `WorkspaceRole` models
- role enum: `OWNER`, `ADMIN`, `MEMBER`, `VIEWER`
- API/security documentation for workspace boundaries and role expectations

Still required:

- workspace creation API
- workspace membership APIs
- invitation or member-add flow
- RBAC guards/policies
- workspace isolation enforcement in every workspace-scoped query
- IDOR/BOLA and cross-tenant security tests
- role matrix finalization for project, task, comment, file, and activity
  actions
- frontend workspace bootstrap and workspace selection UX

## Exit Criteria

- direct API calls cannot access another workspace: Not done
- role matrix has backend integration coverage: Not done
- critical auth and workspace flows have contract tests: Auth done; workspace
  not done

## Related Docs

- [API Design](../api-design.md)
- [Security Model](../security-model.md)
- [Auth Workflow](../workflows/auth-workflow.md)
- [Google OAuth Setup](../google-oauth-setup.md)

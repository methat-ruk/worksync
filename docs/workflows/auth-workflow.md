# Auth Workflow

## Purpose

Authentication is a security boundary in WorkSync. Use this workflow when
changing signup, login, refresh, logout, Google OAuth, auth cookies, JWTs,
sessions, request-origin protection, or abuse controls.

## Current Auth Capabilities

- Email/password signup and login
- Password hashing and shared password policy
- JWT access tokens
- PostgreSQL-backed refresh sessions
- Refresh-token rotation and replay protection
- Logout and logout-all
- Google OAuth login with PKCE and OpenID Connect
- `/api/auth/me`
- Auth guard and current-user contract
- Rate limiting for sensitive auth endpoints

## High-Level Flows

### Password Signup

```text
validate DTO
-> normalize email
-> enforce shared password policy
-> hash password
-> create user and session
-> set refresh cookie
-> return public user and access token
```

Signup must create a password hash. API responses must never include
`passwordHash`.

### Password Login

```text
validate DTO
-> normalize email
-> look up user
-> verify password or run dummy verification for unknown users
-> reject provider-only users with the same public credential failure
-> create session
-> set refresh cookie
-> return public user and access token
```

Unknown email, missing password hash, and wrong password must return the same
client-facing `401 INVALID_CREDENTIALS` response.

### Google OAuth Login

```text
start route
-> generate state, nonce, and PKCE
-> set temporary transaction cookies
-> redirect to Google
-> callback validates state, nonce, PKCE, and ID token
-> resolve or link identity
-> create session
-> set refresh cookie
-> redirect to frontend
```

Do not store Google access tokens, refresh tokens, or profile pictures. Google
identity is keyed by provider subject, not email.

### Session Refresh

```text
read HttpOnly refresh cookie
-> verify session and token hash
-> rotate refresh token
-> return retryable 409 for a rotation conflict within 5 seconds
-> conditionally revoke unsafe reuse outside the grace window
-> return a new access token
```

Refresh sessions are stored in PostgreSQL. Redis is not the auth-session source
of truth.

The frontend treats only refresh `401` as proof that the browser session is
unauthenticated. Network, throttling, other non-`401`, malformed-response, and
parsing failures enter a recoverable state that hides protected content and
public auth forms until the user retries. Bootstrap, OAuth completion, and
automatic authenticated-request recovery share one in-flight frontend refresh
transition.

Refresh, logout, and logout-all share the exclusive
`worksync-auth-session` Web Lock across same-origin tabs when the API exists.
The frontend holds the lock across up to two exact
`409 REFRESH_CONCURRENCY_CONFLICT` retries, honoring a clamped
`Retry-After` delay. Only refresh `401` proves the session is unauthenticated;
an exhausted conflict remains recoverable. Successful logout and definitive
refresh `401` outcomes broadcast only `{ "type": "session-invalidated" }` so
other tabs clear memory-only access state without rebroadcasting. Browsers
without Web Locks or BroadcastChannel rely on the backend state machine and
their next authoritative request.

### Logout

```text
read refresh cookie
-> revoke current session or session family
-> clear refresh cookie
-> return success envelope
```

## Security Contract

- Never return password hashes.
- Never log raw passwords, password hashes, bearer tokens, refresh tokens,
  OAuth codes, OAuth cookies, Google subject IDs, or client secrets.
- JWT payloads must stay minimal.
- Auth cookies must use the configured security attributes.
- Sensitive auth endpoints must expose `429 RATE_LIMITED` when abuse controls
  trigger.
- Frontend route protection is UX only; backend authorization is authoritative.
- Post-login navigation accepts only validated same-origin root-relative paths
  and fails closed to `/app`.

## Validation

Backend evidence should cover:

- signup success and duplicate normalized email
- login success, unknown email, wrong password, and provider-only user
- missing, malformed, expired, wrong-signature, and revoked tokens
- refresh rotation and replay protection
- logout and logout-all
- Google OAuth success and failure redirects
- rate-limited auth behavior
- Swagger/API error contracts
- log leakage checks for credentials and tokens

Frontend evidence should cover:

- signup/login success and failure UX
- Google start/callback path behavior
- refresh and protected-route behavior
- logout/logout-all failure paths
- loading, error, disabled, and retry states

## Common Failure Modes

- Client-facing login errors leak whether a user exists.
- Provider-only users accidentally pass through password login logic.
- A concurrent refresh loser revokes the newer winning rotation.
- Replay revocation uses stale observations and can revoke a newer rotation.
- OAuth redirect URL includes sensitive provider data or tokens.
- Rate limit behavior exists in code but is undocumented in Swagger/contracts.
- Frontend stores tokens in URLs, logs, or durable state without an explicit
  design.

## Related Docs

- [Security Model](../security-model.md)
- [API Design](../api-design.md)
- [Google OAuth Setup](../google-oauth-setup.md)
- [Frontend and Backend API Workflow](frontend-backend-api-workflow.md)
- [CI Validation Workflow](ci-validation-workflow.md)

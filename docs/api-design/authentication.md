# Authentication API

The authentication foundation exposes:

- `POST /api/auth/signup` to create a password-authenticated user, persisted
  session, access token, and refresh cookie.
- `POST /api/auth/login` to authenticate and create a new persisted session.
- `POST /api/auth/refresh` to rotate the refresh cookie and issue a new access
  token.
- `POST /api/auth/logout` to revoke the current refresh-token session.
- `POST /api/auth/logout-all` to revoke every session for the authenticated
  user.
- `GET /api/auth/me` to return the authenticated public user.
- `GET /api/auth/google` to start Google Authorization Code + PKCE login.
- `GET /api/auth/google/callback` to verify Google OpenID Connect identity,
  issue the normal WorkSync session, and redirect to the configured frontend.

## Password Policy

Password signup uses one shared policy package on both sides of the API:

- 12-128 characters
- no leading or trailing whitespace
- zxcvbn score 3 or higher, which rejects known/common weak passwords
- no uppercase/lowercase/number/symbol composition requirement

Any signup password policy failure returns `400` with
`AUTH_PASSWORD_POLICY_VIOLATION`. `confirmPassword` is a frontend-only field and
must never be included in an API request.

## Access and Refresh Tokens

Access tokens use the `Authorization: Bearer <token>` header. Public user
contracts never include password hashes. Unknown-email and incorrect-password
login attempts return the same public failure.

Refresh tokens are one-time-use JWTs stored only in a scoped HttpOnly cookie.
Their hashes and session lifecycle state are persisted in PostgreSQL. Rotation
retains the original absolute session expiry. Reuse within 5 seconds of a
successful rotation returns `409 REFRESH_CONCURRENCY_CONFLICT` with
`Retry-After: 1`, issues no credentials, and does not revoke the winning
rotation. Reuse after that fixed grace window revokes the affected session.
An active state that cannot be classified safely returns recoverable
`503 SERVICE_NOT_READY` without issuing credentials or revoking the session.
Logout invalidates access tokens for the revoked session immediately. Browser
auth requests with an `Origin` header must match the configured CORS origin;
CORS exposes `Retry-After` so the frontend can honor the conflict contract.

The browser serializes refresh, logout, and logout-all across same-origin tabs
with the Web Locks API when available and bounds lock acquisition to 10 seconds.
It retries only the exact refresh conflict contract, at most twice with no more
than two seconds of total delay.
Successful logout and definitive refresh `401` outcomes publish a
credential-free `session-invalidated` BroadcastChannel event. Receiving tabs
hide protected content and validate their current access-token session through
`/api/auth/me` without refresh, so a delayed event cannot clear a newer active
login. Access tokens remain memory-only, and browsers without these APIs rely
on the server contract and the next authoritative request rather than
persistent-storage fallbacks.

## Rate Limits and Public Errors

Sensitive auth endpoints return `429` with `RATE_LIMITED` when rate or quota
protection rejects a request. Login and signup limits are scoped to safe
composite keys such as IP plus normalized email; refresh and Google OAuth
limits are scoped to request/IP and token or transaction fingerprints where
available. Public responses must not expose limiter keys, emails, tokens,
cookies, provider payloads, or quota internals.

## Google OAuth Redirect Safety

Google callbacks return only fixed frontend status parameters. Authorization
codes, access tokens, refresh tokens, provider payloads, and account identifiers
must never appear in callback redirect URLs.

## Deferred Auth Lifecycle

Explicit account linking, account recovery, email verification, and
session/device listing remain future lifecycle work. MVP auth lifecycle
explicitly defers email verification, forgot/reset password, explicit account
linking UI/API, account deletion, session/device listing, and single-device
revocation.

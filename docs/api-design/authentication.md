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
retains the original absolute session expiry, token reuse revokes that session,
and logout invalidates access tokens for the revoked session immediately.
Browser auth requests with an `Origin` header must match the configured CORS
origin.

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

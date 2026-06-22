# Google OAuth Setup

WorkSync uses the Google OAuth 2.0 Authorization Code flow with PKCE and OpenID
Connect. The NestJS backend owns the redirect and callback. It does not store
Google access or refresh tokens.

## Google Cloud Configuration

1. Select or create a Google Cloud project.
2. Configure the OAuth consent screen.
3. Create an OAuth 2.0 Client ID with application type **Web application**.
4. Add this local authorized redirect URI:

```text
http://localhost:4000/api/auth/google/callback
```

5. Add the equivalent HTTPS backend callback URI for each deployed
   environment.

The OAuth client secret is backend-only. Never expose it through a
`NEXT_PUBLIC_` variable or commit it to Git.

## Local Environment

Set these values in `app/backend/.env`:

```dotenv
FRONTEND_URL=http://localhost:3000
GOOGLE_OAUTH_ENABLED=true
GOOGLE_OAUTH_CLIENT_ID=your-web-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-web-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
GOOGLE_OAUTH_TOKEN_TIMEOUT_MS=5000
```

Local development may use `GOOGLE_OAUTH_ENABLED=false`. Test and production
configuration fail startup unless Google OAuth is enabled and all required
values are present.

## Backend Flow

1. Open `GET http://localhost:4000/api/auth/google`.
2. WorkSync creates state, nonce, and PKCE transaction cookies and redirects to
   Google.
3. Google redirects to `/api/auth/google/callback`.
4. WorkSync verifies the callback, resolves the Google identity, creates the
   normal persisted WorkSync session, and sets the existing refresh cookie.
5. The callback redirects to:

```text
http://localhost:3000/?auth=google-success
```

The frontend integration is intentionally separate. A future callback page
will call `POST /api/auth/refresh` with credentials included to obtain the
access token.

Cancellation redirects with `auth=google-cancelled`. Other failures redirect
with the generic `auth=google-error&code=GOOGLE_LOGIN_FAILED` status. Redirect
URLs never contain authorization codes, provider payloads, email addresses, or
tokens.

## Account Behavior

- Existing Google `sub` values always resolve the previously linked WorkSync
  user.
- New Google users are created with `passwordHash=null`.
- Existing password accounts auto-link only for Gmail or Google Workspace
  identities where Google is authoritative for the email.
- Third-party Google account emails that collide with an existing WorkSync user
  are rejected until an explicit authenticated linking flow exists.
- A later Google email change updates only the provider email snapshot; it does
  not silently change the WorkSync user email.

## Production Checklist

- Use HTTPS callback and frontend URLs.
- Set `COOKIE_SECURE=true`.
- Store the Google client secret in the environment secret store.
- Register the exact callback URI; Google requires an exact match.
- Confirm `FRONTEND_URL`, `CORS_ORIGIN`, cookie domain, and callback URI match
  the deployed topology.
- Run the automated integration, contract, and security suites before a manual
  Google login smoke test.

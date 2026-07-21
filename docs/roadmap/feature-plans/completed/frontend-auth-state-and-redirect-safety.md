# Completed Feature Plan: Frontend Auth State and Redirect Safety

Status: Done

## Delivered

- explicit frontend auth states for loading, authenticated, unauthenticated,
  and recoverable session-verification failure
- typed refresh outcomes across the auth API, auth store, and shared API client
- one in-flight auth-store refresh transition shared by bootstrap, OAuth
  completion, and automatic authenticated-request recovery
- public-only and protected route guards that withhold content until the
  browser session is decided
- reusable recovery UI with manual retry for temporary refresh failures
- Google OAuth callback recovery without restarting provider sign-in
- same-origin post-login redirect validation with bounded repeated decoding and
  a fail-closed `/app` fallback
- removal of the unused frontend current-user helper and response schema
- corrected Google OAuth setup documentation

## Key Decisions

- only refresh `401` proves that the browser session is unauthenticated
- network, throttling, other non-`401`, malformed-response, and parsing failures
  remain recoverable and do not render login/signup or protected content
- raw refresh causes stay out of the public auth snapshot and user-facing copy
- refresh request coalescing and state publication have one owner: the auth
  store
- the shared API client retries an original authenticated request only after a
  successful refresh and never loops
- redirect targets must remain canonical root-relative paths on the frontend
  origin; malformed, encoded-authority, backslash, control-character, and
  non-HTTP scheme inputs fail closed

## Evidence

- frontend `typecheck`, ESLint, and optimized production build
- 5 shared auth-policy tests
- 71 frontend unit and component tests, including the refresh outcome matrix,
  coalescing, route guards, OAuth recovery, and redirect attack cases
- 16 Chromium E2E scenarios, including public/protected recovery, existing
  sessions on auth pages, safe and malicious post-login redirects, and OAuth
  retry
- post-implementation code, frontend, and security review followed by affected
  test reruns
- `git diff --check`

## Known Follow-up

- [Auth Session Concurrency Hardening](auth-session-concurrency-hardening.md)
  owns cross-tab refresh coordination, backend rotation concurrency, and
  refresh-versus-logout race policy

# WorkSync Deployment

This document defines deployment expectations before infrastructure and CI/CD are implemented.

## Runtime Topology

Expected production components:

```text
Client
-> ingress and TLS
-> Next.js frontend
-> NestJS backend
-> PostgreSQL
-> Redis
-> BullMQ workers
-> Socket.IO transport
-> AWS S3
-> external providers
```

The exact provider, hosting target, and CI/CD platform are not selected in this document.

## Environments

Expected environment stages:

- local
- test or CI
- staging
- production

Each environment must have separate configuration and secrets.

Production data must not be copied into lower environments unless sanitized and explicitly approved.

## Configuration

Environment configuration must be supplied outside built artifacts.

Required categories:

- application URLs
- database URL
- Redis URL
- queue settings
- JWT and refresh token secrets
- object storage credentials and bucket
- CORS and cookie settings
- email/provider settings when enabled
- Google OAuth client ID, client secret, exact callback URI, and token-exchange timeout
- observability settings

See `.env.example`, `.env.local.example`, and `.env.docker.example` for
initial variable names and local run-mode examples.

Production authentication configuration must use independent access and
refresh secrets of at least 32 bytes. Refresh cookies must be secure in
TLS-backed environments, and the configured cookie domain and CORS origin must
match the deployed frontend/API topology.

Cookie-domain rules:

- leave `COOKIE_DOMAIN` empty for localhost or a host-only cookie
- use a shared parent such as `.example.com` only for sibling subdomains
- never include a scheme, port, or path
- require `COOKIE_SECURE=true` behind HTTPS
- configure the exact OAuth callback URL at Google and in
  `GOOGLE_OAUTH_REDIRECT_URI`

Frontend `NEXT_PUBLIC_*` values are build-time inputs. A URL or public feature
flag change requires rebuilding the frontend image; backend secrets remain
runtime-only configuration.

## Build and Artifact Expectations

- Build frontend and backend from reviewed source.
- Use the root multi-target `Dockerfile` targets `frontend` and `backend`.
- Use `docker/compose.app.yml` only as a local/staging-like application overlay.
- Produce identifiable artifacts.
- Do not bake secrets into artifacts.
- Promote the same artifact between environments where possible.
- Record commit, artifact identity, environment, actor, and time for deployments.

Container commands:

```bash
docker compose -f docker/compose.yml config
docker compose --env-file .env -f docker/compose.yml -f docker/compose.app.yml config
docker compose --env-file .env -f docker/compose.yml -f docker/compose.app.yml config --services
docker compose --env-file .env -f docker/compose.yml -f docker/compose.app.yml build
docker compose --env-file .env -f docker/compose.yml -f docker/compose.app.yml up --build -d
docker compose --env-file .env -f docker/compose.yml -f docker/compose.app.yml down
```

Local run-mode boundaries:

- Hybrid mode uses `docker/compose.yml` only. Docker runs PostgreSQL, Redis,
  and MinIO; frontend and backend run locally with pnpm and localhost URLs.
- Full Docker mode combines `docker/compose.yml` with
  `docker/compose.app.yml`. Backend containers use `postgres`, `redis`, and
  `minio` service hostnames. Frontend `NEXT_PUBLIC_*` API/socket URLs still use
  host-reachable localhost values because they execute in the user's browser.

The container definition does not yet implement TLS/ingress, registry
publishing, production secret injection, automated backups, or deployment
promotion. Those remain release-readiness requirements.

The backend target currently retains the workspace installation to keep Prisma
and workspace-package resolution deterministic. Production dependency pruning,
SBOM generation, signing, and image-size optimization remain pipeline work.

## Migration Order

When Prisma schema or data changes:

1. run migration validation in non-production
2. verify backup or recovery path
3. prefer expand/migrate/switch/contract for risky changes
4. deploy application changes in compatible order
5. run post-migration verification queries

Application rollback may not reverse data changes. Define rollback, containment, or forward-fix before execution.

## Health and Readiness

Health checks should cover:

- backend process is alive
- database connectivity when required
- Redis connectivity when required
- queue worker health when affected
- storage access when affected

Readiness should reflect ability to serve useful work, not only process existence.

## Deployment Verification

Post-deploy smoke checks should include affected paths:

- health check
- login
- create or update task
- comment or notification
- queue worker status
- database and Redis reachability
- file upload smoke when storage changed
- realtime smoke when Socket.IO behavior changed

## Rollback, Containment, and Forward Fix

Every production deployment requires:

- rollback trigger
- rollback command or process
- latest safe artifact
- data consequences
- containment option when rollback is unsafe
- owner authorized to decide

If rollback is unsafe, define a forward-fix or feature-disable path.

## Observability

Before production release, define:

- request error rate and latency signals
- auth failures
- workspace isolation/security events
- queue depth and oldest job age
- realtime connection and delivery failures
- dependency health
- deployment markers

Alerts and dashboards should prioritize user-visible impact.

## Open Decisions

- Hosting provider
- CI/CD platform
- artifact registry
- secret store
- observability provider
- backup and restore tooling
- production domain and TLS ownership

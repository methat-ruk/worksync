# WorkSync Deployment Profile

## Runtime Components

```txt
Client
-> ingress and TLS
-> Next.js frontend
-> NestJS backend
-> PostgreSQL
-> Redis
-> BullMQ workers
-> Socket.IO transport
-> S3-compatible object storage, MinIO locally and AWS S3 as the production target
-> external providers
```

Treat this as the current project topology, not a universal infrastructure model.

## Delivery Requirements

- Build frontend and backend artifacts through the selected CI/CD system.
- Validate Docker images and Docker Compose configuration where applicable.
- Keep environment configuration and secrets outside built artifacts.
- Promote immutable artifacts between environments.
- Coordinate Prisma migration ordering with application deployment.
- Verify PostgreSQL, Redis, BullMQ workers, Socket.IO delivery, and
  S3-compatible storage access after deployment when affected.

## Local and Test Topology Consistency

WorkSync hybrid development exposes PostgreSQL on `localhost:5433` to avoid
common local PostgreSQL conflicts. Keep these surfaces aligned when changing
local ports, service names, or run modes:

- `docker/compose.yml`
- root and app environment examples
- backend test setup defaults
- Prisma test migration and runtime smoke commands
- CI service mappings and injected environment variables
- setup and validation documentation

`docker compose config` is useful for local troubleshooting, but it can print
resolved environment values. Use quiet or service-list checks in CI and avoid
pasting full config output when real secrets may be present.

## Production Checks

- TLS and ingress support uploads and long-lived realtime connections.
- Backend shutdown drains requests and background work safely.
- BullMQ worker concurrency and backlog limits are explicit.
- PostgreSQL connection and storage capacity are bounded.
- Redis memory and eviction behavior match cache and ephemeral-state usage.
- Backup and restore evidence exists for persistent data.

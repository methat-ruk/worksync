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

## Production Checks

- TLS and ingress support uploads and long-lived realtime connections.
- Backend shutdown drains requests and background work safely.
- BullMQ worker concurrency and backlog limits are explicit.
- PostgreSQL connection and storage capacity are bounded.
- Redis memory and eviction behavior match cache and ephemeral-state usage.
- Backup and restore evidence exists for persistent data.

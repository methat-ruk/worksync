# WorkSync Architecture

## Repository Layout

- frontend application: `app/frontend/`
- backend application: `app/backend/`
- documentation: `docs/`
- container configuration: `docker/`

Follow the existing structure. Do not move files, restructure modules, or introduce architectural patterns without a requirement and clear justification.

## API and Identity

- Use REST with GET, POST, PATCH, and DELETE.
- Use this response envelope unless an existing contract requires otherwise:

```ts
{
  success: boolean;
  message?: string;
  data?: unknown;
}
```

- Use JWT access and refresh tokens.
- PostgreSQL-backed authentication sessions are the source of truth for refresh rotation, revocation, logout, and immediate access-token invalidation.
- Access tokens identify the user and session. Refresh tokens rotate through an HttpOnly cookie and are stored only as cryptographic hashes.
- Refresh-token replay or unsafe concurrent reuse revokes the affected session family.
- Session lifetime is absolute; do not silently convert it to sliding expiration.
- Cookie-authenticated refresh and logout commands require the configured request-origin protection.
- Password and external-provider authentication issue sessions through the same session boundary; provider-only users may have no password hash.
- Google identities are keyed by provider subject in PostgreSQL and store only
  minimum identity metadata. Google tokens are not persisted.
- Gmail and Google Workspace identities may link to an existing normalized
  email; third-party Google email collisions require a future explicit linking
  flow.
- Roles are OWNER, ADMIN, MEMBER, and VIEWER.
- Enforce role checks, resource ownership, and workspace isolation in trusted backend boundaries.
- Frontend restrictions are not authorization.

## Frontend Conventions

- Use TypeScript strict mode.
- Prefer Next.js Server Components when interaction, browser APIs, or client effects are not required.
- Introduce Client Components deliberately and keep their boundary narrow.
- Follow App Router conventions and existing feature organization.
- Load `references/worksync/frontend.md` for UI component, styling, design-system, and reusable component standards.

## Backend Conventions

- Use TypeScript strict mode.
- Keep NestJS controllers transport-focused and business behavior in services or domain logic.
- Use DTOs and the established validation pipeline for external input.
- Keep Prisma access in the established persistence boundary.
- Do not expose Prisma models as public API contracts.
- Reuse business rules from HTTP, Socket.IO handlers, BullMQ jobs, and scheduled work.

## Data and Runtime State

- PostgreSQL is the persistent business source of truth.
- Prefer Prisma over raw SQL.
- Raw SQL requires a concrete reason and safe parameterization.
- Redis is limited to cache, online-user state, and notification cache. It is not the authentication-session source of truth.
- Never use Redis as the source of truth for persistent business data.

## Realtime and Background Work

- Use Socket.IO events such as `task.created`, `task.updated`, `comment.created`, and `notification.created`.
- Broadcast only to related workspace members.
- Use BullMQ for email, reminder, and daily-summary jobs.
- Move long-running request work to queues.

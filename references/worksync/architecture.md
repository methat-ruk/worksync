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
- Redis is limited to cache, online-user state, and notification cache.
- Never use Redis as the source of truth for persistent business data.

## Realtime and Background Work

- Use Socket.IO events such as `task.created`, `task.updated`, `comment.created`, and `notification.created`.
- Broadcast only to related workspace members.
- Use BullMQ for email, reminder, and daily-summary jobs.
- Move long-running request work to queues.

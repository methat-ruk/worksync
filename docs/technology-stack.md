# WorkSync Technology and Dependency Inventory

This document explains the major technologies selected by WorkSync and their
current implementation status.

Dependency versions are intentionally not duplicated here. Use the repository
manifests and lockfile as the source of truth:

- root tooling: `package.json`
- backend packages: `app/backend/package.json`
- frontend packages: `app/frontend/package.json`
- exact direct and transitive versions: `pnpm-lock.yaml`
- local infrastructure images: `docker/compose.yml`

## Runtime and Workspace

| Technology | Status | Purpose |
|---|---|---|
| Node.js 22 LTS | Active | JavaScript and TypeScript runtime |
| pnpm via Corepack | Active | Workspace package manager |
| pnpm workspaces | Active | Frontend/backend monorepo orchestration |
| TypeScript strict mode | Active | Shared static type checking |

The repository pins pnpm through `packageManager` and Node.js through `.nvmrc`
plus the root `engines` declaration.

## Frontend

| Technology | Status | Purpose |
|---|---|---|
| Next.js App Router | Active foundation | Frontend application and routing |
| React | Active foundation | UI runtime |
| Tailwind CSS | Installed and configured | Styling |
| PostCSS / Autoprefixer | Installed and configured | CSS processing |
| shadcn/ui | Selected, not installed | Planned component system |

The frontend currently contains the application foundation. Feature UI and a
real frontend test harness remain future work.

## Backend and API

| Technology | Status | Purpose |
|---|---|---|
| NestJS | Active | Backend modules, controllers, guards, services, and lifecycle |
| Express adapter | Active | HTTP transport used by NestJS |
| class-validator / class-transformer | Active | DTO validation and normalization |
| Swagger / OpenAPI | Active | API contract documentation |
| Terminus | Active | Health and readiness endpoints |
| RxJS | Active framework dependency | NestJS reactive primitives |

## Authentication and Security

| Technology | Status | Purpose |
|---|---|---|
| Node.js `crypto` scrypt | Active | Password hashing |
| `@nestjs/jwt` | Active | Access and refresh JWT handling |
| PostgreSQL auth sessions | Active | Rotation, replay detection, revocation, and logout |
| HttpOnly refresh cookie | Active | Browser refresh-token transport |
| Google OAuth | Planned, not installed | Next authentication provider |

Google OAuth must reuse the existing session issuance and lifecycle boundary
rather than create a second token or cookie system.

## Persistence

| Technology | Status | Purpose |
|---|---|---|
| PostgreSQL 16 | Active | Persistent source of truth |
| Prisma 7 | Active | Schema, migrations, generated client, and data access |
| `@prisma/adapter-pg` | Active | Prisma runtime PostgreSQL adapter |
| `pg` | Active | PostgreSQL driver |

Prisma configuration lives in `app/backend/prisma.config.ts`. Migration history
lives under `app/backend/prisma/migrations/`.

## Observability

| Technology | Status | Purpose |
|---|---|---|
| Pino | Active | Structured logging |
| nestjs-pino / pino-http | Active | NestJS request logging |
| Correlation IDs | Active | Request tracing across logs and error responses |
| OpenTelemetry exporter | Planned | Production tracing and telemetry export |

Authentication credentials, tokens, cookies, password hashes, and authorization
headers must remain redacted from logs.

## Local Infrastructure and Planned Integrations

| Technology | Status | Purpose |
|---|---|---|
| Docker Compose | Active for local development | Local service orchestration |
| Redis 7 | Service available, application integration pending | Future cache and ephemeral state |
| BullMQ | Planned, not installed | Future email, reminder, and summary jobs |
| MinIO | Service available, application integration pending | Local S3-compatible storage |
| AWS S3 SDK | Planned, not installed | Production object-storage integration |
| Socket.IO | Planned, not installed | Realtime collaboration and notifications |
| Email provider SDK | Planned, not installed | Transactional email delivery |

Redis is not the authentication-session source of truth.

## Testing and Quality

| Technology | Status | Purpose |
|---|---|---|
| Jest | Active | Backend unit, integration, contract, security, and API tests |
| ts-jest | Active | TypeScript transformation for Jest |
| Supertest | Active | HTTP/API assertions |
| ESLint and typescript-eslint | Active | Static quality checks |
| Husky | Active | Git hook entrypoints |
| lint-staged | Active | Staged-file linting |
| Playwright | Planned, not installed | Future browser E2E coverage |

The frontend test command is currently a placeholder. Backend PostgreSQL
integration tests use a real `worksync_test` database.

## Delivery

| Technology | Status | Purpose |
|---|---|---|
| GitHub Actions | Active | CI validation |
| Production Dockerfiles | Planned | Runtime image creation |
| Artifact validation script | Active | Backend runtime output verification |
| Dependency audit | Active in CI | Production dependency vulnerability gate |

## Dependency Inspection Commands

Use these commands instead of maintaining a manual package-version table:

```bash
corepack pnpm list -r --depth 0
corepack pnpm why <package>
corepack pnpm outdated -r
corepack pnpm audit --prod
```

When adding a dependency:

1. confirm the platform, framework, or an existing package cannot solve the need
2. add it to the owning workspace, not automatically to the repository root
3. commit the manifest and `pnpm-lock.yaml` together
4. update this inventory only when the architectural technology or its status changes
5. run the validation appropriate to the affected workspace

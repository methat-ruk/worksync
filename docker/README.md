# Docker Run Modes

WorkSync keeps Docker configuration beside the Compose file that owns it. The
repository root has no active `.env` contract.

## Environment Files

| Mode | Template | Local file |
|---|---|---|
| Hybrid infrastructure | none | none |
| Full Docker development | `.env.development.example` | `.env.development` |
| Isolated Docker tests | `.env.test.example` | `.env.test` |

Real env files remain ignored. Copy only the template required by the selected
mode:

```bash
cp docker/.env.development.example docker/.env.development
cp docker/.env.test.example docker/.env.test
```

## Development

Hybrid mode runs PostgreSQL, Redis, and MinIO in Docker while applications run
on the host:

```bash
corepack pnpm docker:infra:up
corepack pnpm dev
corepack pnpm docker:infra:down
```

Full Docker development adds the frontend and backend application containers:

```bash
corepack pnpm docker:full:config
corepack pnpm docker:full:up
corepack pnpm docker:full:down
```

The development topology owns the existing development ports, named
containers, and persistent volumes. It is not a production deployment
definition.

Development application images use `worksync-backend:local` and
`worksync-frontend:local`. Infrastructure keeps the upstream image names
`postgres:16-alpine`, `redis:7-alpine`, and the pinned MinIO release because
those images are external dependencies rather than WorkSync-built artifacts.
Development containers are named `worksync-backend`, `worksync-frontend`,
`worksync-postgres`, `worksync-redis`, and `worksync-minio`.

## Prepare Images Without Containers

Pull the pinned infrastructure dependencies and build all WorkSync development
and test targets without creating a container:

```bash
corepack pnpm docker:images:prepare
```

The resulting WorkSync-built images are:

- `worksync-backend:local`
- `worksync-frontend:local`
- `worksync-test-runner:local`
- `worksync-test-e2e:local`

## Isolated Tests

Validate the test env before running the smallest useful scope:

```bash
corepack pnpm docker:test:config
corepack pnpm docker:test:backend
corepack pnpm docker:test:frontend
corepack pnpm docker:test:e2e
corepack pnpm docker:test
```

The test orchestrator:

- requires `docker/.env.test` and a PostgreSQL URL targeting the `postgres`
  service and a database whose name ends in `_test`
- uses the fixed `worksync-test` Compose project without host ports or explicit
  container names
- refuses to replace an active test project
- stops at the first failed scope
- removes test containers, networks, and the disposable PostgreSQL volume
  after success, failure, SIGINT, or SIGTERM
- never runs a reset command or addresses development Compose resources

If an external failure prevents normal cleanup, run:

```bash
corepack pnpm docker:test:down
```

This recovery command renders the test model with the tracked example and
removes only the fixed test project and its disposable volumes.

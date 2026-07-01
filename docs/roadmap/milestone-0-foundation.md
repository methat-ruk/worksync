# Milestone 0 - Foundation

Status: Done

## Goal

Establish the application, local runtime, validation, and documentation
foundation needed to safely build product features.

## Delivered

- frontend and backend application skeletons
- local development setup
- root, frontend, backend, and Docker environment examples
- Docker hybrid mode for PostgreSQL, Redis, and MinIO
- full Docker mode for frontend, backend, PostgreSQL, Redis, and MinIO
- Prisma schema baseline and migration workflow
- Prisma 7 configuration through `prisma.config.ts`
- shared response and error envelope conventions
- backend configuration validation
- correlation IDs and structured request logging
- liveness and PostgreSQL readiness endpoints
- Swagger/OpenAPI setup
- backend unit, integration, contract, security, and e2e Jest projects
- frontend Vitest and Playwright E2E setup
- CI validation split by backend, frontend, E2E, Docker, and audit concerns
- workflow documentation for CI, Docker, database/Prisma, auth, and API

## Remaining Hardening

- production registry/image promotion flow
- production observability and alerting
- backup and restore evidence
- release pipeline connected to a real deployment target

## Exit Criteria

- frontend and backend start locally: Done
- database migration applies cleanly: Done
- typecheck, lint, test, and build commands are documented: Done
- Docker topology is documented and validated: Done

## Related Docs

- [Project Setup](../project-setup.md)
- [Development Workflow](../development-workflow.md)
- [Project Workflow Guides](../workflows/README.md)
- [Validation Matrix](../validation-matrix.md)
- [Deployment](../deployment.md)

# WorkSync Development Workflow

This document describes how to plan, implement, review, validate, and complete work in this repository.

## Instruction Sources

Before engineering work:

1. Read `AGENTS.md`.
2. Read `skills/engineering/execution-order/SKILL.md`.
3. Read `references/worksync/profile.md`.
4. Load only the profile files required by the routed work.

Do not bypass the routed skill pipeline with ad-hoc reasoning.

## Approval Workflow

Use the repository approval workflow:

```text
PLAN
-> REVIEW
-> APPROVAL
-> EXECUTION
-> VALIDATION
-> COMPLETE
```

Routine, reversible, in-scope changes requested by the user do not need a separate approval step.

Approval-gated work includes:

- destructive or difficult-to-reverse operations
- schema or data changes
- production deployment or rollback
- authentication, authorization, secret, or permission changes
- breaking public contracts
- significant architecture, ownership, dependency, or multi-service changes

When approval is required, provide a change plan with objective, proposed actions, affected files or systems, risks, validation plan, rollback/containment/forward-fix plan, alternatives, recommendation, and exact approval needed.

## Planning

For non-trivial work, identify:

- product intent
- affected domain concepts
- affected frontend/backend/API/data surfaces
- security and workspace-isolation risks
- tests and validation evidence
- documentation updates

Use `domain-modeling` when concepts, invariants, ownership, or lifecycle change.

## Implementation Rules

- Keep changes scoped to the requirement.
- Follow existing repository structure.
- Do not introduce new architecture patterns without justification.
- Keep authorization in trusted backend logic.
- Keep business rules reusable across HTTP, realtime, and background jobs.
- Prefer framework-native capabilities when they fit existing patterns.
- Do not weaken typecheck, lint, test, build, or security checks to make work pass.

### TypeScript Configuration Files

- Root-level TypeScript configuration files such as `prisma.config.ts` must be
  included by the TSConfig used in ESLint `parserOptions.project`.
- The repository lint command must name configuration files outside the normal
  source glob so editor and CI behavior remain aligned.
- Generated Prisma Client source is excluded from lint and coverage; regenerate
  it with `pnpm prisma:generate` rather than editing it.

### Prisma 7 and Jest

- Prisma connection URLs belong in `app/backend/prisma.config.ts`, not the
  datasource block in `schema.prisma`.
- Runtime PostgreSQL access uses `@prisma/adapter-pg`; migration history remains
  under `app/backend/prisma/migrations/`.
- Prisma-generated TypeScript uses `.js` import specifiers. Jest maps those
  relative specifiers back to TypeScript sources through `moduleNameMapper`.
- Prisma's query compiler loads WASM through dynamic import, so backend Jest
  scripts run Node with `--experimental-vm-modules`.
- ORM or runtime upgrades must validate Prisma CLI commands, real PostgreSQL
  integration, compiled generated-client output, and runtime startup.

### Windows Dependency Recovery

If `pnpm install` stalls while recreating `node_modules`:

1. Stop repository-owned backend/dev-server Node processes.
2. Confirm no process is running `dist/main.js`, `pnpm ... start`, or the local
   dev server.
3. Rerun `pnpm install --frozen-lockfile`.
4. Do not delete the lockfile or dependency declarations as a workaround.

## Review Expectations

Use the routed review flow:

- `scrutinize` for intent and end-to-end claim checking
- `coding-standards` for implementation hygiene
- `domain-modeling` for business invariants and lifecycle changes
- `architecture-review` for boundary and dependency changes
- `security-review` and `security-testing` for trust boundaries and evidence
- `test-strategy` for validation plan and coverage

Findings should lead. Summaries are secondary.

## Validation Expectations

Run relevant checks for the changed surface:

- typecheck
- lint and formatting checks
- unit tests
- backend integration tests
- API contract tests
- frontend/UI tests
- E2E tests
- security tests
- migration validation
- build
- Docker or Compose validation when affected

If a check cannot run, report why and what remains unverified.

## Documentation Updates

Update documentation when work changes:

- product behavior
- domain rules
- API contracts
- data migrations
- security model
- deployment or operational behavior
- testing expectations

Swagger documentation must be updated when API contracts change.

## Definition of Done

Work is complete only when:

- requirements and acceptance criteria are satisfied
- routed skill exit criteria are satisfied
- relevant profile constraints are satisfied
- review findings are resolved or explicitly accepted
- affected checks pass or limitations are reported
- no temporary debug code, dead code, or unused implementation remains
- documentation is updated where required
- remaining risks are stated

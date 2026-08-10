# WorkSync Development Workflow

This document describes how to plan, implement, review, validate, and complete work in this repository.

For workflow-specific operating details, see
[Project Workflow Guides](workflows/README.md). Keep this document focused on
the general development process; put CI, Docker, database, auth, and API flow
details in the workflow-specific docs.

## Instruction Sources

Before engineering work:

1. Read `references/worksync/profile.md`.
2. Load only the profile files required by the work.
3. Apply any team playbooks or repository-specific instructions available in
   your environment.

Do not rely on ad-hoc reasoning when the repository profile or team process
defines a clearer route.

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

Use domain modeling review when concepts, invariants, ownership, or lifecycle change.

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

### Backend Logs

- Development backend logs use `pino-pretty` when `NODE_ENV=development`.
- Production should keep JSON logs so aggregation systems such as ELK, Grafana
  Loki, or cloud log pipelines can parse structured fields.
- HTTP access logs intentionally include only diagnostic fields such as method,
  URL path, status code, response time, request ID, correlation ID, and user ID
  when available.
- Request headers, response headers, cookies, bearer tokens, passwords,
  password hashes, redirect locations, and provider callback query material must
  not appear in normal access logs.
- Business logs should use stable reason codes and correlation IDs. Do not use
  HTTP access logs as a substitute for domain or security audit events.

## Review Expectations

Use the routed review flow available in your environment:

- intent and end-to-end claim checking before implementation
- implementation hygiene and code-level maintainability review
- frontend and backend domain review when those surfaces change
- domain modeling review for business invariants and lifecycle changes
- architecture review for boundary and dependency changes
- security review and security testing for trust boundaries and evidence
- test strategy review for validation plan and coverage

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

Frontend browser E2E tests and browser-visible verification require the current
Playwright Chromium, Firefox, and WebKit engines. Install them once with
`corepack pnpm playwright:install`; use `corepack pnpm
playwright:install:with-deps` on Linux, containers, or CI-like hosts when system
dependencies are missing. Run `corepack pnpm
test:e2e:frontend:compatibility` after styling-runtime changes.

The workspace recommends Tailwind CSS IntelliSense and opens `.css` files in
Tailwind CSS language mode so Tailwind 4 directives such as `@theme` and
`@custom-variant` are validated by the correct language service. The generic CSS
validator's `unknownAtRules` diagnostic is disabled because it cannot parse
Tailwind directives; Tailwind-specific validation remains enabled. Frontend
lint also fails when a utility has a canonical Tailwind spelling; apply the
suggested canonical class instead of suppressing the diagnostic.

If a check cannot run, report why and what remains unverified.

Every feature, bug fix, or observable behavior change must map its material acceptance criteria to proportionate automated behavioral evidence. Extend existing tests when they already own the behavior; a new test file is not inherently required.

If automated coverage is impractical, document the reason, alternative evidence, unverified behavior, remaining risk, and follow-up owner. Required integration, contract, end-to-end, or security suites that skip mean validation is incomplete.

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
- material acceptance criteria and changed guarantees are mapped to validation evidence
- relevant workflow or review exit criteria are satisfied
- relevant profile constraints are satisfied
- affected implementation received the applicable frontend and/or backend review
- code is locally understandable, maintainable, and no more complex than the requirement justifies
- review findings are resolved or explicitly accepted
- affected checks pass or limitations are reported
- no temporary debug code, dead code, or unused implementation remains
- documentation is updated where required
- remaining risks are stated

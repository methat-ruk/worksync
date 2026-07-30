# Feature Plan: Project Foundation

Status: Completed

Plan review: Approved, implemented, reviewed, and validated on 2026-07-30

Intended PR: `feat/project-foundation`

Milestone: 2 - Projects and Tasks

Impact: Material Change (Tier 2) because this slice adds public API contracts,
persistent project behavior, workspace authorization and tenant-isolation
enforcement, and a browser-visible project workflow.

## Implementation Outcome

Delivered on `feat/project-foundation`:

- workspace-scoped project create, list, read, and update APIs
- explicit project mutation policy for `OWNER`, `ADMIN`, and `MEMBER`, with
  `VIEWER` read-only
- immutable normalized project keys with workspace-local uniqueness
- selected-workspace project list/create UI with bounded pagination and
  loading, empty, error, success, and read-only states
- unit, contract, PostgreSQL integration, security, component, mocked-browser,
  and live-browser coverage
- standalone project API and security documentation
- post-implementation dependency-audit remediation for transitive
  `js-yaml` and `valibot` vulnerabilities

Required validation passed locally. The local shell used Node.js 24 even though
the repository contract requires Node.js 22; CI remains the merge authority for
the supported runtime. The follow-up CI run passed after the minimum patched
transitive versions were applied.

## Goal

Allow workspace members to create, list, read, and update projects inside the
correct workspace boundary, and provide a minimal project list/create workflow
that prepares the product and API contract for Task Foundation.

## Requirement Baseline

The approved planning baseline is:

- workspace is the tenant boundary
- authenticated identity comes from the server-owned auth context
- current PostgreSQL workspace membership is authoritative
- `OWNER`, `ADMIN`, and `MEMBER` can create and update any project in a
  workspace where they are members
- `VIEWER` can read projects but cannot mutate them
- a project key is a stable, user-supplied identifier that cannot be changed
  after creation
- project access by identifier must constrain both project ID and workspace ID
- frontend role visibility is user experience only; backend authorization is
  authoritative

## Acceptance Criteria

- authenticated members can list and read projects in their current workspace
- `OWNER`, `ADMIN`, and `MEMBER` can create projects and update project names
- `VIEWER` receives the stable forbidden contract for create and update
- callers without workspace membership cannot list, read, create, or update
  projects and receive the tenant-hiding workspace not-found contract
- project IDs from another workspace cannot be read or updated and receive the
  project-not-found contract without leaking cross-workspace data
- project keys are normalized, validated, immutable, and unique only within
  their workspace
- project list responses are bounded, paginated, and stably ordered
- public responses expose only the documented project DTO
- the `/app` workspace home shows project loading, empty, error, success,
  pagination, read-only, and create states for the selected workspace
- changing the selected workspace cannot render stale projects from the prior
  workspace
- contract, real-PostgreSQL integration, security, frontend, and browser
  evidence protect the changed guarantees

## Scope

- project create/list/read/update APIs
- a dedicated NestJS projects module, controller, service, DTOs, and pure
  project-action policy
- shared `WorkspaceAuthorizationService` and `WorkspaceActor` consumption
- workspace-scoped Prisma project queries using the existing `Project` model
- stable project response, list, validation, error, and Swagger contracts
- frontend project contract, API client, list/create UI, and error mapping
- project UI embedded in `/app` for the currently selected workspace
- unit, component, contract, integration, security, mocked-browser, and live
  browser evidence
- API, security, roadmap, milestone, and feature-plan documentation closeout

## Out of Scope

- task CRUD, assignment, status transitions, or task UI
- project delete, archive, restore, or templates
- project description or additional schema fields
- changing a project key after creation
- project-specific ownership or per-project membership
- a dedicated `/app/projects` route, global workspace state, or navigation
  architecture change
- project update UI; update is backend-contract only in this slice
- activity logs, realtime events, notifications, files, or background jobs
- Prisma schema, migration, index, feature-driven dependency addition, runtime,
  Docker, CI, deployment, or production-target changes

## Public API Contract

All routes require the existing bearer-token authentication:

| Method | Route | Success |
| --- | --- | --- |
| `POST` | `/api/workspaces/:workspaceId/projects` | `201` project envelope |
| `GET` | `/api/workspaces/:workspaceId/projects` | `200` project list envelope |
| `GET` | `/api/workspaces/:workspaceId/projects/:projectId` | `200` project envelope |
| `PATCH` | `/api/workspaces/:workspaceId/projects/:projectId` | `200` project envelope |

Create accepts:

```json
{
  "name": "WorkSync",
  "key": "WSYNC"
}
```

Update accepts only:

```json
{
  "name": "WorkSync Platform"
}
```

Validation and normalization:

- `name` is trimmed, required after trimming, and limited to 100 characters
- `key` is trimmed, converted to uppercase, and must match
  `^[A-Z][A-Z0-9]{1,9}$`
- the key is therefore 2-10 characters, begins with a letter, and contains
  uppercase ASCII letters and digits only
- unknown fields are rejected by the existing global validation pipe
- `key`, `workspaceId`, `id`, timestamps, relations, and roles cannot be
  assigned through update
- list query uses `page` and `pageSize`; defaults are `1` and `20`, with a
  maximum page of `10,000` and maximum page size of `100`
- list ordering is `updatedAt` descending with `id` ascending as a stable
  tie-breaker

The public project DTO exposes only:

- `id`
- `name`
- `key`
- `createdAt`
- `updatedAt`

It does not expose the workspace relation, tasks, Prisma records, membership,
actor context, or other relations.

Response envelopes follow the repository conventions:

```ts
{
  success: true;
  message?: string;
  data: { project: PublicProjectDto };
}
```

```ts
{
  success: true;
  data: {
    items: PublicProjectDto[];
    page: number;
    pageSize: number;
    total: number;
  };
}
```

Public failure behavior:

- missing or invalid authentication: existing `401` authentication contract
- invalid body, query, unknown field, or attempted protected-field assignment:
  `400 VALIDATION_ERROR`
- proven `VIEWER` attempting create or update:
  `403 AUTHORIZATION_DENIED` with `Not authorized for this project action`
- missing, removed, or cross-workspace membership:
  `404 RESOURCE_NOT_FOUND` with the existing workspace-not-found contract
- missing project or project ID outside the actor's workspace:
  `404 RESOURCE_NOT_FOUND` with `Project not found`
- duplicate normalized key in the same workspace:
  `409 RESOURCE_CONFLICT` with `Project key is already in use`

Swagger must document authentication, role behavior, validation, pagination,
success envelopes, and the applicable error responses.

## Backend and Security Design

`ProjectsModule` imports the existing authentication, Prisma, and workspace
module boundaries. It owns project transport, application behavior, DTOs, and
action policy; it must not duplicate workspace membership lookup or introduce
a generic authorization framework.

Every request follows:

```text
authenticated user
-> WorkspaceAuthorizationService.requireActor(userId, workspaceId, database)
-> explicit project-action policy
-> Prisma query constrained to actor.workspaceId
-> narrow public DTO
```

Rules:

- controller identity always comes from `@CurrentUser()`
- membership identity and role never come from a body, query, or header
- create/update policy allows `OWNER`, `ADMIN`, and `MEMBER`; it denies
  `VIEWER`
- all resolved actors may list and read projects
- create and update resolve the actor inside the same transaction used for the
  mutation and pass that transaction to the workspace resolver
- list resolves the actor and performs count/list queries inside one
  transaction
- read resolves the actor and queries with both project ID and
  `actor.workspaceId`
- project-by-ID update first finds the project using both identifiers, then
  updates only the name inside the active transaction
- project key uniqueness continues to rely on the existing
  `@@unique([workspaceId, key])` constraint; a concurrent duplicate maps to the
  public conflict contract without exposing Prisma details
- the actor is not serialized, cached across requests, or widened with project
  persistence fields

## Frontend Design

Add a feature-owned project contract, API client, error mapping, and
`ProjectSection`. `WorkspaceHome` remains the owner of selected-workspace state
and passes the selected workspace identity, name, and membership role into the
project section.

Behavior:

- no project request runs until a workspace is selected
- selecting another workspace resets project state and loads that workspace's
  first page
- in-flight load or create results from an earlier workspace are aborted or
  ignored
- the list supports the API's page/pageSize contract and load-more behavior
- a successful create prepends the returned project, increments the total
  without duplication, and renders clear success feedback
- failed loads and creates exit pending state and render actionable error
  feedback
- async controls prevent duplicate submission
- the key field normalizes to uppercase and uses the same validation contract
  as the backend
- the create form appears only for `OWNER`, `ADMIN`, and `MEMBER`
- `VIEWER` sees the project list and an explicit read-only explanation
- existing shadcn/ui primitives and semantic design tokens are reused; no new
  UI dependency, primitive rewrite, global style, or redesign is introduced
- the feature remains on `/app`; dedicated project navigation is deferred

## Affected Surfaces

| Surface | Expected change | Disposition |
| --- | --- | --- |
| Product | First usable project list/create workflow | Change in this PR |
| Frontend | Project contract, API client, states, and form | Change in this PR |
| Backend | Projects module, policy, service, controller, DTOs | Change in this PR |
| Public API | Four project endpoints and Swagger schemas | Change in this PR |
| Auth/security | Project RBAC, IDOR/BOLA, workspace isolation | Direct changed guarantee |
| Data | Use existing Project model and unique key | No schema or migration |
| Runtime/CI | Existing commands and jobs only | Confirm unaffected |
| Dependencies | Patch transitive `js-yaml` and `valibot` advisories | Security remediation |
| Documentation | API, security matrix, roadmap, milestone, plan closeout | Change in this PR |
| Tasks and downstream features | Consume stable project contract later | Follow-up only |

## Implementation Steps

1. **Lock contracts and policy**
   - add backend DTO and response shapes for the approved public contract
   - add pure project role-policy tests for every workspace role
   - add key normalization, validation, immutability, pagination, and
     protected-field contract cases

2. **Add the backend project boundary**
   - create and register `ProjectsModule`
   - add authenticated nested project routes
   - implement create/list/read/update using the shared workspace actor
   - keep controllers transport-focused and map Prisma records to public DTOs
   - map duplicate key races and scoped not-found behavior safely

3. **Add real persistence and security evidence**
   - extend the in-memory auth test adapter only for fast framework contract
     and abuse cases
   - add real-PostgreSQL coverage for persistence, uniqueness, ordering,
     pagination, role drift, and cross-workspace scoping
   - add contract and security cases for every route, role, protected field,
     identifier-tampering path, and safe failure shape

4. **Add the frontend workflow**
   - add project Zod schemas and authenticated API client operations
   - implement the selected-workspace project section and create form
   - handle loading, empty, error, success, read-only, stale-request, and
     pagination behavior
   - add component and API-client regression tests

5. **Add browser evidence**
   - extend mocked Playwright coverage for browser-visible UI states,
     duplicate-submit prevention, responsive rendering, and blocking console
     errors
   - add a live Playwright journey for signup, workspace creation, project
     creation, and project listing through the real backend and PostgreSQL

6. **Document the contract**
   - add project API documentation and link it from the API design index
   - replace the draft project role cells in the security model with the
     approved matrix
   - leave Task Foundation, project archive/delete, and future route design as
     explicit follow-up

7. **Apply the post-implementation review gate**
   - review the complete diff for requirement correctness, architecture and
     dependency direction, backend/frontend maintainability, API compatibility,
     web-security baseline, IDOR/BOLA, tenant isolation, validation, public
     error safety, test fidelity, and unrelated scope
   - disposition or fix every blocker and major finding
   - rerun every affected targeted check after a finding fix

8. **Run final validation and close roadmap state**
   - run the authoritative backend, frontend, browser, database, and diff gates
   - confirm required integration and security suites ran rather than skipped
   - only after required evidence passes, move this plan to `completed`, update
     the feature-plan index, Milestone 2, root roadmap, and Task Foundation
     dependency/order
   - inspect the final diff and verify no documentation link points to the old
     planned path

## Validation Contract

| Changed guarantee | Required evidence boundary |
| --- | --- |
| Project role matrix | Pure unit matrix plus framework security tests for every role |
| Workspace membership and tenant isolation | Real PostgreSQL integration plus negative IDOR/BOLA tests |
| Scoped project create/read/update | Real Nest request pipeline and PostgreSQL queries |
| Key normalization and uniqueness | DTO/contract tests plus real PostgreSQL unique-conflict cases |
| Public request/response/error contract | Contract tests through the real Nest validation, guard, filter, and serialization pipeline |
| Pagination and stable ordering | Contract assertions plus representative multi-row PostgreSQL data |
| Frontend loading/empty/error/success/read-only states | Vitest component tests and mocked Playwright browser evidence |
| Stale workspace response prevention | Controlled component/browser request ordering test |
| Full user-visible happy path | Live Playwright with real frontend, backend, auth flow, and PostgreSQL |
| Swagger compatibility | Generated OpenAPI document assertions |

The in-memory Prisma adapter and intercepted browser requests are bounded test
doubles:

- the in-memory adapter provides deterministic framework, validation, error,
  and abuse feedback but does not prove PostgreSQL queries, constraints, or
  transactions
- intercepted browser requests prove user-visible states but do not prove
  frontend/backend integration
- real-PostgreSQL integration and live Playwright evidence are the required
  complementary boundaries

Targeted feedback:

```text
corepack pnpm --filter @worksync/backend test:unit
corepack pnpm --filter @worksync/backend test:contract
corepack pnpm --filter @worksync/backend test:integration
corepack pnpm --filter @worksync/backend test:security
corepack pnpm --filter @worksync/frontend test
corepack pnpm --filter @worksync/frontend test:e2e
corepack pnpm --filter @worksync/frontend test:e2e:live
```

Final authoritative local gates:

```text
corepack pnpm prisma:migrate:status:test
corepack pnpm validate:backend
corepack pnpm validate:frontend
corepack pnpm --filter @worksync/frontend test:e2e
corepack pnpm --filter @worksync/frontend test:e2e:live
corepack pnpm pr:review:evidence
git diff --check
```

GitHub CI remains merge authority for backend validation, frontend validation,
frontend E2E, container image regression, and dependency audit.

Environment prerequisites:

- Node.js 22, as required by the repository engine and `.nvmrc`
- PostgreSQL test database reachable through the test environment's `DATABASE_URL` with all
  committed migrations applied
- Redis available where the complete existing backend suite enables the
  Redis-backed auth limiter
- Chromium installed for Playwright
- ports 3000 and 4000 available for live browser evidence
- no external provider credentials or manual seed data; tests create isolated,
  privacy-safe users, workspaces, memberships, and projects

Docker startup or image evidence is not required locally for the changed
guarantees because this slice does not change runtime topology, Docker,
environment contracts, or artifacts. Existing container CI remains regression
evidence.

## Failure Modes and Stop Conditions

- **A project query can omit workspace scope:** block completion and correct the
  data-access path before continuing.
- **A role can bypass policy through direct API calls:** block completion and
  restore backend enforcement.
- **Outsider or cross-workspace failures reveal resource existence:** block
  completion and restore the safe not-found contract.
- **Key normalization differs between frontend, DTO validation, persistence,
  Swagger, or tests:** stop and reconcile the single public contract.
- **A stale request renders projects from the previously selected workspace:**
  fix request ownership/cancellation before final browser validation.
- **Required PostgreSQL, security, or live browser suites skip or cannot run:**
  validation is incomplete and merge readiness is blocked unless the
  applicable risk owner explicitly accepts it.
- **Implementation requires schema/index migration, a dependency, generic
  authorization framework, global workspace state, dedicated project route,
  runtime/CI change, or broader role/key behavior:** stop and re-plan.

## Rollback and Forward Fix

No schema, migration, backfill, runtime, or production deployment change is
planned. The follow-up dependency-audit remediation is reversible by restoring
the prior overrides and lockfile, but doing so reintroduces the known
vulnerabilities. Before external consumers depend on the endpoints, the feature
slice is reversible by removing the projects module registration, project
API/UI, and associated documentation.

After the public API has consumers, prefer a forward fix that preserves method,
path, envelope, key, and authorization contracts. If tenant isolation is found
unsafe, contain by reverting or disabling the additive project route/module
until the scoped queries are corrected. Do not weaken role or not-found
behavior to keep the feature available.

## Alternatives Considered

### Backend-only Project Foundation

Rejected for this approved slice. It is smaller but does not deliver the
selected list/create user workflow or the Milestone 2 browser evidence.

### Dedicated `/app/projects` route and global workspace state

Rejected for this PR. It introduces a new navigation and shared-state
architecture before Task Foundation proves the route requirements. Embedding a
feature-owned project section in the existing workspace home is smaller and
reversible.

### Backend-generated or mutable project key

Rejected. The approved contract uses a user-supplied, normalized, immutable key
to provide a stable identifier for future project/task work.

### Duplicate membership lookup or generic policy framework

Rejected. The completed workspace authorization boundary already owns current
membership resolution, while resource-specific action policy belongs in the
projects module.

## Assumptions and Remaining Risk

Assumptions:

- there is no supported pre-existing project API or frontend consumer to
  migrate
- existing project rows, if any in local development data, are not a production
  compatibility boundary
- project name is the only mutable project field required before Task
  Foundation
- all non-viewer workspace members may update any project because the current
  data model has no project owner or project-specific role
- workspace membership is checked at the operation's authorization point; this
  slice does not introduce stronger instantaneous cancellation semantics

Remaining risk:

- membership can be revoked concurrently after an authorization check has
  succeeded; this is the existing authorization timing model and is not widened
  by caching
- the existing workspace-only project index may require a composite ordering
  index if representative measurements later show material list latency;
  adding one requires a separate migration-backed decision
- a dedicated project route or shared workspace state may become valuable when
  Task Foundation adds deeper navigation; that decision remains deferred until
  the journey is known

Revisit this plan if the role matrix, project key semantics, mutable fields,
route design, data volume, authorization timing requirement, or Task Foundation
dependency changes materially.

## Plan Review

Review verdict: **Implemented with no remaining blocking findings**

Blocking findings: none after resolving the decision-changing open questions.

Resolved findings:

- finalized project mutation authority for `OWNER`, `ADMIN`, and `MEMBER`, with
  `VIEWER` read-only
- made project read authority and cross-workspace not-found behavior explicit
- replaced optional frontend scope with a concrete list/create workflow
- selected the smallest frontend boundary without adding global state or a new
  route
- made project key normalization, format, immutability, and workspace-local
  uniqueness explicit
- constrained update to project name and rejected protected-field assignment
- required every project-by-ID query to include the actor's workspace ID
- separated fast test doubles from real PostgreSQL and live browser evidence
- added stale-workspace request handling and duplicate-submit protection
- made the Task Foundation link stable across the planned-to-completed move
- placed post-implementation review and findings fixes before final validation
- added failure stop conditions for schema, dependency, architecture,
  authorization, runtime, or contract expansion
- added roadmap closeout only after required implementation evidence passes

Non-blocking concerns:

- project list performance has no current measured budget; pagination and the
  existing workspace index are proportionate for the foundation slice, with an
  explicit measurement-driven migration revisit trigger
- exact local component names may change for readability, but ownership,
  behavior, contracts, and evidence boundaries are approval-bound

Approval outcome:

- the reviewed plan was approved before implementation
- implementation stayed within the approved API, role, key, UI, evidence, and
  stop-condition boundaries
- post-implementation review tightened the mutation allowlist and associated
  frontend validation errors with their fields
- pre-commit review bounded the page number, added ADMIN HTTP policy evidence,
  cleaned PostgreSQL integration fixtures, covered frontend failure recovery,
  and made live browser evidence re-read the persisted project before final
  validation
- a separately approved follow-up patched transitive `js-yaml` to `5.2.2` and
  `valibot` to `1.4.2`; production dependency audit and CI passed
- PR review added terminal-page reconciliation for offset pagination when
  concurrent project updates reorder results

## Done Criteria

- all four project routes implement the reviewed contracts
- project membership, role policy, and resource scoping cannot be bypassed
- key normalization, immutability, and workspace-local uniqueness are enforced
- the selected-workspace project list/create UI covers all required states
- unit, contract, real-PostgreSQL integration, security, component, mocked
  browser, live browser, typecheck, lint, build, Swagger, and diff evidence pass
- required suites do not skip and post-review findings are resolved
- no schema, migration, feature dependency, runtime, CI, Docker, deployment,
  task, realtime, job, notification, file, or activity work enters the PR;
  dependency changes are limited to the audited transitive security patches
  recorded above
- roadmap, Milestone 2, feature-plan index, completed plan, and Task Foundation
  agree that Project Foundation is complete and Task Foundation is next

## Dependencies

- workspace foundation
- workspace membership and RBAC
- [workspace authorization boundary](../completed/workspace-authorization-boundary.md)

## Follow-up

- [Task Foundation](../planned/task-foundation.md)
- project archive/delete lifecycle when product behavior is approved
- dedicated project navigation/shared workspace state when project/task
  journeys justify it

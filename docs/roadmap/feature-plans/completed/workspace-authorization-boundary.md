# Feature Plan: Workspace Authorization Boundary

Status: Completed

Plan review: Implemented, reviewed, and validated on 2026-07-24

Intended PR: `refactor/workspace-authorization-boundary`

Milestone: Repository Health Remediation

Impact: Material Change (Tier 2) because this PR establishes a reusable
authorization and tenant-isolation boundary for future workspace-scoped
resources.

## Implementation Outcome

- added and exported `WorkspaceAuthorizationService` with the immutable
  `WorkspaceActor` projection
- adopted the boundary in all four workspace membership-management paths while
  preserving each active Prisma transaction
- retained action-specific RBAC policy and a separate private target-member
  projection
- preserved workspace list/read queries and all public API contracts
- documented the downstream consumer and workspace-resource scoping rules
- verified the boundary with unit, Nest DI, contract, security, and real
  PostgreSQL integration evidence
- passed the full backend validation gate: Prisma validation/generation,
  typecheck, lint, 166 tests across 27 suites, build, and artifact validation

## Objective

Expose one narrow, tested backend boundary that resolves the authenticated
user's current workspace membership into an internal trusted actor context.
Existing workspace and membership-management behavior must remain unchanged,
and Project Foundation must be able to consume the boundary without duplicating
membership queries or introducing a second actor representation.

## Requirement Baseline

The approved behavior baseline is:

- workspace is the tenant boundary
- authenticated identity comes from the server-owned auth context
- membership is authoritative in PostgreSQL
- missing workspace membership uses the same public `404 RESOURCE_NOT_FOUND`
  behavior as a missing workspace when a distinction could leak tenant
  existence
- action-specific role denial after membership is proven uses
  `403 AUTHORIZATION_DENIED`
- workspace membership-management role rules remain owned by
  `workspace-rbac.policy.ts`
- project and later resource services must enforce their own action policy and
  scope resource queries to the actor's workspace

This is a behavior-preserving extraction for existing endpoints. It does not
authorize a public API, schema, role-matrix, frontend, or runtime change.

## Repository Baseline

Current repository evidence shows:

- `WorkspacesService.requireWorkspaceMembership(...)` is a private helper used
  by list-members, add-member, update-member, and remove-member operations
- those operations already pass the active Prisma transaction to the helper
- workspace list and read operations enforce membership directly in their
  scoped workspace queries and do not need a separate actor lookup
- `WorkspaceMember` has an authoritative
  `@@unique([workspaceId, userId])` constraint
- role decisions are already separated into pure functions in
  `workspace-rbac.policy.ts`
- `WorkspacesModule` is the current owner of workspace services and already
  exports `WorkspacesService`
- contract, PostgreSQL integration, security, and unit suites already protect
  substantial workspace behavior, but there is no direct reusable-boundary
  evidence

## Acceptance Criteria

- one `WorkspaceAuthorizationService` owned by `WorkspacesModule` resolves a
  `WorkspaceActor` from authenticated `userId` and `workspaceId`
- `WorkspaceActor` is an internal immutable projection containing only
  `workspaceId`, `userId`, and `role`
- the resolver reads current membership through the existing composite
  workspace/user identity and returns no Prisma entity or unrelated member data
- callers can use the default Prisma service or supply the active
  `Prisma.TransactionClient`, preserving the transaction boundary of existing
  membership-management operations
- absent, removed, or cross-workspace membership fails closed with the existing
  safe `404 RESOURCE_NOT_FOUND` workspace-not-found contract
- the resolver proves membership only; action policy remains explicit in the
  consuming resource or use-case layer
- target-member lookup remains a separate private projection containing the
  target membership identifier, user identifier, and role; it must not reuse or
  widen `WorkspaceActor`
- list-members, add-member, update-member, and remove-member operations consume
  the shared resolver without changing their response envelopes, status codes,
  transaction ownership, or role rules
- workspace list and read retain their existing single scoped queries rather
  than adding redundant actor lookups
- `WorkspacesModule` exports the resolver for Project Foundation without
  exporting a generic policy engine or persistence model
- a minimal downstream test module can import `WorkspacesModule` and inject the
  exported resolver, proving the Nest module boundary rather than relying on
  static inspection alone
- active membership, persisted role changes, removed membership, forged or
  cross-workspace identifiers, and current public error behavior have mapped
  automated evidence

## Trusted Actor Contract

The planned internal contract is equivalent to:

```ts
export type WorkspaceActor = Readonly<{
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}>;
```

The planned resolver shape is equivalent to:

```ts
requireActor(
  userId: string,
  workspaceId: string,
  database?: PrismaService | Prisma.TransactionClient
): Promise<WorkspaceActor>;
```

Exact names may receive a local naming correction during implementation, but
changing ownership, fields, failure semantics, or transaction behavior
requires plan review.

Consumer rules:

- `userId` must come from authenticated server context, never a request body,
  query, or client-asserted role
- the returned actor is internal authorization context and must not be
  serialized as an API response
- consumers must still apply action-specific policy
- resource access by project, task, comment, file, event, or job identifier
  must also constrain the resource query to `actor.workspaceId`
- consumers must not cache the actor across requests; current persisted
  membership and role are authoritative
- this slice preserves the current application-layer safe not-found exception;
  any future job, realtime, or other non-HTTP adapter remains responsible for
  translating that failure without weakening or exposing the boundary

## Scope

- add the minimal reusable workspace actor type and authorization resolver
- register and export the resolver from `WorkspacesModule`
- inject the resolver into `WorkspacesService`
- replace the private membership helper only in the four
  membership-management paths that already require an actor
- preserve the active Prisma transaction when those paths resolve membership
- replace the shared private `WorkspaceActorMembership` shape with the exported
  actor context and a separate private target-member projection, then remove
  the superseded private actor helper
- update the in-memory Prisma test adapter if the resolver uses the existing
  composite unique membership lookup
- add focused unit, real-PostgreSQL integration, security, and contract
  regression evidence
- document boundary ownership and downstream consumer rules
- update Project Foundation planning assumptions to consume this exact internal
  boundary

## Non-Goals

- project or task routes, DTOs, persistence, policies, or UI
- a controller guard, parameter decorator, middleware-owned actor, or
  request-scoped actor cache
- job-, realtime-, or transport-specific error translation and retry behavior
- a generic authorization framework, policy DSL, or permission registry
- moving workspace membership-management role rules into the resolver
- changing role values or finalizing project/task/comment/file permissions
- changing endpoint paths, request or response DTOs, Swagger schemas, status
  codes, or public error messages
- changing Prisma schema, migrations, indexes, seed data, dependencies,
  environment variables, Docker, CI, or deployment behavior
- solving concurrent revocation after an authorization check has already
  succeeded; this PR preserves the existing per-operation authorization timing

## Affected Surfaces

| Surface | Expected change | Disposition |
| --- | --- | --- |
| Product/frontend | No user-visible or browser behavior change | Confirm unaffected; no browser evidence |
| Backend module | Add and export the workspace authorization resolver | Change in this PR |
| Backend workspace service | Adopt resolver in four member-management paths | Change in this PR |
| Membership policy | No role-rule change | Preserve and rerun unit/security evidence |
| API contract | No path, DTO, status, error, or Swagger change | Contract regression only |
| Auth | Continue receiving identity through `@CurrentUser()` and `AuthGuard` | Confirm unaffected |
| Security/tenant isolation | Centralize membership proof and safe failure | Direct changed guarantee |
| Data/schema | Reuse current `WorkspaceMember` composite unique key; no schema change | Real PostgreSQL evidence |
| Runtime/CI/dependencies | No configuration or dependency change | Existing backend CI remains authoritative |
| Documentation | Name owner and consumer contract | Update in this PR |
| Project Foundation | Consume exported actor boundary later | Update plan only; no project code |

## Impact Map

### Direct

- `app/backend/src/workspaces/workspace-authorization.service.ts`: new owner of
  membership resolution and internal actor projection
- `app/backend/src/workspaces/workspaces.module.ts`: provider and export wiring
- `app/backend/src/workspaces/workspaces.service.ts`: remove private resolver
  and delegate affected operations
- workspace unit, integration, contract, and security suites: evidence for the
  extracted boundary and preserved behavior

### Coupled

- `app/backend/test/helpers/auth-test-app.ts`: in-memory Prisma behavior may
  need the composite `workspaceId_userId` lookup used by production code
- `docs/roadmap/feature-plans/planned/project-foundation.md`: must name the
  shared boundary rather than permitting a project-owned membership lookup

### Adjacent but Unchanged

- `AuthGuard`, `@CurrentUser()`, and `PublicUser`: continue to establish
  authenticated identity before workspace authorization
- workspace list/read query behavior: remains directly workspace-scoped and
  avoids an additional query
- workspace RBAC policy: remains the action-decision owner
- frontend workspace selection and membership UI: public behavior is unchanged

### Operational

- backend CI with PostgreSQL is required because mock-only evidence cannot
  prove membership lookup and removal behavior
- no migration, generated client, Docker image, browser, deployment, or
  observation handoff is triggered by this slice

### Expected File Boundary

Expected production and wiring changes:

- `app/backend/src/workspaces/workspace-authorization.service.ts` (new)
- `app/backend/src/workspaces/workspaces.module.ts`
- `app/backend/src/workspaces/workspaces.service.ts`

Expected evidence and adapter changes:

- `app/backend/test/unit/workspace-authorization.service.spec.ts` (new)
- `app/backend/test/unit/workspaces.service.spec.ts`
- `app/backend/test/helpers/auth-test-app.ts`
- `app/backend/test/integration/workspaces.integration.spec.ts`
- `app/backend/test/security/workspaces.security.spec.ts`
- `app/backend/test/contract/workspaces.contract.spec.ts`

Expected documentation changes:

- `docs/api-design/authorization-boundaries.md`
- `docs/roadmap/feature-plans/planned/project-foundation.md`
- `docs/roadmap/feature-plans/README.md` at successful closeout
- `docs/roadmap/milestone-1-identity-workspace.md` at successful closeout
- `docs/roadmap.md` at successful closeout
- `docs/roadmap/feature-plans/completed/workspace-pagination-and-selection.md`
  to reconcile its next-work link at successful closeout
- move this plan to
  `docs/roadmap/feature-plans/completed/workspace-authorization-boundary.md`
  only after required implementation evidence passes

`workspaces.controller.ts`, workspace DTOs, `workspace-rbac.policy.ts`, Prisma
schema/migrations, frontend code, runtime configuration, dependencies, and CI
are review boundaries but are not expected implementation edits.

## Implementation Steps

1. **Lock the internal contract with focused tests**
   - add resolver unit cases for active membership, selected fields, safe
     missing-membership failure, and use of a supplied transaction client
   - add `WorkspacesService` unit evidence that each of list-members,
     add-member, update-member, and remove-member passes its active transaction
     object to the resolver
   - keep policy tests separate so the resolver cannot become an implicit role
     engine

2. **Introduce the reusable boundary**
   - add `WorkspaceAuthorizationService` and the internal `WorkspaceActor`
     projection under the workspace module
   - query membership by the existing workspace/user composite identity
   - map the persistence result into the narrow actor type
   - return the existing safe workspace-not-found error when no membership is
     present

3. **Wire module ownership**
   - register and export the resolver from `WorkspacesModule`
   - compile a minimal test consumer that imports `WorkspacesModule` and
     injects the resolver, so missing or incorrect Nest exports fail before
     Project Foundation
   - keep existing `WorkspacesService` exports and public controller wiring
     stable

4. **Adopt the boundary without broadening policy**
   - inject the resolver into `WorkspacesService`
   - replace private membership resolution in list-members, add-member,
     update-member, and remove-member
   - pass each operation's existing transaction client to the resolver
   - replace the old shared actor/target type with a private target-member
     projection for `findWorkspaceMember(...)`
   - delete the superseded private actor helper
   - leave workspace list/read as their current single tenant-scoped queries

5. **Align test infrastructure and regression evidence**
   - update the in-memory Prisma adapter only as required to model the
     production composite membership lookup
   - add real PostgreSQL evidence for active resolution, role changes being
     observed on later requests, and removed membership failing closed
   - extend security evidence for outsider/nonexistent workspace identifiers,
     cross-workspace target identifiers, demoted actors, and removed actors
   - add explicit membership-management contract assertions for the safe
     `404 Workspace not found`/`RESOURCE_NOT_FOUND` and proven-member
     `403 AUTHORIZATION_DENIED` behavior, then preserve the remaining response
     envelopes and Swagger evidence

6. **Document ownership and downstream use**
   - update `docs/api-design/authorization-boundaries.md` with the internal
     boundary owner and consumer rules
   - update Project Foundation's plan to consume
     `WorkspaceAuthorizationService`/`WorkspaceActor`
   - change `docs/security-model.md` or workspace API documentation only if
     implementation reveals a real contract or ownership statement that is not
     already covered

7. **Apply the post-implementation review gate**
   - review the complete working-tree diff for refactor safety, backend module
     ownership, transaction preservation, public-contract equivalence, IDOR/
     BOLA and tenant-isolation attack paths, test-adapter fidelity, and
     downstream usability
   - fix in-scope findings, re-review materially changed portions, and re-plan
     before any schema, public-contract, role-model, generic-framework, or
     cross-module expansion

8. **Run final validation on the reviewed result**
   - run focused unit feedback during implementation
   - after review fixes, run the complete required backend evidence listed
     below
   - inspect the final diff and report passed, failed, skipped, and unavailable
     evidence separately

9. **Close roadmap state after required evidence passes**
   - move this feature plan from `planned/` to `completed/`, set its status and
     evidence summary to the actual delivered result, and preserve remaining
     risk
   - update the feature-plan index, Milestone 1, and root roadmap so Project
     Foundation becomes the next planned slice
   - update Project Foundation and the completed pagination summary so no link
     still points at the old planned path
   - review the documentation-only closeout diff, run link/path inspection and
     `git diff --check`, and do not invalidate already-passed runtime evidence
     unless closeout changes executable content

## Validation Contract

| Changed or preserved guarantee | Required evidence | Failure detected |
| --- | --- | --- |
| Resolver returns only current trusted membership context | Focused resolver unit tests and typecheck | Wrong actor shape, unbounded select, wrong user/workspace mapping |
| Existing transactions remain authoritative | Resolver unit test with a supplied transaction, per-method `WorkspacesService` transaction-forwarding assertions, and membership integration flow | Any affected operation performs actor lookup through the root client or a different transaction |
| Missing/cross-workspace/removed membership fails with safe `404` | Unit error assertion, real PostgreSQL integration, security tests | Tenant existence leakage or stale membership acceptance |
| Role policy stays separate and current persisted role is used | Existing policy unit tests plus demotion regression | Resolver becoming policy engine or stale privilege |
| Actor and target membership remain distinct concepts | Typecheck, focused service unit tests, and code review | Exported actor widens with target identity or target lookup loses required identity |
| Existing membership APIs retain behavior | Explicit workspace membership `404`/`403` contract assertions plus the full contract and security suites | Status, envelope, message, error-code, or RBAC regression |
| Workspace list/read isolation remains intact | Existing integration and security suites | Cross-workspace list/read exposure |
| Downstream module can consume one boundary | Minimal Nest consumer-module compile test, typecheck, and Project Foundation plan review | Missing export, duplicate lookup, or second actor representation |
| No unrelated API/schema/runtime change | Diff review, Prisma validation, backend build | Hidden contract, schema, generated artifact, or runtime drift |
| Roadmap state closes without stale planned links | Planned-path search, relative-link inspection, diff hygiene | Completed work remains marked next or linked through removed path |

## Required Commands and Environment

Fast feedback:

```text
corepack pnpm --filter @worksync/backend test:unit
corepack pnpm --filter @worksync/backend typecheck
corepack pnpm --filter @worksync/backend lint
```

Required behavioral evidence:

```text
corepack pnpm --filter @worksync/backend test:contract
corepack pnpm --filter @worksync/backend test:integration
corepack pnpm --filter @worksync/backend test:security
```

Final authoritative local gate:

```text
corepack pnpm validate:backend
git diff --check
```

Environment prerequisites:

- PostgreSQL test service reachable through the repository's Compose topology
- `TEST_DATABASE_URL` set to the test database; the documented local default is
  `postgresql://worksync:worksync@localhost:5433/worksync_test?schema=public`
- current migrations applied to the test database before integration evidence
- Redis available for the complete backend gate where existing auth/rate-limit
  tests require it
- no external credentials, browser setup, or manual seed data; tests create and
  clean up their own users, workspaces, and memberships
- integration and security output must be checked to ensure required suites ran
  rather than skipped

GitHub CI remains the merge authority for the same backend gate with PostgreSQL
and Redis services. Frontend browser, Docker image, deployment, and target
observation evidence are not required because those boundaries do not change.

## Failure Modes and Stop Conditions

- **Resolver leaks Prisma records or extra member data:** narrow the projection
  before continuing.
- **Existing endpoints change `404`/`403` behavior or response envelopes:**
  treat as a regression and restore the approved public contract.
- **A consumer can resolve one workspace and query a resource from another:**
  block completion; the consumer contract or resource query is unsafe.
- **Membership lookup escapes the caller's transaction:** fix transaction
  propagation before final validation.
- **Implementation requires schema/index changes, a new dependency, request
  mutation, role-matrix changes, or a generic policy layer:** stop and re-plan.
- **Required PostgreSQL integration or security suites skip or cannot run:**
  validation is incomplete and merge readiness is blocked unless the
  applicable risk owner explicitly accepts it.
- **Concurrent removal after a successful authorization check becomes a stated
  immediate-revocation requirement:** stop and re-plan transaction/locking
  semantics rather than silently expanding this refactor.

## Rollback and Forward Fix

No schema, data migration, public contract, environment, or deployment change is
planned. The implementation is reversible by restoring the private membership
helper and removing the new provider/export.

If only one consuming path is incorrect, forward-fix that path while preserving
the shared resolver and its tested contract. If the actor contract or ownership
is wrong for Project Foundation, revert the extraction and re-plan rather than
adding compatibility aliases, a second actor type, or weaker authorization.

## Alternatives Considered

### Keep the private helper and duplicate it in Project Foundation

Rejected. It has the smallest immediate diff but creates competing membership
queries and authorization semantics at the first downstream resource.

### Add a controller guard or parameter decorator that attaches an actor

Rejected. It centralizes HTTP behavior but can be bypassed by internal
services, jobs, realtime handlers, or future non-HTTP entry points and risks
mixing transport with action policy.

### Extract a generic authorization framework or policy DSL

Rejected. Current evidence requires one workspace membership boundary, not a
new platform. It would increase review surface and obscure resource-specific
policy.

### Require every workspace read to call the resolver first

Rejected. Existing workspace list/read queries already enforce tenant scope
while materializing the requested data. A separate resolver call would add
query cost and a second consistency seam without strengthening those paths.

### Recommended: narrow injectable resolver plus explicit resource policy

Selected because backend application services can reuse it without binding
membership proof to a controller, it preserves transaction participation,
keeps role policy explicit, and is reversible without schema or public-contract
changes. Transport-specific failure translation remains outside this slice.

## Assumptions and Remaining Risk

Assumptions:

- authenticated callers continue to supply `userId` from `@CurrentUser()` or an
  equivalently trusted server context
- membership rows remain the PostgreSQL source of truth
- authorization is evaluated at the operation's membership-check point, as it
  is today
- Project Foundation needs membership identity, workspace identity, and role,
  but no additional workspace fields

Remaining risk:

- a membership can be revoked concurrently after a request has successfully
  checked authorization; this PR neither adds caching nor worsens that existing
  timing window, but it does not provide instantaneous cancellation
- the boundary is safe only when downstream resource queries also constrain
  resource ownership to `actor.workspaceId`; documentation, review, and Project
  Foundation tests must enforce this consumer rule
- local real-store evidence depends on the documented PostgreSQL prerequisite;
  CI must provide authoritative evidence if the local service is unavailable

Confidence: high. Real-PostgreSQL, contract, security, transaction-propagation,
and full backend validation evidence passed on the implemented result.

## Plan Review

Review verdict: **Ready for approval**

Blocking findings: none after revision.

Resolved plan findings:

- narrowed adoption to membership-management paths instead of adding redundant
  membership queries to workspace list/read
- removed unused membership-row identity from the actor contract so persistence
  identity does not become a downstream dependency
- made transaction-client propagation an explicit contract and test
- added per-method transaction-forwarding evidence for all four affected
  membership-management operations
- separated the exported actor context from the private target-member
  projection that still requires membership identity
- separated membership proof from action policy and downstream resource scope
- added real PostgreSQL evidence for removal and role drift rather than relying
  on the in-memory test adapter
- added a downstream Nest consumer-module compile test so provider export is
  executable evidence rather than inspection only
- made membership-management `404`/`403` error-contract assertions required
  rather than conditional
- made safe `404` versus proven-member `403` behavior explicit
- added a stop condition for schema, public API, role-model, dependency, or
  generic-framework expansion
- documented the existing concurrent-revocation timing window as residual risk
  rather than silently claiming stronger revocation semantics
- added post-validation roadmap closeout and stale-link reconciliation without
  rerunning unaffected runtime evidence

Non-blocking concern:

- the exact actor/service symbol names may need a small local naming adjustment
  during implementation; fields, ownership, failure behavior, and transaction
  semantics are approval-bound.

Approval requested:

- approve this reviewed plan and the
  `WorkspaceAuthorizationService`/`WorkspaceActor` internal contract for
  implementation on `refactor/workspace-authorization-boundary`

## Done Criteria

- the reviewed internal actor contract is implemented and exported by
  `WorkspacesModule`
- all four membership-management paths use it within their existing
  transactions
- existing workspace and membership public behavior remains unchanged
- role policy remains explicit and separate
- unit, contract, real PostgreSQL integration, security, typecheck, lint, build,
  Prisma, and artifact evidence pass on the reviewed result
- required suites do not skip
- the post-implementation review has no unresolved blocking finding
- documentation names the owner and downstream consumer rules
- Project Foundation can consume the boundary without a duplicate membership
  lookup or second actor type
- the completed plan, feature-plan index, Milestone 1, root roadmap, Project
  Foundation dependency, and prior pagination follow-up agree that Workspace
  Authorization Boundary is complete and Project Foundation is next
- no documentation link points to the removed planned feature path
- no schema, migration, dependency, frontend, runtime, CI, or deployment change
  enters the PR

## Dependencies

- completed workspace foundation
- completed workspace membership and RBAC

Sequencing context, not implementation dependencies:

- workspace pagination and selection is complete
- the CI optimization PR is merged

## Follow-up

- [Project Foundation](../planned/project-foundation.md) consumes this boundary
  and owns project-specific action policy and project-resource workspace
  scoping

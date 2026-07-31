# Feature Plan: Task Foundation and Frontend Consistency

Status: Completed

Plan Version: 3

Intended PR: `feat/task-foundation`

Milestone: 2 - Projects and Tasks

Impact: Material Change (Tier 2)

Implementation completed: 2026-07-31

## Implementation Outcome

- delivered workspace/project-scoped task APIs, fixed lifecycle transitions,
  task assignment and due dates, bounded filters, and assignee search
- enforced backend task RBAC, safe tenant isolation, and atomic member
  removal/task unassignment under concurrent assignment
- delivered the `/app` task list, create/edit/status workflow, viewer read-only
  state, accessible debounced assignee auto-search, and task-list pagination
  reconciliation
- required task due dates to include an explicit timezone at the API boundary
- removed the redundant generic authentication-error heading
- centralized primary, destructive, success, and warning colors in semantic
  tokens and shared component variants
- bounded mocked and live Playwright startup and teardown, with verified service
  cleanup instead of leaving ports `3000` and `4000` listening
- added and passed unit, contract, integration, security, component, mocked
  browser, live browser, migration, build, lint, and typecheck evidence

## Summary

Deliver the first complete task workflow inside the existing selected-workspace
and project experience. Authorized workspace members can create, read, update,
assign, filter, and transition tasks without crossing workspace boundaries.

The same PR also resolves two existing frontend consistency issues:

- authentication errors show the useful specific message without a redundant
  generic heading
- action and status colors come from shared semantic tokens and component
  variants rather than page-level Tailwind color overrides

The combined scope is an explicit product decision. Review and validation must
still treat Task Foundation, authentication feedback, and the shared design
system as separate concern groups.

## Objective

Allow authorized workspace members to manage task work within a project while
preserving the existing workspace tenant boundary, predictable API contracts,
accessible frontend states, and one shared visual language.

## Acceptance Criteria

- `OWNER`, `ADMIN`, and `MEMBER` can create and update tasks in a visible
  project; `VIEWER` remains read-only
- every task request proves workspace membership and scopes the project and
  task to that workspace
- creator identity always comes from the authenticated actor
- an assignee must be a current member of the task's workspace
- task description, assignee, and due date can be set and cleared
- task list results are paginated, bounded, stable, and filterable by status or
  assignee
- only approved task status transitions succeed; invalid, repeated, or stale
  transitions return a stable conflict response
- canceling a task requires explicit confirmation that the terminal status
  cannot be reopened; dismissing the confirmation leaves the task unchanged
- a removed workspace member is unassigned from tasks in the same transaction
  as membership removal
- the `/app` workflow lets users select a project and list, create, edit,
  assign, filter, and transition tasks
- workspace or project changes cannot allow stale task or assignee responses to
  overwrite the new selection
- the assignee picker loads bounded initial candidates and automatically
  searches after input settles without issuing requests during IME composition
- login displays `Invalid email or password.` without also displaying
  `We couldn't complete that request`
- shared authentication errors on login and signup render only their specific
  mapped message; purposeful recovery and OAuth headings remain
- button and status colors use shared semantic tokens and variants in both
  themes; pages do not define their own action colors
- required unit, integration, contract, security, component, browser, and live
  boundary evidence passes rather than skips

## Approved Product and Scope Decisions

- all three requested workstreams remain in one PR on
  `feat/task-foundation`
- Task Foundation includes a complete task workflow on the existing `/app`
  route; it does not introduce a dedicated project or task route
- task statuses are fixed for this MVP slice:
  `BACKLOG`, `IN_PROGRESS`, `DONE`, and `CANCELED`
- `OWNER`, `ADMIN`, and `MEMBER` may create, edit, assign, and transition tasks
- `VIEWER` may read and filter tasks but may not mutate them
- `DONE` may reopen to `IN_PROGRESS`
- `CANCELED` is terminal
- transitioning to `CANCELED` requires an accessible confirmation dialog that
  explains the terminal consequence
- task deletion is not part of this slice; cancellation represents the
  non-destructive lifecycle outcome
- assignment UI uses a task-specific, minimal workspace-member search contract
  rather than widening the administrative member-list API
- light and dark themes use the same solid action colors; semantic soft
  surfaces may use token opacity

## Assumptions

- the existing Project Foundation contract and workspace authorization service
  remain the source of truth for project visibility and actor resolution
- the current nullable task description and assignee fields contain no data
  that requires backfill
- existing task records receive `dueDate = null`
- there is no approved task hard-delete, archive, configurable-status, or
  project-specific permission policy
- all active workspace members are valid assignee candidates regardless of
  workspace role
- a former assignee may remain the historical creator of a task but must not
  remain its current assignee
- current frontend architecture continues to own selected workspace state in
  `WorkspaceHome` and project state in the projects feature
- the working tree already contains user changes in `globals.css` and
  `page.tsx`; implementation must preserve their visual intent while replacing
  raw page-level action colors with the reviewed shared-token design
- no production deployment, traffic change, or live database migration is
  authorized by this plan

## Non-Goals

- task hard delete or archive
- comments, mentions, notifications, or file attachments
- activity logs or realtime task events
- configurable or project-specific workflow statuses
- custom project-level task permissions
- a dedicated `/app/projects/:projectId` or task-detail route
- task dependencies, subtasks, estimates, priority, labels, reminders, or
  recurring tasks
- email exposure through task or assignee-search DTOs
- a new state-management library, UI framework, or custom button primitive
- production deployment, branch push, pull-request creation, or merge

## Domain and Lifecycle Contract

### Task Values

- `title`: trimmed, required, 1-200 characters
- `description`: optional, at most 5,000 characters; `null` clears it
- `assigneeId`: optional workspace-member user ID; `null` unassigns
- `dueDate`: optional ISO date-time; `null` clears it
- `creator`: immutable authenticated actor
- `project`: immutable after task creation
- `status`: changed only through the status-transition command

### Status Transitions

```text
BACKLOG -> IN_PROGRESS
BACKLOG -> CANCELED
IN_PROGRESS -> DONE
IN_PROGRESS -> CANCELED
DONE -> IN_PROGRESS
```

The following are invalid:

- transition to the current status
- `BACKLOG -> DONE`
- any transition out of `CANCELED`
- any transition not present in the approved table

Invalid or concurrently stale transitions return HTTP `409` with error code
`INVALID_TASK_TRANSITION`.

### Role Matrix

| Capability | OWNER | ADMIN | MEMBER | VIEWER |
| --- | ---: | ---: | ---: | ---: |
| List/read tasks | yes | yes | yes | yes |
| Search assignee candidates | yes | yes | yes | yes |
| Create task | yes | yes | yes | no |
| Update task details | yes | yes | yes | no |
| Assign or unassign task | yes | yes | yes | no |
| Transition task status | yes | yes | yes | no |

## Public API Contract

All routes require an active access token and use the existing `/api` prefix and
response envelope.

### Create Task

`POST /api/workspaces/:workspaceId/projects/:projectId/tasks`

Request:

```json
{
  "title": "Document task workflow",
  "description": "Write the reviewed lifecycle rules.",
  "assigneeId": "cm-assignee",
  "dueDate": "2026-08-07T10:00:00.000Z"
}
```

Rules:

- status is always created as `BACKLOG`
- creator is always the authenticated user
- `projectId`, `creatorId`, `status`, timestamps, relations, and unknown fields
  are rejected
- omitted optional fields are stored as `null`

Success: `201` with a public task envelope.

### List Tasks

`GET /api/workspaces/:workspaceId/projects/:projectId/tasks`

Query:

- `page`: default `1`, range `1-10,000`
- `pageSize`: default `20`, range `1-100`
- `status`: one optional `TaskStatus`
- `assigneeId`: one optional assignee user ID
- `unassigned`: optional boolean
- `assigneeId` and `unassigned=true` are mutually exclusive

Ordering is `updatedAt` descending with `id` ascending as the stable
tie-breaker.

Success: `200` with:

```ts
{
  success: true;
  data: {
    items: PublicTaskDto[];
    page: number;
    pageSize: number;
    total: number;
  };
}
```

### Read Task

`GET /api/workspaces/:workspaceId/projects/:projectId/tasks/:taskId`

The query includes task ID, project ID, and the actor's proven workspace
boundary.

Success: `200` with a public task envelope.

### Update Task Details

`PATCH /api/workspaces/:workspaceId/projects/:projectId/tasks/:taskId`

Request accepts at least one of:

```json
{
  "title": "Updated title",
  "description": null,
  "assigneeId": null,
  "dueDate": null
}
```

Status, creator, project, identity, timestamps, relations, and unknown fields
are rejected.

Success: `200` with a public task envelope.

### Transition Task Status

`PATCH /api/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/status`

Request:

```json
{
  "status": "IN_PROGRESS"
}
```

The service reads the scoped task, validates the transition, and performs a
conditional update against the previously read status. If another request
wins, the stale request returns the same `409 INVALID_TASK_TRANSITION`
contract.

Success: `200` with a public task envelope.

### Search Task Assignees

`GET /api/workspaces/:workspaceId/task-assignees`

Query:

- `search`: optional trimmed, case-insensitive display-name fragment, maximum
  100 characters
- `page`: default `1`, range `1-10,000`
- `pageSize`: default `20`, range `1-50`

Ordering is `displayName` ascending with user ID ascending as a stable
tie-breaker. Database collation is an implementation detail and is not a
cross-environment lexical-order guarantee.

The public candidate shape is:

```ts
{
  id: string;
  displayName: string;
}
```

The route is available to every current workspace member and does not return
email, membership ID, role, or other profile data.

When multiple candidates have the same display name, the frontend shows a
shortened suffix of the already returned user ID in the visible and accessible
candidate label. This disambiguates selection without expanding the public
profile contract.

The frontend uses this endpoint as a bounded auto-search source. An empty
search loads the first ordered page; a non-empty search is sent only after
trimming and the reviewed debounce interval. Pagination remains explicit and
no client-side full-directory download is introduced.

### Public Task Shape

```ts
{
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: "BACKLOG" | "IN_PROGRESS" | "DONE" | "CANCELED";
  dueDate: string | null;
  creator: {
    id: string;
    displayName: string;
  };
  assignee: {
    id: string;
    displayName: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}
```

Prisma records are mapped to this DTO and are never returned directly.

### Public Failure Behavior

- missing or invalid authentication: existing `401` authentication contract
- invalid body/query, empty update, conflicting filters, unknown field, or
  protected-field assignment: `400 VALIDATION_ERROR`
- proven `VIEWER` mutation: `403 AUTHORIZATION_DENIED`
- missing membership, project, task, cross-workspace identifiers, or unavailable
  assignee: safe `404 RESOURCE_NOT_FOUND`
- invalid, repeated, terminal, or stale status transition:
  `409 INVALID_TASK_TRANSITION`
- exhausted assignment/member-removal serialization retry:
  `409 RESOURCE_CONFLICT` with a safe retryable message

Swagger documents authentication, role behavior, field constraints, nullable
clear semantics, pagination, filtering, public DTOs, and every applicable error
response.

## Backend, Data, and Security Design

Add a `TasksModule` that owns task transport, DTOs, policy, lifecycle rules,
task-request application behavior, and task-facing Prisma projections. It
imports the existing auth, database, workspace, and project boundaries without
creating a generic authorization framework.

Membership removal remains owned by `WorkspacesService`. As a deliberate,
narrow lifecycle-cleanup exception, that service directly unassigns tasks
inside its existing member-removal transaction before deleting the membership.
`WorkspacesModule` must not import `TasksModule`; this preserves the dependency
direction and avoids a workspace/task module cycle. The exception does not
authorize other task commands, DTO mapping, or lifecycle rules in the workspace
module.

Every task request follows:

```text
authenticated user
-> WorkspaceAuthorizationService.requireActor(userId, workspaceId, database)
-> explicit task-action policy
-> project query constrained to actor.workspaceId
-> task query constrained to projectId
-> narrow public DTO
```

Data changes:

- add nullable `dueDate DateTime?` to `Task`
- add one additive Prisma migration; existing rows remain valid with `null`
- add no speculative index in this slice; retain the existing project/status
  and assignee indexes and revisit only with representative query-plan evidence
- regenerate Prisma client for local build/test use; generated source remains
  ignored as required by the repository

Assignment rules:

- verify the requested assignee through
  `(workspaceId, userId)` membership inside the task mutation transaction
- use safe not-found behavior for an invalid or cross-workspace user ID
- extend the existing `WorkspacesService` membership-removal transaction so it
  directly unassigns all tasks in projects from that workspace before deleting
  the membership row; do not call or import `TasksModule` for this cleanup
- run task assignment/unassignment and membership removal at PostgreSQL
  `Serializable` isolation
- retry the complete transaction only for Prisma `P2034`, with at most three
  total attempts and delays of 25 ms then 50 ms
- do not retry validation, authorization, not-found, or other database errors
- after retry exhaustion, fail the mutation without weakening the membership
  invariant or reporting unverified success; return the reviewed retryable
  `409 RESOURCE_CONFLICT` response
- do not clear creator attribution when membership is removed

Status concurrency:

- keep transition rules as pure domain logic with exhaustive unit tests
- update with task ID, project ID, and expected current status
- a zero-row conditional update means the transition is stale and maps to the
  public conflict contract
- no automatic retry is performed because replaying against a new status could
  change the command's meaning

## Frontend Task Workflow

Keep the feature on `/app`.

`WorkspaceHome` continues to own selected-workspace state. `ProjectSection`
owns selected-project state and renders a feature-owned `TaskSection` for the
selected project.

Project behavior:

- existing project cards become semantic selectable controls
- selected state uses `aria-pressed` and visible token-backed feedback
- changing workspace resets project and task selection
- changing project aborts or ignores task and assignee requests from the prior
  project

Task behavior:

- load the first page only after a project is selected
- support status and assignee filters plus load-more pagination
- show loading, empty, error/retry, success, pending, read-only, stale, and
  pagination-reconciliation states
- show title, description summary, status, due date, creator, and assignee
- use locale display for dates while sending ISO UTC values to the API
- successful mutations reset and reload the first page with the current filters
  so ordering and totals reconcile with server state
- prevent duplicate create, update, and transition requests
- preserve form input after recoverable errors

Task editing:

- use the existing shadcn `Sheet` for create and edit
- use shared `Field`, `Input`, `Button`, `Alert`, `Badge`, and `DropdownMenu`
  components
- add shadcn `Textarea` only after running component docs and a CLI dry run
- use a task-specific assignee-search component composed from existing Input,
  Button, list, and Badge primitives
- load the first 20 ordered assignee candidates when the picker opens, then
  auto-search 300 ms after trimmed input settles
- do not issue a search while an IME composition is active; start the debounce
  after `compositionend` so Thai and other composed input is not queried in
  incomplete fragments
- abort the prior request when the query, page, or workspace changes and guard
  response application with the current workspace and normalized-query
  identity so a stale response cannot replace newer results
- expose loading, no-results, error/retry, and load-more states without clearing
  the current selection after a recoverable search failure
- reset pagination when the normalized query changes; load more appends only to
  the matching query and de-duplicates candidates by user ID
- support keyboard navigation, Enter to select the highlighted candidate, and
  Escape to close while restoring focus to the trigger
- expose combobox/listbox relationships, expanded state, active descendant,
  option selection, and result-status announcements to assistive technology
- do not implement a custom select primitive, download the full member
  directory, or expose the administrative member-list API
- disambiguate duplicate display names with a short suffix of the returned user
  ID in both visible text and the control's accessible name
- hide mutation controls for `VIEWER` and show an explicit read-only
  explanation; backend authorization remains authoritative
- before a transition to `CANCELED`, open the shared `AlertDialog` with the task
  name and a clear statement that the task cannot be reopened
- submitting the dialog sends the transition once; canceling, pressing Escape,
  or otherwise dismissing it preserves the current task and sends no mutation

Status presentation:

| Status/action | Shared semantic treatment |
| --- | --- |
| `BACKLOG` | neutral/secondary |
| `IN_PROGRESS` / Start | primary |
| `DONE` / Complete | success |
| `CANCELED` / Cancel | destructive |
| Reopen | warning |

## Authentication Error Feedback

The shared `AuthError` currently adds a generic title above a specific mapped
message. Remove that generic title and render:

- the hidden decorative error icon
- one `AlertDescription` containing the mapped message

Expected login result:

```text
Invalid email or password.
```

Do not also render:

```text
We couldn't complete that request
```

Because `AuthError` is shared, signup receives the same one-message treatment.
Keep meaningful two-part feedback in:

- OAuth landing: `Sign-in not completed` plus the recovery message
- auth recovery screen: its scenario-specific title plus description

Do not weaken backend-safe error mapping or reveal credential, account, or
provider details.

## Shared Color and Button System

`globals.css`, Tailwind semantic color configuration, and shared component
variants are the only owners of action colors.

### Solid Action Palette

Use the same values in light and dark themes:

| Token | Default | Hover | Foreground |
| --- | --- | --- | --- |
| primary | blue-600 `#2563eb` | blue-700 `#1d4ed8` | white |
| destructive | red-600 `#dc2626` | red-700 `#b91c1c` | white |
| success | green-700 `#15803d` | green-800 `#166534` | white |
| warning | amber-700 `#b45309` | amber-800 `#92400e` | white |

The palette must meet a minimum 4.5:1 text contrast for solid action buttons.
Soft badges, icons, and status surfaces use the same semantic tokens with
controlled opacity.

### Shared Variants

`buttonVariants` owns:

- `default`
- `destructive`
- `success`
- `warning`
- `secondary`
- `outline`
- `ghost`
- `link`

`badgeVariants` owns:

- `default` for primary status treatment
- `secondary` for neutral status treatment
- `destructive`
- `success`
- `warning`
- the existing non-status variants

Task status and other feature callsites use these shared Badge variants and
must not add local chromatic classes.

Button and button-link callsites may specify layout, dimensions, and purposeful
motion. They must not specify:

- raw chromatic `bg-*`, `text-*`, or `border-*` utilities
- colored shadow utilities
- manual `dark:` action-color overrides
- a page-specific hover color

Remove:

- login/signup hardcoded blue action classes
- landing-page `dark:bg-blue-*` and related button color overrides
- the `.workspace-create-button` hover workaround

Convert remaining raw user-interface color utilities to semantic tokens:

- BrandMark and blue avatar surfaces -> primary
- online and password-success indicators -> success
- warning indicators -> warning
- error/cancel indicators -> destructive
- landing decorative status dots and feature accents -> the matching semantic
  token or neutral secondary treatment

Google's SVG logo fills remain an explicit vendor-brand exception and are not
converted to WorkSync semantic colors.

Add a frontend source-policy regression test that rejects raw chromatic
Tailwind utilities in TypeScript/TSX user-interface files. Semantic tokens and
the documented Google SVG fill exception remain allowed.

## Affected Surfaces

| Surface | Expected change |
| --- | --- |
| Product | First complete project-scoped task workflow |
| Backend | Tasks module, membership-removal coupling, error code |
| API | Six task/assignee routes, DTOs, filters, errors, Swagger |
| Auth/security | Task RBAC, IDOR/BOLA defense, assignee isolation |
| Data | Nullable task due date and additive migration |
| Frontend | Project selection, task workflow, auth feedback |
| Design system | Semantic palette and shared component variants |
| Tests | Unit, contract, PostgreSQL integration, security, component, browser |
| Runtime/CI | Existing commands and jobs; no topology change |
| Dependencies | No new state or UI framework; shadcn Textarea source only |
| Documentation | Task API, domain/security model, testing, roadmap, plan |

## Ordered Implementation Steps

1. **Preserve the approved boundary**
   - inspect the current working-tree diff before editing
   - persist this reviewed plan and keep unrelated user work intact
   - add the error code, DTO contract, task role policy, and lifecycle tests

2. **Add the data and backend task boundary**
   - add nullable due date and the additive migration
   - create and register `TasksModule`
   - preserve the one-way `TasksModule` -> `WorkspacesModule` dependency and
     keep transactional membership cleanup inside `WorkspacesService`
   - implement the six reviewed routes and narrow public projections
   - enforce scoped actor, project, task, and assignee checks
   - implement conditional transition updates, serializable assignment/member
     removal, bounded conflict retry, and transactional unassignment

3. **Add real API, persistence, and security evidence**
   - extend the in-memory test adapter only for fast framework contract cases
   - add a module-wiring test that resolves both workspace and task modules
     without `forwardRef` or a circular import
   - add real PostgreSQL tests for persistence, filters, ordering, assignment,
     membership removal, and transition concurrency
   - add contract and security cases for every role, route, protected field,
     cross-workspace identifier, and safe failure shape

4. **Add the frontend task workflow**
   - add feature-owned Zod contracts, API client, and error mapping
   - make projects selectable and add TaskSection
   - implement task filters, forms, debounced IME-safe assignee auto-search,
     transitions, and all required UI states
   - require confirmation for terminal cancellation and add component and
     API-client regression tests

5. **Fix shared feedback and design-system drift**
   - simplify shared AuthError to one specific message
   - centralize semantic action/status tokens
   - add shared success/warning Badge variants and update Button and Badge usage
     without page-level action colors
   - migrate existing raw UI colors and add the source-policy test

6. **Add browser and live-boundary evidence**
   - extend mocked Playwright coverage for login feedback, light/dark button
     states, task UI states, terminal-cancel confirmation and dismissal,
     keyboard operation, and blocking console errors
   - extend live Playwright through signup/login, workspace, project, task
     creation, assignment, due date, transition, and filtered listing

7. **Update durable documentation**
   - add task API documentation and link it from the API design index
   - replace open task lifecycle and role questions with the approved decisions
   - update testing/validation docs and Milestone 2 status

8. **Apply the post-implementation review gate**
   - review the working-tree-inclusive diff for requirement correctness,
     domain lifecycle, API compatibility, migration safety, concurrency,
     backend/frontend maintainability, web-security baseline, IDOR/BOLA,
     accessibility, design consistency, test fidelity, and unrelated scope
   - fix or explicitly disposition every blocker and major finding
   - re-review materially changed portions and rerun affected targeted checks

9. **Run final validation and close roadmap state**
   - run authoritative backend, frontend, migration, browser, security, and
     diff gates after review fixes
   - confirm required database-backed and browser suites passed rather than
     skipped
   - only then move this plan to `completed` and update the feature-plan index,
     Milestone 2, and root roadmap

## Validation Contract

| Changed guarantee | Required evidence boundary |
| --- | --- |
| Task role matrix and lifecycle | Pure unit decision tables plus framework security tests |
| Workspace/task dependency direction | Module-wiring test resolving both modules without a cycle |
| Workspace/project/task isolation | Negative IDOR/BOLA tests plus real PostgreSQL integration |
| Assignee membership invariant | Real PostgreSQL assignment and member-removal transaction tests |
| Assignment/removal concurrency | Real PostgreSQL race test proving no removed member remains assigned |
| Serialization retry exhaustion | Deterministic retry-helper test plus PostgreSQL conflict behavior |
| Due-date persistence and clearing | Migration apply/status plus real PostgreSQL create/update/read |
| Status transition consistency | Lifecycle decision tables, contract conflict coverage, and PostgreSQL persistence |
| Public request/response/error contract | Nest contract tests through validation, guard, filter, and Swagger |
| Pagination, ordering, and filters | Contract assertions plus representative multi-row PostgreSQL data |
| Case-insensitive assignee search | Contract cases with mixed-case names and queries |
| Assignee auto-search behavior | Fake-timer component tests for 300 ms debounce, IME composition, immediate query-change cancellation, stale-response protection, initial results, and keyboard operation |
| Frontend task states and stale requests | Vitest component tests for filter cancellation and pagination reconciliation plus mocked Playwright |
| Terminal task cancellation | Component and browser confirmation/dismissal tests plus lifecycle contract |
| Login-specific error message | Shared component regression plus Playwright login failure |
| Shared button and status palette | Button/Badge variant and token tests, contrast calculation, and light/dark browser evidence |
| No page-level action colors | Source-policy regression test and final diff inspection |
| Full user-visible happy path | Live Playwright with real frontend, backend, auth, and PostgreSQL |

Test doubles:

- the in-memory Prisma adapter may prove framework validation, role branching,
  public errors, and abuse cases but does not prove constraints, transactions,
  ordering, or concurrency
- intercepted browser requests may prove browser-visible states and request
  composition but do not prove Nest, Prisma, or PostgreSQL behavior
- real PostgreSQL integration and live browser evidence are therefore required
  and may not be replaced by these doubles

## Required Environment and Commands

Required local capabilities:

- Node.js 22
- pnpm 11.13.1 through Corepack
- PostgreSQL test database whose name ends in `_test`
- Redis test database for the existing authenticated runtime
- Chromium for Playwright
- `app/backend/.env.test` based on its example
- `docker/.env.test` for the disposable Docker validation path
- ports 3000 and 4000 available for live E2E
- shadcn registry access for `Textarea` docs and dry-run; if unavailable,
  implementation pauses rather than hand-writing a replacement primitive
- Google OAuth credentials are not required

Targeted checks may run during implementation. Final validation after review
fixes includes:

```text
corepack pnpm prisma:validate
corepack pnpm prisma:generate
corepack pnpm prisma:migrate:deploy:test
corepack pnpm prisma:migrate:status:test
corepack pnpm validate:backend
corepack pnpm validate:frontend
corepack pnpm test:e2e:frontend
corepack pnpm --filter @worksync/frontend test:e2e:live
corepack pnpm pr:review:evidence
corepack pnpm audit --prod --audit-level moderate
git diff --check
```

The isolated `corepack pnpm docker:test` path may supply the authoritative
disposable PostgreSQL, frontend, backend, and live-E2E evidence. Required
integration, security, or live-browser suites that skip leave validation
incomplete.

## Recovery and Reversibility

- the due-date migration is additive and nullable; the previous application
  version safely ignores the new column
- before any shared or production migration, rollback is application revert or
  forward-fix; do not drop an already applied column as an emergency rollback
- task API/module changes can be reverted before release without deleting task
  data
- frontend feedback and palette changes can be reverted through their shared
  components and tokens
- no feature flag is required because this plan has no production rollout
  scope

## Stop and Re-Plan Conditions

Stop before expanding implementation if any of these becomes necessary:

- task delete/archive, configurable statuses, or a different role matrix
- a dedicated project/task route or shared frontend state architecture
- comments, notifications, realtime, activity logs, or background jobs
- schema changes beyond nullable `dueDate`
- an assignee contract exposing more than ID and display name
- a new state-management or UI framework dependency
- shadcn component provenance cannot be verified and the required existing
  primitive is unavailable
- production deployment or a live migration
- a required security, database, or browser test cannot run and the missing
  evidence would leave a material guarantee unproved

## Delivery Boundary

This plan authorizes implementation only after explicit approval of this plan
version. Successful execution may reach a locally reviewed and validated
`feat/task-foundation` branch that is ready for PR.

Commit, push, pull-request creation, merge, migration of non-disposable data,
and deployment require separate authorization.

## Dependencies

- [Project Foundation](../completed/project-foundation.md)
- [Workspace Membership and RBAC](../completed/workspace-membership-rbac.md)
- [Workspace Authorization Boundary](../completed/workspace-authorization-boundary.md)
- existing authentication and session lifecycle

## Follow-Up

- comments and mentions foundation
- notifications foundation
- activity logs and task realtime events
- project/task route architecture when the current `/app` journey proves a
  concrete need
- measured task-query indexing when representative data shows a bottleneck

## Plan Review

Review verdict: **Ready for approval with no remaining blocking findings.**

Blocking and major findings resolved:

- the first persisted draft did not close the race between assigning a task and
  removing the assignee's membership; Plan Version 2 now requires serializable
  transactions, full-transaction retry for Prisma `P2034` with three total
  attempts, fail-closed exhaustion behavior, and a real PostgreSQL race test
- Plan Version 2 left task cleanup ownership ambiguous and could have forced a
  workspace/task module cycle; Plan Version 3 keeps the dependency one-way and
  defines membership-removal unassignment as a narrow `WorkspacesService`
  lifecycle-cleanup exception
- Plan Version 2 made `CANCELED` terminal without a recovery guard; Plan Version
  3 requires an accessible confirmation, explains the consequence, and proves
  that dismissal sends no mutation
- Plan Version 2 required success and warning status treatments without naming
  their shared Badge owner; Plan Version 3 adds those semantic Badge variants
  and prohibits task-local chromatic classes
- Plan Version 3 defines assignee display-name search as case-insensitive and
  adds mixed-case contract evidence

Contract clarification after review:

- assignee lookup is an explicit bounded auto-search: it loads the first 20
  candidates on open, debounces settled input by 300 ms, respects IME
  composition, rejects stale responses, retains selection through recoverable
  failures, supports load more, and preserves keyboard operation

Assumptions made explicit:

- task hard delete is excluded because the approved goal is
  create/read/update/transition and deletion would create downstream comment,
  audit, and recovery decisions
- the task-specific assignee directory exposes only ID and display name;
  duplicate names are disambiguated without widening profile data
- the additive nullable due-date migration is the only schema change
- existing page-level color edits are user work whose intent must be preserved
  while their raw color overrides are replaced by shared variants

Simpler alternatives considered:

- separate Task Foundation and frontend consistency into two PRs: easier to
  review and roll back, but rejected by the approved one-PR delivery decision
- API-only Task Foundation: smaller, but rejected because the approved scope
  requires a complete `/app` workflow
- reuse the administrative workspace-member endpoint for assignment: less new
  API code, but rejected because it would widen role and profile-data exposure
- omit due date or assignment UI: smaller, but inconsistent with the MVP product
  requirements and approved full workflow

Non-blocking concerns:

- the combined PR is larger than the normal feature-plan preference; the
  concern-separated review gate and stop conditions are mandatory
- display-name substring search may become expensive in very large workspaces;
  keep results bounded and add an index only after representative query-plan or
  latency evidence
- the exact shadcn registry lookup could not run in the restricted planning
  environment; execution requires registry access and must pause if component
  provenance cannot be verified

Recovery and validation review:

- the migration is additive and compatible with the previous application
- no production rollout or live data mutation is authorized
- PostgreSQL integration, security, contract, frontend, browser, and live E2E
  evidence map to the boundaries they claim to prove
- module-wiring, terminal-cancel confirmation, semantic Badge variants, and
  case-insensitive assignee search now have explicit evidence boundaries
- assignee auto-search debounce, IME, immediate query-change cancellation,
  stale-response rejection, initial results, and keyboard behavior have
  component-test evidence; candidate pagination and recovery remain owned by
  the component suite but are not claimed as executed evidence here
- required suites that skip leave the feature incomplete
- post-implementation working-tree review and findings fixes precede final
  validation

Planning evidence:

- repository, schema, routes, existing components, test commands, roadmap,
  product requirements, security model, and current working-tree overlap were
  inspected
- documentation links in this plan resolve
- `git diff --check` passes for the current planning diff
- implementation tests were not run because this review changed documentation
  only and implementation remains unapproved

Delivery boundary:

- **Plan Version 3** was explicitly approved and implemented on the existing
  `feat/task-foundation` branch
- commit, push, pull-request creation, merge, non-disposable migration, and
  deployment remain outside that approval

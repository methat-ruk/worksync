# Feature Plan: Task Authorization Policy Cleanup

Status: Done - implemented and validated 2026-08-29

Intended PR: `refactor/task-authorization-policy-semantics`

Milestone: 2 - Projects and Tasks remediation before Milestone 3

Impact: Bounded backend semantics cleanup with no policy change

## Completion Evidence

- removed the production-dead `TASK_READER_ROLES` set and `canReadTask` helper,
  plus only the tautological unit cases that preserved them
- preserved `canMutateTask`, its role matrix, and the complete production task
  service/controller path without modification
- added real-PostgreSQL list/read coverage for `OWNER`, `ADMIN`, `MEMBER`, and
  `VIEWER`, plus outsider, wrong-workspace project, and wrong-project task
  tenant-hiding cases
- verified repository search contains no production import, re-export, or
  dynamic reference to the removed helper
- completed the post-implementation backend/security review; simplified one
  oversized test fixture finding and reran affected lint/integration checks
- on Node.js 22, passed `validate:backend`: Prisma validation/generation,
  database-environment guard, typecheck, lint, 37 backend suites with 212 tests,
  build, and the 216-file backend artifact check
- verified current API/security documentation already assigns task reads to the
  workspace/project/task service boundary, so no contract documentation changed
- passed `git diff --check` and closed affected roadmap links after validation

## Goal

Remove the production-dead `canReadTask` abstraction so task read authorization
is represented by the service boundary actually enforcing current workspace
membership, without changing roles, tenant hiding, or API behavior.

## Existing Foundation

- Production task reads resolve membership and tenant scope through the task
  service and workspace authorization boundary.
- `canReadTask` returns allow for every current workspace role.
- Repository search shows callers only in the policy's unit test, not in the
  production task read path.
- The reviewed production path resolves the workspace actor, constrains the
  project to that actor's workspace, and constrains the task to that project.
- Current API and authorization documentation already describes that production
  boundary and does not establish `canReadTask` as a contract.

## Acceptance Criteria

- Repository evidence continues to show no production caller, re-export, dynamic
  import, or planned contract owner for `canReadTask` immediately before editing.
- `TASK_READER_ROLES`, `canReadTask`, and only the unit cases preserving that dead
  behavior are removed.
- `canMutateTask`, its role matrix, and the production task service remain
  unchanged.
- Task read/write role semantics, tenant-hiding errors, and response contracts do
  not change.
- Real-database task authorization/isolation regressions remain green.
- Security and API documentation describe the production boundary rather than a
  speculative role helper.

## Reviewed Decision Before Implementation

- Delete `canReadTask`; do not connect, rename, or replace it during this slice.
- If a production caller or distinct read-role decision is discovered, stop and
  re-plan as a Material Change rather than broadening this cleanup in place.

## Scope

- confirm production and test callers of `canReadTask`
- remove the dead reader-role set, helper, import, and tautological unit cases
- add real-PostgreSQL role-matrix and cross-workspace task-read regression
  evidence for the unchanged production boundary
- verify API/security documentation without changing it unless inspection finds
  a concrete mismatch
- close roadmap state only after final validation passes

## Out of Scope

- task UI or pagination refactoring
- role-matrix policy, authorization, tenant-hiding, API, schema, or data changes
- new generic authorization framework
- comment/file/activity role decisions

## Affected Surfaces

- task RBAC policy module
- task policy unit tests
- real-PostgreSQL task authorization/isolation regression tests
- task service and authorization documentation as verify-only surfaces unless a
  mismatch is found
- feature-plan index, Milestone 2, Milestone 3 sequencing text, and root roadmap
  at successful closeout

## Security and Data Boundary

This cleanup must not weaken authorization. Current workspace membership and
task/project/workspace scope remain the production read boundary; write actions
retain their explicit role checks. A helper must never be kept or introduced as
security theater without a production caller.

## Engineering Improvement Review

### Backend and Security

- Keep membership resolution and role-policy decisions separate and explicit.
- Preserve tenant-hiding failures for inaccessible tasks.
- Do not add authorization branches solely to justify an existing helper.

### Code Quality and API Design

- A function named `canReadTask` must return a meaningful Boolean policy result
  used by a caller; otherwise delete it.
- Avoid unused abstractions, tautological policy functions, and tests that prove
  only production-dead behavior.
- Keep the cleanup side-effect free and behavior preserving.

### Testing

- Use repository caller/import/re-export search plus typecheck and build evidence
  to prove the helper is not a production dependency.
- Add real-PostgreSQL list/read cases for `OWNER`, `ADMIN`, `MEMBER`, and `VIEWER`,
  plus outsider and wrong-workspace identifiers, to prove the unchanged boundary
  without relying on the in-memory Prisma test adapter.
- Keep the existing in-memory security and contract suites as complementary HTTP
  and public-error evidence, not as proof of PostgreSQL scoping.

## Ordered Implementation Plan

1. Confirm all production/test imports, re-exports, dynamic references, and the
   actual task read authorization sequence immediately before editing.
2. Remove `TASK_READER_ROLES`, `canReadTask`, its unit-test import, and only the
   tautological read-role cases. Preserve `canMutateTask` and its tests.
3. Add real-PostgreSQL task list/read regression coverage for every workspace
   role and for outsider, wrong-workspace, and wrong-project identifiers without
   changing production policy.
4. Verify focused security/API documentation. Change it only if it incorrectly
   assigns read authorization to the removed helper.
5. Run targeted unit, integration, security, and contract checks during the
   change, then run the post-implementation review gate.
6. Run authoritative Node.js 22 backend validation after review fixes.
7. Only after required evidence passes, move this plan to `completed` and update
   the feature-plan index, Milestone 2, Milestone 3 sequencing text, and root
   roadmap; search for stale planned-path links.

## Validation Contract

| Guarantee | Required evidence |
|---|---|
| No production caller is missed | repository symbol/import/re-export/dynamic-reference search plus Node.js 22 typecheck and build |
| Task read policy is unchanged | real-PostgreSQL list/read role matrix plus outsider, wrong-workspace, and wrong-project cases |
| Task write policy is unchanged | focused task policy unit/integration regressions |
| API and tenant hiding are unchanged | task contract/security suites plus the real-PostgreSQL negative cases |
| Cleanup remains bounded | diff review confirms no UI, schema, or unrelated policy changes |
| Roadmap state closes without stale links | planned-path search and relative-link inspection after moving the plan |

## Post-Implementation Review Gate

Review for a missed dynamic/re-exported caller, authorization drift, membership
versus role responsibility mixing, weakened tenant hiding, new unused helpers,
tests deleted without replacement boundary evidence, and unrelated task changes.
Resolve in-scope findings and rerun affected validation.

## Required Environment and Final Commands

- Node.js 22 as selected by the repository `.nvmrc`
- pnpm 11.13.1 through Corepack
- the guarded PostgreSQL test database required by backend integration tests

Targeted checks may run during implementation. After the post-implementation
review and fixes, final validation includes:

```text
node --version
corepack pnpm validate:backend
git diff --check
```

The Node version must be `v22.x`. A passing run under an unsupported Node version
does not replace the authoritative Node.js 22 result. Required integration or
security evidence that skips leaves validation incomplete.

## Rollback and Forward Fix

- The deletion is code-only and can be reverted without data recovery.
- If a real caller is discovered, restore only a clearly named policy contract
  with explicit caller tests; do not restore the tautology by default.

## Dependencies

- completed task foundation and workspace authorization boundary
- no dependency on task UI or pagination remediation

## Re-plan Conditions

- production behavior or the role matrix must change
- any production caller, re-export, or dynamic dependency on `canReadTask` is
  discovered
- removing the helper requires a production task-service or controller change
- a shared authorization architecture change is proposed
- comments/files require a new cross-resource policy abstraction

## Follow-up

- comment/file/activity role policies remain owned by their feature plans

## Plan Review

Review verdict: **Implemented and validated with no remaining blocking
findings.**

- repository evidence at commit `afd6a4f62feaf416606673370d57e7ce15f50024`
  shows `canReadTask` is referenced only by its policy unit test
- the deletion-only decision is now fixed; discovering a production caller is a
  re-plan condition rather than an alternate implementation path
- the plan was explicitly approved for implementation on 2026-08-29
- in-memory task security/contract tests and the new real-PostgreSQL
  role-matrix/isolation cases pass on Node.js 22
- current API and authorization documentation already describes the production
  workspace/project/task boundary; inspection found no drift and required no
  contract-documentation change
- rollback is a code revert with no schema or data recovery
- authoritative Node.js 22 backend validation and roadmap closeout completed
  after the post-implementation review fix

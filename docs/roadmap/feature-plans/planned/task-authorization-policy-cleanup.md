# Feature Plan: Task Authorization Policy Cleanup

Status: Planned

Intended PR: `refactor/task-authorization-policy-semantics`

Milestone: 2 - Projects and Tasks remediation before Milestone 3

Impact: Bounded backend semantics cleanup with no policy change

## Goal

Remove or justify the production-dead `canReadTask` abstraction so task read
authorization is represented by the service boundary actually enforcing current
workspace membership, without changing roles, tenant hiding, or API behavior.

## Existing Foundation

- Production task reads resolve membership and tenant scope through the task
  service and workspace authorization boundary.
- `canReadTask` returns allow for every current workspace role.
- Repository search shows callers only in the policy's unit test, not in the
  production task read path.

## Acceptance Criteria

- Repository evidence confirms whether `canReadTask` has any production caller
  or planned contract owner.
- If unused, the function and tests that only preserve dead behavior are removed.
- If retained, its name, caller, input, return type, and authorization
  responsibility are explicit and match production behavior.
- Task read/write role semantics, tenant-hiding errors, and response contracts do
  not change.
- Real-database task authorization/isolation regressions remain green.
- Security and API documentation describe the production boundary rather than a
  speculative role helper.

## Required Decisions Before Implementation

- Prefer deletion when no production caller exists.
- Retain or replace the helper only if a concrete caller requires a distinct
  role decision beyond membership resolution.

## Scope

- confirm production and test callers of `canReadTask`
- remove the dead helper and test or connect a clearly justified production
  contract
- clarify nearby task-policy naming/comments only where required by the decision
- update focused unit/security documentation and evidence

## Out of Scope

- task UI or pagination refactoring
- role-matrix, authorization, tenant-hiding, API, or database changes
- new generic authorization framework
- comment/file/activity role decisions

## Affected Surfaces

- task RBAC policy module
- task policy unit tests
- task service/authorization documentation only as needed to identify ownership
- task integration and security regression evidence

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

- Use repository caller search plus unit evidence for the chosen policy shape.
- Rerun real-database role and cross-workspace task reads to prove no boundary
  drift.

## Ordered Implementation Plan

1. Confirm all production/test callers and the actual task read authorization
   sequence.
2. Record the delete-versus-retain decision from concrete caller evidence.
3. Remove the helper/test or rename/connect the smallest justified explicit
   policy without changing behavior.
4. Update focused security/API documentation if it currently implies a separate
   read-role policy.
5. Run unit, integration, security, and contract regression evidence.
6. Run the post-implementation review gate before final validation.

## Validation Contract

| Guarantee | Required evidence |
|---|---|
| No production caller is missed | repository symbol/import search and build/typecheck |
| Task read policy is unchanged | real-Postgres role-matrix and cross-workspace security tests |
| Task write policy is unchanged | focused task policy unit/integration regressions |
| API and tenant hiding are unchanged | task contract/security tests |
| Cleanup remains bounded | diff review confirms no UI, schema, or unrelated policy changes |

## Post-Implementation Review Gate

Review for a missed dynamic/re-exported caller, authorization drift, membership
versus role responsibility mixing, weakened tenant hiding, new unused helpers,
tests deleted without replacement boundary evidence, and unrelated task changes.
Resolve in-scope findings and rerun affected validation.

## Rollback and Forward Fix

- The deletion is code-only and can be reverted without data recovery.
- If a real caller is discovered, restore only a clearly named policy contract
  with explicit caller tests; do not restore the tautology by default.

## Dependencies

- completed task foundation and workspace authorization boundary
- no dependency on task UI or pagination remediation

## Re-plan Conditions

- production behavior or the role matrix must change
- a shared authorization architecture change is proposed
- comments/files require a new cross-resource policy abstraction

## Follow-up

- comment/file/activity role policies remain owned by their feature plans

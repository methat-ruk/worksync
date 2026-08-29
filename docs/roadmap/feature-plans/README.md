# WorkSync Feature Plans

Feature plans sit between roadmap milestones and implementation plans.

```text
Roadmap -> Milestone -> Feature Plan -> PR / Issue -> Implementation Plan
```

A feature plan should normally fit one reviewable PR. Split it when the review,
security, migration, or validation surface becomes too large. Merge slices only
when they cannot be validated independently.

## How to Choose What Comes Next

Prioritize planned work by:

1. milestone order and dependency chain
2. security or data boundary risk
3. ability to unlock the next user-visible workflow
4. smallest complete slice that can be reviewed deeply
5. availability of validation evidence

With task authorization policy cleanup complete, this means:

1. deliver comments and mentions on the completed task UI boundary
2. add notifications, files, jobs, and production readiness in dependency order

Do not start project/task/comment/file work before workspace ownership and
tenant-isolation evidence exist.

## Planned Feature Plans

| Order | Plan | Milestone | Status |
|---|---|---|---|
| 1 | [Comments and Mentions Foundation](planned/comments-mentions-foundation.md) | 3 | Planned |
| 2 | [Notifications Foundation](planned/notifications-foundation.md) | 3 | Planned |
| 3 | [File Upload Foundation](planned/file-upload-foundation.md) | 4 | Planned |
| 4 | [Background Jobs Foundation](planned/background-jobs-foundation.md) | 4 | Planned |
| 5 | [Production Deployment Foundation](planned/production-deployment-foundation.md) | 5 | Blocked: target decision |

If the approved file-upload policy requires asynchronous malware scanning
before attachments can be made available, replace the default File/Jobs order
with reviewed PR slices: attachment metadata/storage lifecycle first, the
Background Jobs scanning worker second, and upload availability/UI integration
third. Do not create a File Upload <-> Background Jobs dependency cycle.

## Plan Set Review - 2026-07-31

Evidence baseline: repository commit
`6fbf0fd296ca9c8b2e797faea3b44d31186c2d5d` plus read-only rendered-browser
inspection performed for the repository health review.

Review outcome:

- all 17 completed feature summaries remain completed historical records; no
  planned feature was treated as delivered
- five PR-sized remediation plans were added for the verified frontend runtime
  mismatch, recovery/app-shell copy, task UI/accessibility, shared pagination,
  and task policy semantics findings
- all five existing planned plans now define acceptance criteria, current-scope
  Engineering Improvement Review, ordered implementation, mapped validation,
  post-implementation review, rollback/forward-fix, and re-plan conditions
- the Production Deployment plan is explicitly blocked on a named target and
  must be split into target-specific PR plans before implementation
- file/job ordering is conditional on the approved malware-scanning policy and
  must be split around the attachment lifecycle contract when scanning is
  required, avoiding a circular dependency
- local plan links, required headings, dependency direction, and docs-only scope
  were re-reviewed after revision
- runtime/copy and task UI/pagination/policy work were separated where their
  validation and rollback boundaries are independent

At that review point, implementation remained unapproved. Frontend UI Runtime
Compatibility was subsequently approved and completed on 2026-08-10. Frontend
Recovery and App-Shell Copy Consistency was reviewed, implemented, and completed
on 2026-08-19 after required production compatibility CI passed in Chromium,
Firefox, and WebKit. Each remaining planned slice still requires review before
implementation starts.

Task UI Boundaries was subsequently reviewed, implemented, and completed on
2026-08-24 with component, mocked Chromium E2E, guarded live Chromium E2E,
production-build, and dependency-audit evidence.

Frontend Pagination Reconciliation was subsequently reviewed, implemented, and
completed on 2026-08-27 with pure/component regression, mocked Chromium E2E,
guarded live Chromium E2E, and production-build evidence.

Task Authorization Policy Cleanup was reviewed and revised on 2026-08-29 as a
deletion-only change with required real-PostgreSQL role/isolation evidence,
Node.js 22 final validation, and post-validation roadmap closeout. It was then
approved, implemented, reviewed, validated, and completed on the same date.

## Completed Feature Summaries

Completed summaries are intentionally lighter than planned feature plans. They
capture delivered scope, key decisions, evidence, and follow-up without
reconstructing every historical implementation detail.

| Plan | Status |
|---|---|
| [Task Authorization Policy Cleanup](completed/task-authorization-policy-cleanup.md) | Done |
| [Frontend Pagination Reconciliation](completed/frontend-pagination-reconciliation.md) | Done |
| [Task UI Boundaries](completed/task-ui-boundaries.md) | Done |
| [Frontend Recovery and App-Shell Copy Consistency](completed/frontend-recovery-app-shell-copy-consistency.md) | Done |
| [Frontend UI Runtime Compatibility](completed/frontend-ui-runtime-compatibility.md) | Done |
| [Runtime and Validation Foundation](completed/runtime-validation-foundation.md) | Done |
| [Auth Foundation](completed/auth-foundation.md) | Done |
| [Auth Session Lifecycle](completed/auth-session-lifecycle.md) | Done |
| [Google OAuth Login](completed/auth-google-oauth.md) | Done |
| [Frontend Auth and App Shell](completed/frontend-auth-app-shell.md) | Done |
| [Workspace Foundation](completed/workspace-foundation.md) | Done |
| [Workspace Membership and RBAC](completed/workspace-membership-rbac.md) | Done |
| [Workspace Frontend Bootstrap](completed/workspace-frontend-bootstrap.md) | Done |
| [Frontend Structure Boundaries](completed/frontend-structure-boundaries.md) | Done |
| [Frontend Auth State and Redirect Safety](completed/frontend-auth-state-and-redirect-safety.md) | Done |
| [Auth Session Concurrency Hardening](completed/auth-session-concurrency-hardening.md) | Done |
| [Workspace Pagination and Selection](completed/workspace-pagination-and-selection.md) | Done |
| [Workspace Authorization Boundary](completed/workspace-authorization-boundary.md) | Done |
| [Project Foundation](completed/project-foundation.md) | Done |
| [Task Foundation and Frontend Consistency](completed/task-foundation.md) | Done |
| [Database Environment Isolation](completed/database-environment-isolation.md) | Done |
| [Environment Layout and Docker Test Runtime](completed/environment-layout-docker-test-runtime.md) | Done |

## Feature Plan Template

Use this shape for future plans:

```md
# Feature Plan: Name

Status:
Intended PR:
Milestone:
Impact:

## Goal

## Existing Foundation

## Acceptance Criteria

## Required Decisions Before Implementation

## Scope

## Out of Scope

## Affected Surfaces

## Security and Data Boundary

## Engineering Improvement Review

## Ordered Implementation Plan

## Validation Contract

## Post-Implementation Review Gate

## Rollback and Forward Fix

## Dependencies

## Re-plan Conditions

## Follow-up
```

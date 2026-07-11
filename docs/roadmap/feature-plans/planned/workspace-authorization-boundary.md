# Feature Plan: Workspace Authorization Boundary

Status: Planned

Intended PR: `refactor/workspace-authorization-boundary`

Milestone: Repository Health Remediation

Impact: Material change (Tier 2) because it establishes the reusable tenant and
authorization boundary consumed by future workspace-scoped resources.

## Goal

Expose one tested workspace membership/actor boundary that project and later
resource services can reuse without duplicating membership queries or drifting
authorization semantics.

## Source Opportunity

The current workspace service enforces membership through a private helper,
while membership-management policy is implemented separately. This is correct
for delivered workspace endpoints but offers no reusable trusted workspace
context for project routes. Adding those routes now would encourage duplicated
lookups and inconsistent not-found, forbidden, role, and tenant behavior.

## Acceptance Criteria

- one reusable backend boundary resolves a trusted workspace actor/membership
  context from the authenticated user and workspace identifier
- existing workspace and membership endpoints preserve their documented RBAC,
  status codes, and response contracts
- cross-workspace and removed-member access fail closed
- the Project Foundation plan can consume the boundary without copying a
  membership query or inventing a second actor type
- authorization policy remains explicit at the resource/action layer; the
  shared boundary does not become an opaque generic policy engine

## Assumptions

- the existing `WorkspaceMember` and role models remain authoritative
- public API behavior does not need to change
- project/task role-matrix decisions remain owned by their feature plans

## Scope

- extract the minimum reusable membership lookup and trusted workspace actor
  contract from existing workspace behavior
- make workspace and membership services consume the shared boundary where that
  reduces duplication without obscuring action-specific policy
- define module ownership and exports for downstream services
- preserve and extend authorization, integration, and contract evidence
- document how downstream workspace-scoped resources must consume the boundary

## Out of Scope

- project or task routes, DTOs, persistence, or UI
- a generic enterprise authorization framework or policy DSL
- changing the role enum or finalizing the project/task permission matrix
- caching membership or introducing a new authorization service dependency
- public API or database schema changes

## Affected Surfaces

- backend workspace module and service boundaries
- workspace membership/RBAC services
- reusable authenticated workspace actor types
- backend unit, integration, contract, and security tests
- API/security architecture documentation if ownership changes need recording

## Security and Data Boundary

The shared resolver must derive identity from authenticated server context, not
client-supplied user or role data. It must scope membership by both user and
workspace and define consistent fail-closed behavior without leaking the
existence of another tenant's resources.

## Implementation Slices

1. Map current workspace membership and management authorization paths and lock
   their observable behavior with tests.
2. Define the minimum trusted workspace actor contract and module owner.
3. Extract and adopt the boundary in existing services without broad policy
   abstraction.
4. Add cross-tenant, removed-member, role, and contract regression evidence.
5. Update Project Foundation's implementation assumptions and relevant security
   documentation.

## Required Evidence

- unit tests for resolver and action-policy separation
- real PostgreSQL integration tests for active and removed memberships
- security tests for forged identifiers, cross-workspace access, and role drift
- contract regression tests for existing workspace/membership endpoints
- backend typecheck, lint, unit, contract, integration, and security suites
- review evidence that downstream project code needs no duplicate membership
  query

## Rollback and Forward Fix

No schema or public-contract change is expected. Existing service behavior can
be restored by reverting the extraction. If adoption reveals incompatible
authorization semantics, keep the tested existing paths and re-plan the shared
contract rather than weakening either policy.

## Approval and Decision Gates

- approve the trusted actor contract and module owner before extraction
- implementation requires explicit approval because it changes an authorization
  boundary
- re-plan any schema, role-model, public-contract, or cross-module architecture
  expansion

## Done Criteria

- existing workspace RBAC behavior remains evidenced
- one narrow reusable boundary is ready for Project Foundation
- no duplicated or conflicting membership lookup remains in the affected
  workspace services
- all acceptance criteria have mapped passing evidence

## Dependencies

- completed workspace foundation
- completed workspace membership and RBAC

## Follow-up

- [Project Foundation](project-foundation.md) consumes this boundary and owns
  project-specific action policy

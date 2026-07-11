# Feature Plan: Production Deployment Foundation

Status: Planned

Intended PR: `feat/production-deployment-foundation`

Milestone: 5 - Production Readiness

## Goal

Make WorkSync deployable through an identifiable, repeatable, and observable
production path.

## Scope

- deployment target decision
- immutable image publishing or platform build decision
- environment and secret management process
- verify hosted secret scanning is enabled or add a repository-owned detection
  gate when platform coverage is absent
- production Redis client and transport decision for required TLS, credentials,
  reconnection, pooling, and observability behavior
- refresh-session retention and expired/revoked row cleanup policy
- release readiness checklist
- smoke or post-deploy verification
- rollback or containment path

These are release-readiness requirements, not authorization to bundle unrelated
implementation into one PR. After the deployment target and operating model are
known, split Redis hardening, session cleanup, or secret-scanning work into
separate PR-sized plans when each needs independent rollout or evidence.

## Out of Scope

- multi-region architecture
- advanced autoscaling
- full incident automation
- enterprise compliance program

## Affected Surfaces

- CI/CD
- Docker or platform deployment configuration
- environment examples
- runtime health checks
- observability docs
- auth-session operational data lifecycle
- Redis runtime dependency and connectivity

## Security and Data Boundary

Production secrets must not be exposed to untrusted builds or local docs.
Deployment must not weaken auth, cookie, CORS, or data boundary assumptions.
Secret-detection ownership must be explicit rather than inferred from an
external repository setting. Session cleanup must be bounded, observable, and
safe under concurrent refresh/logout activity. Production Redis transport must
match the selected provider's encryption and authentication requirements.

## Required Evidence

- fixed artifact or reproducible build path
- environment validation
- health and critical auth smoke
- rollback/forward-fix path documented
- no secret leakage in logs or CI output
- evidence for either hosted secret scanning or a repository-owned equivalent
- session retention/cleanup evidence against expired, revoked, and active rows
- Redis TLS/authentication, reconnect, failure, and resource-usage evidence

## Done Criteria

- release readiness can make a ready/not-ready decision from evidence
- production deployment steps are not tribal knowledge

## Dependencies

- core workspace/project/task workflows stable enough to smoke test
- background jobs foundation if session cleanup uses a scheduled worker

## Follow-up

- backup/restore evidence
- incident runbooks
- observability dashboards
- periodic dependency-currentness review after the deployment target is known

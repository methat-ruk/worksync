# Feature Plan: Frontend UI Runtime Compatibility

Status: Planned - Next

Intended PR: `fix/shadcn-tailwind-compatibility`

Milestone: Cross-cutting frontend remediation before Milestone 3

Impact: Material frontend foundation change

## Goal

Restore a single supported Tailwind/shadcn runtime contract so shared UI
components render the styles expressed by their source, then remove misleading
auth recovery and app-shell copy without changing product capabilities.

## Verified Problem

- `app/frontend/package.json` resolves Tailwind CSS 3 while current shadcn
  components and stylesheet imports use Tailwind CSS 4 constructs.
- Shared primitives including Alert, Button, Badge, Dialog, Dropdown, Field,
  Input, Textarea, Tooltip, and Avatar contain utilities that the current
  compiler may not emit.
- The auth recovery Alert has reproduced a broken rendered grid layout even
  though build, type, and class-string tests pass.
- Auth recovery can show both a generic session-verification title and a
  connection-specific instruction without evidence that connectivity is the
  cause.
- App-shell navigation labels imply Projects and Tasks are unavailable even
  though those workflows are available on Home; dedicated routes do not yet
  exist.

## Acceptance Criteria

- The frontend has one documented and dependency-locked Tailwind/shadcn
  compatibility contract.
- Every shipped shared primitive compiles its required utilities and renders
  representative states correctly in supported browsers.
- The auth recovery state presents one accurate, actionable message and one
  Retry action without speculative connection advice or a redundant session
  verification heading.
- Alert icons and copy align correctly on one visual row at desktop and mobile
  widths while longer descriptions wrap predictably.
- Semantic action colors remain centralized in shared primitives and tokens;
  feature pages do not acquire new raw action-color recipes.
- App-shell navigation describes the routes and workflows that actually exist;
  it does not mark available Home workflows as “Soon” or enable nonexistent
  routes.
- Light, dark, keyboard-focus, disabled, loading, error, overlay, and mobile
  states covered by this change pass rendered-browser review.
- Tests can fail when a required shared-component style is missing from the
  compiled CSS or rendered state.

## Decision Gate: Compatibility Direction

Before editing dependencies, record the supported browser matrix and compare it
with Tailwind CSS 4 requirements.

1. If the product supports the required browser versions, migrate the frontend
   coherently to Tailwind CSS 4. This is the preferred path because the checked
   in components and stylesheet imports already express that contract.
2. If older browsers remain required, stop and revise this plan around pinned,
   Tailwind CSS 3-compatible shadcn components and stylesheets.

Do not patch individual missing utilities while leaving the dependency/source
contract mixed. A change in the browser-support assumption requires plan
review and approval before implementation continues.

## Scope

- align Tailwind, PostCSS, shadcn styles, configuration, and lockfile to the
  selected compatibility direction
- audit all shared UI primitives for unsupported or silently dropped syntax
- add compiled-style and rendered-state regression evidence
- correct the shared Alert layout through the selected runtime contract
- simplify the auth recovery component contract and user-facing copy
- reconcile app-shell labels, disabled state, and security summary with current
  routed behavior
- preserve centralized semantic Button, Badge, destructive, warning, success,
  and brand color ownership
- update affected frontend and roadmap documentation after validation

## Out of Scope

- visual redesign or new design system
- new Projects or Tasks routes
- task-detail routing
- new product features
- broad component replacement unrelated to runtime compatibility
- changing authorization, API, or database behavior

## Affected Surfaces

- frontend dependency and build configuration
- global styles and design tokens
- shared UI primitives
- auth recovery presentation
- app-shell navigation copy and state
- component and browser test infrastructure
- frontend setup, validation, and roadmap documentation

## Security and Data Boundary

The compatibility and copy changes must preserve existing authentication,
same-origin redirect, protected-route, and tenant-boundary behavior. Recovery
copy must not reveal session internals, and app-shell presentation must not
grant or imply access that the router and backend do not provide.

## Engineering Improvement Review

### UX/UI

- Keep Retry only for a recoverable state; distinguish it visually and
  semantically from loading.
- Use one concise message such as “We couldn't load this page.” unless the
  client can prove a more specific cause.
- Preserve responsive layout, visible focus, sufficient contrast, and
  icon/text alignment in both themes.

### Frontend and Code Quality

- Keep semantic variants in shared primitives or tokens. Feature code selects
  a named variant rather than assembling raw colors.
- Prefer a single-purpose auth recovery API such as `message` plus `onRetry`
  over independently supplied title and description that can contradict each
  other.
- Add a small style-probe or rendered assertion for utilities whose absence can
  silently degrade layout. Do not build a second CSS framework test system.

### Security

- Copy must not reveal session internals and must not claim a network failure
  that was not established.
- Preserve existing same-origin redirect, authentication, and route protection
  behavior.

### Testing

- Pair unit/component assertions with a real compiled frontend and browser.
- Cover keyboard focus and meaningful ARIA state, not only screenshots.
- Use screenshots or computed styles for representative shared primitives where
  layout/contrast is the guarantee.

## Ordered Implementation Plan

1. Capture the supported-browser decision and baseline the broken Alert plus a
   representative matrix of shared primitives in light, dark, and mobile views.
2. Inventory dependency, PostCSS, global stylesheet, configuration, and shared
   component syntax against the selected Tailwind contract.
3. Apply the coherent dependency/configuration migration and regenerate the
   lockfile without unrelated upgrades.
4. Fix any remaining shared primitive incompatibilities and preserve semantic
   variant/token ownership.
5. Replace the auth recovery title/description combination with one clear
   message contract; remove speculative connection advice and redundant copy.
6. Reconcile app-shell navigation and summary copy with the workflows and
   routes that exist today.
7. Add focused compiled-style, component, accessibility, and browser regression
   coverage.
8. Update affected setup/validation and roadmap documentation with the selected
   compatibility contract and verified state.
9. Run the post-implementation review gate before final validation.

## Validation Contract

| Guarantee | Required evidence |
|---|---|
| Dependency and CSS contract is coherent | clean install, frontend build, generated CSS inspection |
| Shared primitives render their declared states | component tests plus compiled-browser computed-style or visual checks |
| Auth recovery copy and Retry are accurate | component test and real-browser recovery flow |
| Alert layout is responsive | desktop and narrow viewport browser evidence |
| Themes and semantic variants remain usable | light/dark contrast, hover, focus, disabled, destructive/warning/success state review |
| App shell reflects actual routes | route/navigation component tests and keyboard browser flow |
| Existing workflows are not regressed | frontend unit/type/build gates and critical live auth/workspace/project/task smoke |

Mocked browser evidence alone is insufficient for CSS compilation or runtime
layout. Required live evidence must use the production-shaped frontend build or
the same PostCSS/Tailwind pipeline.

## Post-Implementation Review Gate

Before final validation, review the diff for:

- mixed Tailwind 3/4 syntax or configuration left behind
- raw semantic color recipes added outside shared ownership
- unsupported browser assumptions
- source-class assertions presented as rendered evidence
- new navigation promises without routes
- error copy that exposes internals or invents a root cause
- unrelated dependency or component churn

Resolve in-scope findings, rerun affected checks, and re-plan if the migration
requires a wider component rewrite or browser-support change.

## Rollback and Forward Fix

- Keep dependency/configuration migration and copy/layout changes reviewable as
  separate commits when practical.
- If the selected Tailwind direction fails the browser-support gate, revert the
  dependency/configuration slice and use the reviewed alternative; do not leave
  a partially mixed runtime.
- A localized primitive regression may be forward-fixed only when the global
  compatibility contract remains valid and validation can prove containment.

## Dependencies

- completed frontend auth/app-shell and task foundation slices
- explicit supported-browser decision
- existing frontend unit, component, E2E, and live E2E harnesses

## Re-plan Conditions

- required browser support is incompatible with Tailwind CSS 4
- migration requires a new component library or broad visual redesign
- a dedicated Projects, Tasks, or task-detail route is proposed
- validation reveals API/auth behavior changes rather than presentation-only
  changes

## Follow-up

- keep new feature UI on the centralized semantic variant/token contract
- treat broader visual redesign as a separate plan

# Feature Plan: Frontend UI Runtime Compatibility

Status: Planned - Next

Intended PR: `fix/shadcn-tailwind-compatibility`

Milestone: Cross-cutting frontend remediation before Milestone 3

Impact: Material frontend foundation change

## Goal

Restore a single supported Tailwind/shadcn runtime contract so shared UI
components render the styles expressed by their source without changing product
capabilities.

## Verified Problem

- `app/frontend/package.json` resolves Tailwind CSS 3 while current shadcn
  components and stylesheet imports use Tailwind CSS 4 constructs.
- Shared primitives including Alert, Button, Badge, Dialog, Dropdown, Field,
  Input, Textarea, Tooltip, and Avatar contain utilities that the current
  compiler may not emit.
- The auth recovery Alert has reproduced a broken rendered grid layout even
  though build, type, and class-string tests pass.

## Acceptance Criteria

- The frontend has one documented and dependency-locked Tailwind/shadcn
  compatibility contract.
- Every shipped shared primitive compiles its required utilities and renders
  representative states correctly in supported browsers.
- Alert icons and copy align correctly on one visual row at desktop and mobile
  widths while longer descriptions wrap predictably.
- Semantic action colors remain centralized in shared primitives and tokens;
  feature pages do not acquire new raw action-color recipes.
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
- rendered Alert consumers used as compatibility probes
- component and browser test infrastructure
- frontend setup, validation, and roadmap documentation

## Security and Data Boundary

The compatibility change must preserve existing authentication, same-origin
redirect, protected-route, and tenant-boundary behavior. Shared primitive
changes must not alter feature authorization or make hidden actions available.

## Engineering Improvement Review

### UX/UI

- Preserve responsive layout, visible focus, sufficient contrast, and
  icon/text alignment in both themes.

### Frontend and Code Quality

- Keep semantic variants in shared primitives or tokens. Feature code selects
  a named variant rather than assembling raw colors.
- Add a small style-probe or rendered assertion for utilities whose absence can
  silently degrade layout. Do not build a second CSS framework test system.

### Security

- Preserve existing same-origin redirect, authentication, route protection,
  and authorization behavior.

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
5. Add focused compiled-style, component, accessibility, and browser regression
   coverage.
6. Update affected setup/validation and roadmap documentation with the selected
   compatibility contract and verified state.
7. Run the post-implementation review gate before final validation.

## Validation Contract

| Guarantee | Required evidence |
|---|---|
| Dependency and CSS contract is coherent | clean install, frontend build, generated CSS inspection |
| Shared primitives render their declared states | component tests plus compiled-browser computed-style or visual checks |
| Alert layout is responsive | desktop and narrow viewport browser evidence |
| Themes and semantic variants remain usable | light/dark contrast, hover, focus, disabled, destructive/warning/success state review |
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
- unrelated dependency or component churn

Resolve in-scope findings, rerun affected checks, and re-plan if the migration
requires a wider component rewrite or browser-support change.

## Rollback and Forward Fix

- Keep dependency/configuration migration and shared primitive fixes reviewable
  as separate commits when practical.
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
- validation reveals API/auth behavior changes rather than presentation-only
  changes

## Follow-up

- [Frontend Recovery and App-Shell Copy Consistency](frontend-recovery-app-shell-copy-consistency.md)
- keep new feature UI on the centralized semantic variant/token contract
- treat broader visual redesign as a separate plan

# Feature Plan: Frontend UI Runtime Compatibility

Status: Done - implemented and validated 2026-08-10

Intended PR: `fix/shadcn-tailwind-compatibility`

Milestone: Cross-cutting frontend remediation before Milestone 3

Impact: Material frontend foundation change

## Completion Evidence

- migrated the locked frontend contract to Tailwind CSS 4.3.3 with
  `@tailwindcss/postcss`, CSS-first theme mappings, and Tailwind 4 shadcn
  configuration
- audited shipped feature utilities and retained local semantic component
  variants without bulk-overwriting shadcn sources
- removed `field-sizing: content` from the shared Textarea because current
  Firefox does not support it; the cross-engine `min-height` fallback preserves
  the component contract
- verified responsive Alert layout, light/dark theme behavior, CSS-variable
  utilities, recovery interaction, and absence of unexpected console errors
  on current Playwright Chromium, Firefox, and WebKit using a production build
- passed frontend typecheck, lint, 155 Vitest tests, 2 health-probe tests,
  production build, 22 mocked Chromium E2E tests, and 3 live
  auth/workspace/project/task E2E tests
- configured Tailwind CSS editor language mode and added a lint gate for
  canonical utility spellings so Tailwind 4 directives and class suggestions
  remain continuously checked

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
- Tailwind CSS 4 changes utility, Preflight, border, ring, outline, shadow, and
  selector semantics that are also used outside shared primitives across the
  landing, authentication, app-shell, workspace, project, and task surfaces.
- The auth recovery Alert has reproduced a broken rendered grid layout even
  though build, type, and class-string tests pass.

## Acceptance Criteria

- The frontend has one documented and dependency-locked Tailwind/shadcn
  compatibility contract.
- The supported-browser policy is modern evergreen browsers: current stable
  Chrome, Edge, Firefox, and Safari, plus current stable mobile Chrome and
  Safari. Legacy and end-of-life browser releases are not supported.
- The implementation uses Tailwind CSS 4 and does not retain Tailwind CSS 3
  configuration, directives, or component syntax.
- Every shipped shared primitive compiles its required utilities and renders
  the states assigned to it in a reviewed component/state/browser matrix.
- Landing, authentication and recovery, app shell, workspace, project, task,
  and overlay surfaces preserve their intended layout and interaction after
  utility and Preflight migration.
- Alert icons and copy align correctly on one visual row at desktop and mobile
  widths while longer descriptions wrap predictably.
- Semantic action colors remain centralized in shared primitives and tokens;
  feature pages do not acquire new raw action-color recipes.
- Light, dark, keyboard-focus, disabled, loading, error, overlay, and mobile
  states assigned by the matrix pass rendered-browser review.
- Tests can fail when a required shared-component style is missing from the
  compiled CSS or rendered state.

## Reviewed Component, State, and Surface Matrix

The production-build compatibility suite renders the real application routes
and components; it does not inject Tailwind class probes from test code. This
prevents a tracked test file from keeping a removed component utility in the
generated CSS. Each browser test below runs in Playwright Chromium, Firefox,
and WebKit. Existing component and workflow tests provide the deeper behavior
checks named in the last column.

| Shared primitives | Assigned rendered states | Shipped surfaces | Evidence owner |
|---|---|---|---|
| Button | primary, keyboard focus, disabled | landing, authentication, task | production compatibility plus auth/task E2E |
| Field, Input | focus, validation, disabled | authentication, task form | production compatibility plus auth/task component tests |
| Progress | empty and evaluated password strength | signup | production compatibility plus password-policy tests |
| Tooltip | disabled trigger and open overlay | authentication | production compatibility |
| Alert | error, retry, light, dark, desktop, mobile wrapping | authentication recovery | production compatibility plus auth E2E |
| Avatar, Badge, Separator | authenticated data and semantic role presentation | app shell, workspace | production compatibility plus app-shell/workspace tests |
| DropdownMenu | open, positioned, disabled item | app-shell profile menu | production compatibility plus auth E2E |
| AlertDialog | open confirmation, destructive action, cancel | app-shell session management | production compatibility plus auth E2E |
| Skeleton | loading placeholders | auth guard, workspace, project, task | component loading-state tests plus production app bootstrap |
| Sheet, Textarea | open overlay, keyboard focus, minimum height, mobile width | task create/edit | production compatibility plus task component/E2E |

The authenticated compatibility route loads real app-shell, workspace,
project, task, dropdown, confirmation, and task-sheet surfaces with
deterministic API responses. Mocking controls data only; rendering still uses
the production Next.js build and compiled Tailwind CSS.

## Approved Browser and Compatibility Decision

Decision approved: 2026-08-10

- WorkSync supports modern evergreen browsers rather than pinning product
  support to browser versions that continuously age.
- The compatibility target is current stable Chrome, Edge, Firefox, and Safari,
  plus current stable mobile Chrome and Safari.
- Tailwind CSS 4's hard browser floor remains a dependency constraint. A
  supported browser must satisfy that floor even when a vendor's update cadence
  or operating-system policy differs.
- CI uses the current Playwright Chromium, Firefox, and WebKit engines for the
  focused compatibility suite. These engines prove current-engine behavior;
  they do not claim direct execution on every vendor build or historical
  minimum version.
- Migrate coherently to Tailwind CSS 4 because the checked-in shadcn components
  and stylesheet imports already express that contract.

Do not patch individual missing utilities while leaving the dependency/source
contract mixed. A future requirement to support legacy or end-of-life browsers
requires plan review and a separately approved compatibility direction.

## Scope

- align Tailwind, PostCSS, shadcn styles, configuration, and lockfile to the
  approved Tailwind CSS 4 direction
- migrate the Tailwind configuration to the supported CSS-first contract,
  including theme tokens, class-based dark mode, content detection, and the
  shadcn CLI configuration
- audit all shipped Tailwind usage under `app/frontend/src/**/*.{ts,tsx,css}`
  for unsupported, silently dropped, renamed, or behavior-changing syntax,
  with shared UI primitives treated as the highest-risk surface
- preserve the observable layout and interaction of landing, authentication,
  app-shell, workspace, project, task, and overlay surfaces
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
- React, React DOM, Next.js, Base UI, icon-library, or component-library major
  upgrades that are not required by the Tailwind CSS 4 migration
- exact historical-browser or end-of-life-browser certification
- changing authorization, API, or database behavior

## Affected Surfaces

- frontend dependency and build configuration
- global styles and design tokens
- shared UI primitives
- Tailwind class consumers across shipped frontend feature and app surfaces
- rendered Alert consumers and representative critical pages used as
  compatibility probes
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
- Use the official Tailwind upgrade tool as a migration baseline and review its
  complete diff; do not accept generated changes without local inspection.
- Configure Tailwind CSS 4 through `@tailwindcss/postcss`, CSS imports,
  `@theme inline`, and the class-based dark custom variant. Remove superseded
  Tailwind CSS 3 configuration only after its project tokens and behavior have
  been mapped.
- Keep `components.json` aligned with Tailwind CSS 4 and leave its Tailwind
  config path empty.
- Use shadcn CLI dry-run and per-file diff output before reconciling an existing
  primitive. Do not bulk-overwrite locally customized components or semantic
  variants.
- Keep React 18 and Next.js 15 unchanged unless an independently reviewed
  blocker proves that the compatibility migration cannot proceed without a
  broader runtime upgrade.
- Add a small style-probe or rendered assertion for utilities whose absence can
  silently degrade layout. Do not build a second CSS framework test system.

### Security

- Preserve existing same-origin redirect, authentication, route protection,
  and authorization behavior.

### Testing

- Pair unit/component assertions with a real compiled frontend and browser.
- Define a finite component/state/browser matrix before migration so “every
  primitive” and “representative state” are reviewable rather than subjective.
- Run the focused production-build compatibility suite on current Playwright
  Chromium, Firefox, and WebKit. Keep the broader live product smoke bounded to
  the engines needed to protect the affected user journeys.
- Cover keyboard focus and meaningful ARIA state, not only screenshots.
- Use screenshots or computed styles for representative shared primitives where
  layout/contrast is the guarantee.

## Ordered Implementation Plan

1. Record the approved evergreen-browser policy and Tailwind CSS 4 direction in
   affected project documentation.
2. Baseline the broken Alert and define the finite component/state/browser
   matrix for shared primitives, critical pages, themes, focus, overlays, and
   mobile widths.
3. Inventory dependency, PostCSS, global stylesheet, `components.json`, theme
   configuration, and all shipped frontend Tailwind usage against the Tailwind
   CSS 4 upgrade contract and breaking-change list.
4. Run the official Tailwind upgrade tool in the feature branch as a migration
   baseline, inspect the full diff, and retain only reviewed in-scope changes.
5. Apply one coherent migration: Tailwind CSS 4 and
   `@tailwindcss/postcss`, CSS-first imports and theme mappings, class-based dark
   mode, Tailwind CSS 4 `components.json`, dependency cleanup, and the lockfile.
6. Reconcile renamed or behavior-changing utilities across shared primitives
   and shipped feature surfaces. Preserve semantic variant/token ownership and
   use shadcn CLI dry-run/diff rather than bulk overwrite.
7. Add focused production-CSS probes, component/accessibility tests, and the
   Playwright Chromium/Firefox/WebKit compatibility suite. Extend critical live
   workflow smoke only where the migration changes credible rendered behavior.
8. Update affected setup, browser-support, validation, and roadmap
   documentation with the selected contract and verified limitations.
9. Run the post-implementation review gate before final authoritative
   validation.

## Validation Contract

| Guarantee | Required evidence |
|---|---|
| Dependency and CSS contract is coherent | clean install, frontend build, generated CSS inspection |
| Tailwind CSS 3 contract is fully removed | dependency/configuration/source inventory plus generated CSS and diff review |
| Shared primitives render their assigned states | finite matrix, component tests, and compiled-browser computed-style or visual checks |
| Alert layout is responsive | desktop and narrow viewport evidence in Chromium, Firefox, and WebKit |
| Current browser engines compile and render the compatibility probes | production-build Playwright compatibility suite on Chromium, Firefox, and WebKit |
| Themes and semantic variants remain usable | light/dark contrast, hover, focus, disabled, destructive/warning/success state review |
| Shipped feature surfaces preserve intended presentation | landing/auth/app-shell/workspace/project/task/overlay browser probes mapped to affected migration semantics |
| Existing workflows are not regressed | frontend unit/type/lint/build gates and critical live auth/workspace/project/task smoke |

Mocked browser evidence alone is insufficient for CSS compilation or runtime
layout. Required live evidence must use the production-shaped frontend build or
the same PostCSS/Tailwind pipeline.

## Post-Implementation Review Gate

Before final validation, review the diff for:

- mixed Tailwind 3/4 syntax or configuration left behind
- Tailwind CSS 4 breaking semantics inspected only in shared primitives while
  shipped feature consumers remain unchecked
- raw semantic color recipes added outside shared ownership
- unsupported browser assumptions
- source-class assertions presented as rendered evidence
- exact minimum-version claims presented as proven by current Playwright engines
- unreviewed upgrade-tool output or shadcn component overwrites
- accidental React, Next.js, Base UI, icon-library, or unrelated dependency
  upgrades
- unrelated dependency or component churn

Resolve in-scope findings, rerun affected checks, and re-plan if the migration
requires a wider component rewrite or browser-support change.

## Rollback and Forward Fix

- Treat Tailwind/shadcn dependency changes, PostCSS integration, global
  CSS/theme, `components.json`, migrated utility semantics, shared primitive
  fixes, and their lockfile entries as one atomic compatibility rollback
  boundary.
- Separate commits are allowed only when every intermediate commit remains
  buildable and uses one coherent Tailwind contract. Otherwise revert the
  reviewed commit range as a unit; never revert dependency/configuration while
  leaving Tailwind CSS 4 source or theme mappings behind.
- Dependency resolutions added for security remediation are outside the
  compatibility rollback boundary. Preserve them during a selective rollback,
  or immediately reapply them in a security-only commit and rerun the
  dependency audit before merge or deployment. A full commit-range revert is
  incomplete until those remediations have been restored and verified.
- If Tailwind CSS 4 fails the approved evergreen-browser contract, revert the
  complete compatibility boundary and re-plan before attempting a pinned
  Tailwind CSS 3 alternative.
- A localized primitive regression may be forward-fixed only when the global
  compatibility contract remains valid and validation can prove containment.

## Dependencies

- completed frontend auth/app-shell and task foundation slices
- approved modern evergreen-browser policy and Tailwind CSS 4 direction
- existing frontend unit, component, E2E, and live E2E harnesses

## Re-plan Conditions

- product requirements change to include legacy, end-of-life, or otherwise
  Tailwind CSS 4-incompatible browsers
- migration requires a new component library or broad visual redesign
- migration requires a React, Next.js, Base UI, or unrelated runtime major
  upgrade
- focused current-engine coverage cannot be added without materially changing
  CI cost, runtime, or ownership
- validation reveals API/auth behavior changes rather than presentation-only
  changes

## Follow-up

- [Frontend Recovery and App-Shell Copy Consistency](frontend-recovery-app-shell-copy-consistency.md)
- keep new feature UI on the centralized semantic variant/token contract
- treat broader visual redesign as a separate plan

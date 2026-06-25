# WorkSync Frontend Profile

This file defines WorkSync-specific frontend implementation choices. Reusable frontend guidance remains in `skills/engineering/implementation/frontend-patterns/SKILL.md`.

## Framework and Styling

- Use Next.js App Router.
- Use TypeScript strict mode.
- Prefer Server Components when interaction, browser APIs, or client effects are not required.
- Introduce Client Components deliberately and keep their boundary narrow.
- Use Tailwind CSS with project design tokens and CSS variables.

## UI Component Standards

Use shadcn/ui as the primary UI component library.

Rules:

- Prefer existing shadcn/ui components before creating custom components.
- Do not build custom Button, Input, Select, Checkbox, Radio, Dialog, Sheet, Tabs, Table, Badge, Card, Tooltip, Popover, Dropdown Menu, Form, or Alert components when an equivalent shadcn/ui component exists.
- Extend shadcn/ui components through composition rather than rewriting them.
- Before creating any new UI component, check whether an equivalent shadcn/ui component already exists.

## Interactive Controls

- Use shadcn/ui `Button` for button actions unless a feature has a documented reason not to.
- Keep primary, secondary, destructive, outline, ghost, and link-style actions aligned with the shared button variants.
- Every actionable control must have visible hover, focus, active or pressed, disabled, and loading states.
- Async buttons must prevent duplicate submission and show processing feedback.
- User-triggered actions must show clear success or error feedback when the outcome is not otherwise obvious.
- Disabled actions must look disabled, ignore hover and click behavior, and explain unavailability when the reason is not obvious.
- Icon-only buttons must have an accessible name.
- Mobile controls must keep usable hit areas and readable contrast across all states.
- Do not create a custom button primitive unless shadcn/ui cannot support the required behavior through composition.

## Design System

- All colors must come from the project's design tokens and CSS variables.
- Do not hardcode colors, spacing, border radius, shadows, or typography values when a project token exists.
- Use Tailwind utility classes that reference design tokens.
- Maintain consistent spacing, sizing, and typography throughout the application.

## Styling

- Keep styling centralized.
- Global visual changes should be achievable by updating design tokens, theme variables, or shared components.
- Avoid component-specific visual overrides unless required by a feature.
- Prefer token-backed Tailwind utilities over ad hoc inline styles.

## Reusable Components

When a UI pattern appears more than once:

1. Extract it into a shared component.
2. Reuse the shared component everywhere.
3. Do not duplicate JSX structures across pages.

## Custom Components

Only create custom components when:

- no suitable shadcn/ui component exists
- the feature requires domain-specific behavior
- the component composes multiple shadcn/ui primitives into a reusable business component

Introducing a custom primitive component requires explicit justification in the component documentation, adjacent code comment, or implementation notes for the change.

## Consistency

The application must behave as a single design system.

Users should not be able to distinguish whether a screen was built on a different day, by a different engineer, or by a different AI session.

## Completion Checks

Before completing frontend UI work:

- confirm selected components came from shadcn/ui when available
- confirm custom primitives have a documented justification
- confirm repeated patterns were extracted or intentionally kept local because they appear only once
- confirm colors, spacing, radius, shadows, and typography use project tokens where available
- confirm UI states remain accessible, responsive, and consistent with the existing design system

> [!warning] TO MIGRATE
> This file belongs in `parkhub/frontend` as `DESIGN.md` at the repo root — not in the Lotus repo. Copy it there and delete this file once merged.

# Lotus — Web Platform Guidance

Platform-specific implementation guidance for the web surfaces (luna, solar, terra, b2b, pay). Read alongside the root `DESIGN.md` (token values and brand intent).

## Design philosophy

Unlike iOS and Android, web has no opinionated native component framework to defer to. Lotus *is* the component layer for JustPark web, delivered through `@justpark/ui` in `parkhub/frontend`. Use the component library first; extend it before building new.

## How to apply Lotus tokens

**Colour**
Import from the semantic layer: `@use 'colors' as colors;` then reference `colors.$text-primary`, `colors.$action-primary-default` etc.

Never import `_lotus-generated.scss` directly — it is a generated file and the references will break when tokens are regenerated. Always go through the semantic layer (`_colors.scss`).

**Spacing**
Use spacing tokens: `spacing.$xs`, `spacing.$s`, `spacing.$m` etc.

**Radius**
Use radius tokens: `radius.$sm`, `radius.$md`, `radius.$full`.

**Typography**
Typography tokens are not yet available in the Lotus web SCSS (Phase 1 gap). Until they are, use the `@justpark/ui` typography components rather than setting `font-size` and `font-weight` directly. When the typography token file ships, migrate.

## Component library

Before building a new component, check `@justpark/ui`:
1. Does a component already exist that does this?
2. Can an existing component be extended or composed?
3. Only build new if both answers are no.

New components must be added to `@justpark/ui`, not built locally in a surface.

## Token conventions

New component SCSS must follow these rules:
- No hardcoded hex values
- No hardcoded `px` values (except `0`)
- No direct font-size or font-weight declarations — use `@justpark/ui` type components or, when available, typography tokens
- All colour, spacing, and radius references through the semantic token layer

Legacy files (`_jpColors.scss`, the colour section of root `_variables.scss`) are being phased out. Do not import them in new component work.

## CSS custom properties and theming

Lotus web tokens expose CSS custom properties for runtime theming (e.g. partner white-labelling). The pattern is:

```scss
$text-primary: var(--lotus-text-primary, #{gen.$lotus-gen-text-primary});
```

The fallback value handles Server-Side Rendering (SSR) and static rendering. CSS variable overrides work at runtime post-hydration. If your surface uses SSR, test that the fallback value is correct — the override won't apply until client-side JavaScript hydrates.

## Rules for AI agents

- Never hardcode a hex colour value — use a Lotus SCSS semantic token.
- Always import from the semantic layer (`_colors.scss`), not the generated layer (`_lotus-generated.scss`).
- Never hardcode a `px` value for spacing or radius — use tokens.
- Check `@justpark/ui` before building a new component.
- Token files in `parkhub/lotus` are read-only. If a token value needs to change, tell the user to run `lotus-dsm`.
- TBC values in the root `DESIGN.md` front matter are unconfirmed. Do not ship components depending on them.
- If you encounter an import of `_jpColors.scss` or `_variables.scss` colour section, flag it — these are legacy and should be migrated.

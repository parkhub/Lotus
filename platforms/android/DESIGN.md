# Lotus — Android Platform Guidance

Platform-specific implementation guidance for Android. Read alongside the root `DESIGN.md` (token values and brand intent).

## Design philosophy

Prefer Material Design 3 (Material You) components. Do not recreate Material primitives from scratch. Apply Lotus tokens through `LotusTheme.kt` — this sets `MaterialTheme.colorScheme` and `MaterialTheme.typography` from Lotus values, so all M3 components automatically reflect the JustPark design language.

Trust the platform for motion, elevation, and ripple behaviour. Lotus controls colour, spacing, radius, and typography.

## How to apply Lotus tokens

**Colour**
Wrap every screen in `LotusTheme { ... }`. Access colours via `MaterialTheme.colorScheme.primary`, `.surface` etc. — the `LotusTheme` wrapper sets these from Lotus token values. Do not access `LotusTokens.Color` directly from composable code.

**Spacing**
Use `LotusTheme.spacing.xs`, `.s`, `.m` etc. via the `CompositionLocal` provided by `LotusTheme`. Do not hardcode `dp` values.

**Typography**
Use `MaterialTheme.typography.headlineLarge`, `.bodyMedium` etc. — `LotusTheme` configures these from Lotus type tokens. Do not use `TextStyle(fontSize = ...)` with hardcoded values.

**Radius**
Use `MaterialTheme.shapes.small`, `.medium`, `.large` — `LotusTheme` maps these to Lotus radius tokens.

**Do not use**
- `LotusTokens` directly in composable code
- `Color.White`, `Color.Black`, or any hardcoded `Color(0xFF...)` values
- `JpColor` (V1 legacy) for any new work

## Component guidance

**Navigation**
Use `NavigationBar`, `NavigationRail`, or `ModalNavigationDrawer`. `LotusTheme` handles the colour scheme. Do not build custom navigation components.

**Lists**
Use `LazyColumn` / `LazyRow`. Apply Lotus spacing tokens (`LotusTheme.spacing`) to item padding and content padding.

**Buttons**
Use `Button`, `FilledButton`, `OutlinedButton`, `TextButton`. `LotusTheme` provides the correct colours. Match button hierarchy to the Lotus colour intent — `action-primary` for primary CTAs.

**Dialogs**
Use `AlertDialog` or `BasicAlertDialog`. Apply `LotusTheme` surface and text colours to custom content.

**Bottom sheets**
Use `ModalBottomSheet`. Apply Lotus surface tokens to the container.

**Cards**
Use `Card` or `ElevatedCard`. `LotusTheme` sets surface and container colours. Apply Lotus radius and spacing tokens to content layout.

## XML Views (legacy)

The app uses both Jetpack Compose and XML Views. For XML, reference `@color/lotus_*` tokens from `lotus_colors.xml` (generated). Do not reference `@color/jp_color_*` (V1 legacy) in new XML layouts.

## What Lotus controls

Colour palette (mapped to M3 colour roles via `LotusTheme`), typography scale, spacing, corner radius.

## What the platform controls

Elevation and shadow system, ripple and state-layer behaviour, motion and animation, accessibility semantics, system font scaling.

## V1 → V2 migration

`JpColor` and `JpTextStyle` (V1) are legacy. New composables must use `MaterialTheme` via `LotusTheme`. When touching an existing composable that still uses V1, migrate it as part of the same PR — do not leave V1 references in files that otherwise use V2.

## Rules for AI agents

- Always wrap screens in `LotusTheme` before applying any Lotus colour or typography.
- Access tokens through `MaterialTheme` or the Lotus composition locals. Never import `LotusTokens` directly in composable code.
- Never use `Color.White`, `Color.Black`, or hardcoded `Color(0xFF...)` — use `MaterialTheme.colorScheme` equivalents.
- Never use V1 tokens (`JpColor`, `JpTextStyle`) in new or modified composables.
- Do not hardcode `dp` values — use `LotusTheme.spacing`.
- Token files in `parkhub/lotus` are read-only. If a token value needs to change, tell the user to run `lotus-dsm`.
- TBC values in the root `DESIGN.md` front matter are unconfirmed. Do not ship components depending on them.

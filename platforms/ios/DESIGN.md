> [!warning] TO MIGRATE
> This file belongs in `parkhub/ios` as `DESIGN.md` at the repo root — not in the Lotus repo. Copy it there and delete this file once merged.

# Lotus — iOS Platform Guidance

Platform-specific implementation guidance for iOS. Read alongside the root `DESIGN.md` (token values and brand intent).

## Design philosophy

Prefer native SwiftUI and UIKit components. Do not recreate platform primitives from scratch. The JustPark design language — Lotus — is applied *on top of* native components via the adapter layer, not instead of them.

Trust the platform for behaviour, motion, and accessibility. Lotus controls colour, spacing, radius, and typography.

## How to apply Lotus tokens

All token references go through the adapter layer in `parkhub/ios`. Never import `LotusGeneratedColors`, `LotusTokens`, or any generated file directly from component code.

**Colour**
Use `LotusColor.actionPrimary`, `LotusColor.textPrimary` etc. from `LotusColorAdapter.swift`.

**Spacing**
Use `LotusSpacing.xs`, `.s`, `.m` etc. from `LotusSpacingAdapter.swift`.

**Typography**
Use `LotusFont.h1`, `.bodyLarge`, `.caption` etc. from `LotusTypographyAdapter.swift`.

**Radius**
Use `LotusRadius.sm`, `.md`, `.full` from the adapter.

## Component guidance

**Navigation**
Use `NavigationStack` or `NavigationSplitView`. Style the navigation bar with Lotus surface and text tokens. Do not build custom navigation containers.

**Lists and scroll views**
Use `List` with Lotus-token row styling. For custom layouts, use `LazyVStack` inside `ScrollView`. Avoid wrapping a `List` inside another scroll view.

**Buttons**
Apply `LotusButtonStyle` (or equivalent) conformance to native `Button`. Do not build a button view from scratch unless the design requires something `Button` genuinely cannot accommodate.

**Sheets and modals**
Use `.sheet`, `.fullScreenCover`, or `.confirmationDialog`. Apply Lotus background and text tokens to the presented content.

**Forms and inputs**
Use `Form` and `Section` for settings-style layouts. Style `TextField` and `SecureField` with Lotus border, surface, and text tokens.

**Cards**
There is no native SwiftUI card component — use a `VStack` or `HStack` in a `RoundedRectangle` clip shape with `LotusRadius.md` and `LotusColor.surfaceDefault`. Apply `LotusSpacing.l` internal padding as a default.

## What Lotus controls

Colour, spacing, radius, typography weight and scale, brand iconography.

## What the platform controls

Navigation patterns, gesture behaviour, animation curves and spring parameters, haptic feedback, accessibility semantics, Dynamic Type scaling, system font fallback.

## Dynamic Type

Lotus typography tokens define base sizes. All text must respect Dynamic Type — do not set `.fixedSize()` on text that carries meaning. Use `.minimumScaleFactor` only as a last resort for single-line labels where truncation would be worse.

## Rules for AI agents

- Prefer SwiftUI native components. Only build custom if the native component genuinely cannot meet the requirement — and flag the reason to the user.
- Apply all Lotus tokens through the adapter layer. Never import `LotusGeneratedColors` or any file with `Generated` in its name from component code.
- When a native component's default styling conflicts with a Lotus token, apply the token. Do not override platform behaviour to do it.
- Do not hardcode any colour, spacing, radius, or font value. If no Lotus token matches, flag it — do not invent a value.
- Token files in `parkhub/lotus` are read-only. If a token value needs to change, tell the user to run `lotus-dsm`.
- TBC values in the root `DESIGN.md` front matter are unconfirmed. Do not ship components depending on them.

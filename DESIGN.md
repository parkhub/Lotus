---
version: alpha
name: Lotus
description: JustPark's design system — web, iOS, Android. Single source of token truth.

colors:
  # Primitives — all values confirmed from Figma AI Version file (2026-04-25).
  # Names mirror Figma variable names exactly (slash → hyphen, lowercase).
  green-500: "#23A437"
  green-400: "#C0E7C7"
  green-300: "#DAF1DE"
  green-50:  "#F0F9F2"

  grey-900: "#000000"
  grey-850: "#212830"
  grey-800: "#2E3642"
  grey-700: "#384250"
  grey-500: "#6E7782"
  grey-400: "#A8ADB3"
  grey-300: "#DFE1E4"
  grey-100: "#F0F1F4"
  grey-50:  "#F6F6F8"
  grey-0:   "#FFFFFF"

  red-500: "#FB3C59"
  red-50:  "#FEF2F6"

  yellow-500: "#FABA0C"
  yellow-50:  "#FEF9EC"

  blue-500: "#41A4EC"
  blue-50:  "#EBF5FE"

  # Semantics — reference primitives; never hardcode hex in component code
  primary: "{colors.green-500}"
  action-primary: "{colors.primary}"
  action-primary-hover: "{colors.green-400}"

  text-primary: "{colors.grey-700}"
  text-secondary: "{colors.grey-500}"
  text-disabled: "{colors.grey-400}"
  text-inverse: "{colors.grey-0}"
  text-on-action: "{colors.grey-0}"

  surface-default: "{colors.grey-0}"
  surface-subtle: "{colors.grey-50}"
  surface-muted: "{colors.grey-100}"

  border-default: "{colors.grey-300}"
  border-strong: "{colors.grey-500}"

  alert-error-fg: "{colors.red-500}"
  alert-error-bg: "{colors.red-50}"
  alert-success-fg: "{colors.green-500}"
  alert-success-bg: "{colors.green-50}"
  alert-info-fg: "{colors.blue-500}"
  alert-info-bg: "{colors.blue-50}"
  alert-promo-fg: "{colors.yellow-500}"
  alert-promo-bg: "{colors.yellow-50}"

  # Brand semantics — distinct from action tokens (action = CTA affordance; brand = identity/surface)
  brand-primary: "{colors.green-500}"
  brand-secondary: "{colors.yellow-500}"
  surface-brand: "{colors.yellow-500}"       # Hero/banner background for brand-coloured surfaces

  # Partner theming — the ONLY tokens Storyblok may override per partner.
  # Core semantic tokens above are never touched by partner themes.
  # Components opt in to theming by referencing partner-* tokens explicitly.
  # Locked by default: all components referencing core tokens are unaffected by partner overrides.
  #
  # Storyblok field mapping:
  #   brandPrimary          → partner-brand-primary
  #   Image Overlay Start   → partner-brand-secondary
  #   Image Overlay End     → partner-brand-primary
  #   Surface Brand         → partner-surface
  #   On Brand Primary      → partner-on-brand
  #   Text Primary          → partner-text-primary
  #   Text Secondary        → partner-text-secondary
  #   Text Inverse Primary  → partner-text-inverse-primary
  #   Text Inverse Secondary→ partner-text-inverse-secondary
  partner-brand-primary: "{colors.brand-primary}"
  partner-brand-secondary: "{colors.brand-secondary}"
  partner-surface: "{colors.surface-brand}"
  partner-on-brand: "{colors.text-on-action}"
  partner-text-primary: "{colors.text-primary}"
  partner-text-secondary: "{colors.text-secondary}"
  partner-text-inverse-primary: "{colors.text-inverse}"
  partner-text-inverse-secondary: "{colors.text-inverse}"

spacing:
  # Canonical scale — iOS xxxl corrected from 70 to 80 in Phase 0.
  # iOS-only steps (semiSmall=10, xMedium=20) are not in the shared scale.
  xs: 4px
  s: 8px
  m: 12px
  l: 16px
  xl: 24px
  xxl: 32px
  xxxl: 48px
  xxxxl: 80px

rounded:
  # iOS radiusFull corrected from 32 to 999 in Phase 0.
  none: 0px
  xs: 2px
  sm: 4px
  md: 8px
  lg: 12px
  xl: 16px
  full: 999px

typography:
  # Canonical weights from Figma. iOS h1 corrected from Bold (700) to SemiBold (600) in Phase 0.
  # iOS h2 corrected from 23px to 24px in Phase 0.
  # Web font corrected from "Nunito" to "Nunito Sans" in Phase 0.
  h1:
    fontFamily: Poppins
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.2
  h2:
    fontFamily: Poppins
    fontSize: 24px
    fontWeight: 300
    lineHeight: 1.3
  h3:
    fontFamily: Poppins
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.3
  body-large:
    fontFamily: Nunito Sans
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  body-large-bold:
    fontFamily: Nunito Sans
    fontSize: 16px
    fontWeight: 700
    lineHeight: 1.5
  body-medium:
    fontFamily: Nunito Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  body-medium-bold:
    fontFamily: Nunito Sans
    fontSize: 14px
    fontWeight: 700
    lineHeight: 1.5
  body-small:
    fontFamily: Nunito Sans
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  body-small-bold:
    fontFamily: Nunito Sans
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1.4
  caption:
    fontFamily: Nunito Sans
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.4
  micro:
    fontFamily: Nunito Sans
    fontSize: 10px
    fontWeight: 400
    lineHeight: 1.4
---

## Overview

Lotus is JustPark's cross-platform design language — a single visual system for web apps (luna, solar, terra, b2b, pay), the iOS app, and the Android app.

The palette is built around one confident green (the JustPark mark) set against a quiet neutral scale. Poppins handles display and headings; Nunito Sans handles all body and UI text. Spacing and radius are shared across all three platforms — the same value produces the same visual result everywhere.

This file is the canonical source of truth. `tokens.json` is generated from the YAML front matter above; do not edit it directly. Platform-specific implementation guidance lives in each platform's own repo root (`parkhub/ios/DESIGN.md`, `parkhub/android/DESIGN.md`, `parkhub/frontend/DESIGN.md`) — not in this repo. The `platforms/` directory in this repo is a temporary migration staging area and will be removed once those files are placed in their destination repos.

## Colors

The green rests on JustPark's brand heritage — confident, clear, not aggressive. The neutral scale is warm-grey rather than blue-grey, keeping the interface approachable. The single brand colour carries all primary actions; no competing accent colours.

Alert semantics follow conventional patterns (red=error, green=success, blue=info, amber=promo) so they carry meaning without relying on Lotus knowledge.

## Typography

Two typefaces, two roles. Poppins is used only for headings — its geometric weight gives display text character without being decorative. Nunito Sans handles everything else; it is highly legible at small sizes and works well at the range of densities JustPark's UIs require.

Type scale values are set from Figma as the design authority. iOS and Android adapt point sizes to their platform conventions via the adapter layer; the semantic names and visual intent are shared.

## Layout

An 8-point grid underpins all three platforms. The scale is intentionally simple — gaps between values are large enough to be meaningfully different in layouts.

## Elevation & Depth

Lotus uses a flat visual hierarchy — no shadows or blurs. Depth is conveyed through colour contrast and surface layering: `surface-default` (white) sits on `surface-subtle` or `surface-muted` backgrounds; borders (`border-default`, `border-strong`) define container edges. This keeps the interface crisp across web, iOS, and Android without platform-specific shadow implementations.

## Shapes

Full-radius (pills, badges, tags) uses 999px rather than 50% to avoid oval distortion on non-square containers.

## Rules for AI agents

- Never hardcode a hex value. Use a semantic Lotus token via the correct platform reference.
- Never reference a primitive (`colors.green-500`) from component code. Use the semantic alias (`colors.action-primary`).
- When no token matches a design requirement, flag it to the user. Do not invent a value.
- Token files are read-only. Only `lotus-dsm` may modify `DESIGN.md` or `tokens.json`.
- For platform-specific component guidance, read the relevant `platforms/*/DESIGN.md` file alongside this one.
- Values marked TBC in the front matter have not been confirmed from Figma. Do not ship components that depend on them without first resolving the TBC.
- Partner theming: components that should respond to partner themes must reference `partner-*` tokens. Components referencing core tokens are locked by default and must never be switched to `partner-*` tokens without an explicit design decision. When building a new component, default to core tokens — only use `partner-*` if the component is explicitly in the partner-themeable list (buttons, listing cards, tags, Storyblok sections).

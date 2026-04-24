# Lotus

JustPark's cross-platform design system — web, iOS, Android.

## Structure

| File | Purpose |
|------|---------|
| `DESIGN.md` | Source of truth. Token values (YAML front matter) + brand rationale (prose). |
| `platforms/ios/DESIGN.md` | iOS implementation guidance — native-first, adapter pattern. |
| `platforms/android/DESIGN.md` | Android implementation guidance — Material 3 + LotusTheme. |
| `platforms/web/DESIGN.md` | Web implementation guidance — `@justpark/ui` + SCSS token layer. |
| `design-tokens/tokens.json` | Generated from `DESIGN.md` front matter. Do not edit directly. |

## Using Lotus in your repo

Point your AI tooling (Claude, Cursor) at two files:

- Root `DESIGN.md` — what the tokens are and why
- Your platform's `platforms/*/DESIGN.md` — how to use them

## Changing token values

Token values live in the YAML front matter of `DESIGN.md`. Use `lotus-dsm` to make changes — it validates, diffs, and opens a PR. Do not hand-edit the front matter or `tokens.json`.

## CI

Every pull request lints `DESIGN.md` with `@google/design.md lint` — schema validation, broken token references, and WCAG contrast checks.

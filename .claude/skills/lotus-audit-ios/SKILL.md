---
name: lotus-audit-ios
description: >
  Run a fresh audit of the iOS Lotus design system implementation against the
  canonical Figma source of truth. Compares Figma variables (colour, padding,
  radius) to the iOS Swift token definitions and asset catalog, scans the iOS
  app for hardcoded values vs token usage, and writes a dated Markdown report
  to a repo-relative path by default (`audits/ios/YYYY-MM-DD.md`, gitignored).
  Use this skill when the user says `/lotus-audit-ios`, asks to "audit Lotus
  on iOS", "run a fresh iOS Lotus audit", "check Lotus adoption", or
  "regenerate the iOS Lotus audit". One-shot per run; no background scheduling.
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - Write
  - Edit
---

# Lotus iOS Audit

## Purpose

Generate an iOS Lotus design system audit report. The report answers two
questions:

1. **Token parity** — does the iOS Lotus implementation (`parkhub/ios/Lotus/`)
   match the canonical Figma source of truth (the Lotus design system file)?
2. **Adoption** — how much of the iOS app actually uses Lotus tokens vs
   hardcoded literals or legacy colour systems? Broken down per flow and
   per screen.

Output is a dated Markdown file. Every run produces a new file — never
overwrite previous audits. See **Output destinations** below for path resolution.

## Output destinations

The skill resolves three independent destinations, in this priority:

1. **Primary path** (always written):
   - If the user passes `--out <path>` → that exact path.
   - Else: `<lotus-repo-root>/audits/ios/YYYY-MM-DD.md`. The Lotus repo root
     is the directory three levels up from this `SKILL.md` file. The
     `audits/` directory is gitignored — generated reports don't pollute
     git history. To preserve a milestone audit in history, the user can
     `git add -f audits/ios/<file>.md` deliberately.

2. **Mirror copy** (optional, written *in addition* to primary):
   - If the env var `LOTUS_AUDIT_MIRROR` is set and points at an existing
     directory, write a second copy to `${LOTUS_AUDIT_MIRROR%/}/YYYY-MM-DD.md`.
   - This is the path users set in their shell rc to also pipe audits into a
     personal knowledge system — Obsidian, Notion via webhook, Slack via
     drop folder, etc. Empty / unset = no mirror.

3. **Index update** (optional, only if mirror is in an Obsidian vault):
   - If `LOTUS_AUDIT_MIRROR` resolves under
     `~/Documents/Olly's Brain/Areas/JustPark/Projects/Lotus/Audits/`, also
     append a wikilink to that vault's `_Index.md`. This is Olly-specific
     vault wiring and stays opt-in via the env var.

If the same date already has an audit at the primary path, suffix with `-2`,
`-3`, etc. before writing.

## Source of truth

Figma is the only source of truth for token values. The Lotus monorepo's
`DESIGN.md` is **not** authoritative for this audit (it's a future cross-platform
abstraction). The audit pulls live token data from Figma every run.

Figma file: <https://www.figma.com/design/YkS9s6Cz3EYdbr5UThzUKP/Lotus---Design-System>

## Prerequisites

Verify all four BEFORE starting any phase. If any fails, surface the problem
and stop — do not attempt workarounds.

1. **Figma Desktop running.** Check via `cd ~/figma-cli && node src/index.js status`.
   Expected output: `Connected to Figma`. If not connected, ask the user to
   open Figma Desktop.

2. **Lotus design system file is the FOCUSED tab in Figma.** This is critical —
   `figma-ds-cli` operates on whatever file is currently focused. **Stop and ask
   the user to confirm:**

   > "Have you opened the Lotus design system file and made it the focused tab
   > in Figma Desktop? Reply 'yes' to continue, or 'no' if you need a moment."

   Wait for explicit `yes`. Do not assume.

3. **figma-cli installed at `~/figma-cli/`.** Check
   `[ -f "$HOME/figma-cli/src/index.js" ]`. If missing, abort with instructions
   to install.

4. **`parkhub/ios` cloned locally.** Default expected path: `$HOME/code/ios`.
   If absent, ask the user for the path or offer to clone:
   `gh repo clone parkhub/ios $HOME/code/ios`. Store the resolved path in a
   shell variable `IOS_REPO` for the rest of the run.

## Phase 1 — Fetch canonical Figma tokens

Run the fetch script. It uses figma-cli to evaluate JS in Figma's plugin
context, walks aliases, and writes resolved JSON.

```bash
node "$SKILL_DIR/scripts/fetch-figma-tokens.mjs" /tmp/lotus-figma-tokens.json
```

Where `$SKILL_DIR = parkhub/Lotus/.claude/skills/lotus-audit-ios/` (the
directory of this SKILL.md).

If the script exits non-zero:

- Most likely cause: Lotus tab not focused, or figma-cli connection broken.
- Re-prompt the user, ask them to confirm the Lotus tab is focused, retry once.
- If retry fails, abort and surface the error to the user.

Read `/tmp/lotus-figma-tokens.json`. The structure (current as of 2026-05-07):

| Collection | Vars | Modes |
|-----------|------|-------|
| `Colour (Primitives)` | 48 | 1 (Mode 1) |
| `Colour` | 71 | 2 (Light Mode, Dark Mode) — semantic, aliases primitives |
| `Padding` | 11 | 1 |
| `Corner Radius` | 7 | 1 |

Notes about Figma's structure:

- The semantic `Colour` collection uses `VARIABLE_ALIAS` references into
  `Colour (Primitives)`. The fetch script walks these aliases — every value
  in the output is already resolved to its hex string.
- **Figma has no Typography variables.** Type styles in Figma live under
  Text Styles, not Variables. The audit will flag this as a parity gap
  (iOS has 20 named type styles in `LotusTypography.swift`).

## Phase 2 — Read iOS Lotus token definitions

Read these files from `$IOS_REPO/Lotus/Sources/Lotus/`:

- `LotusColours.swift` — semantic colour aliases pointing into asset catalog.
  Names follow the pattern `LotusColours.<Group>.<token>` (e.g. `Brand.justparkGreen`,
  `Action.primaryDefault`, `Alerts.Error.background`).
- `LotusTypography.swift` — `Font` and `UIFont` style constants
  (e.g. `bodyMedium`, `h2Poppins`).
- `LotusSpacing.swift` — `CGFloat` constants
  (e.g. `spacingSmall = 12`, `spacingMedium = 16`).
- `LotusCorners.swift` — `CGFloat` constants
  (e.g. `radiusSmall = 8`, `radiusFull = 32`).

Then read the asset catalog for actual hex values:

- `Lotus/Sources/Lotus/Assets.xcassets/Lotus-Colour-Pallet/**/Contents.json`

Each `Contents.json` defines a colorset with light + dark appearance entries.
Components are `red`/`green`/`blue` floats (0–1) typically in Display P3 colour
space — note that for the audit. Convert to sRGB hex for comparison
with Figma (Figma values are sRGB).

Conversion approximation: `hex = round(component × 255)` per channel, then
format as `#RRGGBB`. For high-precision use, flag colours where the conversion
introduces visible drift (>2 units per channel in sRGB).

Parse all four sources into a single in-memory iOS-side structure:

```text
{
  colours: [
    { swift: "LotusColours.Brand.justparkGreen", asset: "Brand.JustparkGreen",
      light: "#23A437", dark: "#23A437" },
    ...
  ],
  typography: [{ swift: "LotusTypography.bodyMedium", family: "Nunito Sans",
                 size: 16, weight: 400 }, ...],
  spacing: [{ swift: "LotusSpacing.spacingMedium", value: 16 }, ...],
  radius: [{ swift: "LotusCorners.radiusSmall", value: 8 }, ...]
}
```

## Phase 3 — Diff Figma vs iOS (token parity)

Build a name-mapping between Figma names and Swift names. The two systems use
different conventions:

| Figma name | iOS Swift convention |
|-----------|---------------------|
| `Colour (Primitives) → Green/500` | `LotusColours.Brand.justparkGreen` (semantic, no direct primitive surface) |
| `Colour → Brand/Primary` | `LotusColours.Brand.justparkGreen` |
| `Colour → Text/Primary` | `LotusColours.Text.primary` |
| `Colour → Action-App/Primary-Default` | `LotusColours.Action.primaryDefault` |
| `Padding → padding-m` | `LotusSpacing.spacingMedium` |
| `Corner Radius → radius-s` | `LotusCorners.radiusSmall` |

Use a fuzzy match (path tail + word similarity) and let unmatched entries
surface as "missing in iOS" or "extra in iOS".

For each matched pair compute:

- **Match** — values agree in all modes (light + dark for colours).
- **Mismatch** — names match but value differs. Report Figma value, iOS
  value, delta.
- **Missing in iOS** — Figma has it, iOS doesn't.
- **Extra in iOS** — iOS has it, Figma doesn't.

Known issues (from prior audits — re-validate every run):

- `radius-full` Figma = `999`, iOS `LotusCorners.radiusFull` = `32`.
- `Action-App/Primary-Default` may resolve differently from `Brand/Primary`
  in Figma — confirm whether iOS `Action.primaryDefault` matches the brand
  green or has drifted.
- `h2PoppinsLight` is `23pt` on iOS — Figma's H2 size is `24pt`. Typography
  is not in Figma variables, but the values in the existing audit can be
  used as the reference.

Build a token parity table (one row per Figma token).

## Phase 4 — Scan iOS app for adoption

Scan these paths in `$IOS_REPO`:

```
JustPark/Screens/**/*.swift
JustPark/Shared/**/*.swift
Shared/**/*.swift
Frameworks/**/*.swift
Widget/**/*.swift
NotificationsContent/**/*.swift
NotificationsService/**/*.swift
JPIntents/**/*.swift
```

Exclude:

```
Lotus/                                  ← the design system itself
*Tests/                                 ← unit + UI tests
Ampli/                                  ← generated analytics code
JustPark/Screens/Debug/Lotus/           ← in-app showcase, uses tokens by design
```

Use `rg` (ripgrep) for speed. Aggregate counts per file.

### Patterns — compliant uses (count as "tokenised")

- `LotusColours\.[A-Z][A-Za-z]+\.[a-z][A-Za-z]+`
- `LotusTypography\.[a-z][A-Za-z]+`
- `LotusSpacing\.spacing[A-Z][A-Za-z]+`
- `LotusCorners\.radius[A-Z][A-Za-z]+`

### Patterns — non-compliant uses (count as "violations", flag with file:line)

**Hardcoded colours:**

```
UIColor\(red:\s*[0-9.]+,\s*green:
UIColor\(white:\s*[0-9.]+
UIColor\.(white|black|systemGray|systemRed|systemBlue|systemGreen|systemYellow|systemOrange)
Color\(red:\s*[0-9.]+,\s*green:
Color\(\.system[A-Z]
\.(foregroundColor|foregroundStyle|background|tint)\(\.(white|black|gray|red|blue|green|yellow|orange)\)
UIColor\(fromHexString:
Color\(hex:
```

**Legacy colour systems:**

```
\.jp[A-Z][A-Za-z0-9]+        ← UIColor+JP.swift legacy palette (50 colours)
UIColor\.Semantic\.            ← UIColor+Design2.0.swift intermediate
UIColor\.Primitive\.           ← UIColor+Design2.0.swift intermediate
```

**Hardcoded fonts:**

```
Font\.system\(size:
Font\.custom\(
UIFont\.systemFont\(ofSize:
UIFont\(name:.+size:
```

**Hardcoded spacing** (exclude literal `0` and `1` — those are not tokens):

```
\.padding\(\s*[2-9][0-9]*(\.[0-9]+)?\s*\)
\.padding\(\.[a-z]+,\s*[2-9][0-9]*
spacing:\s*[2-9][0-9]*\s*[,)]
EdgeInsets\(top:\s*[2-9][0-9]*
```

**Hardcoded corner radii:**

```
\.cornerRadius\(\s*[2-9][0-9]*
RoundedRectangle\(cornerRadius:\s*[2-9][0-9]*
```

### Aggregation

For each Swift file, record:

```
{ file, screensFolder, tokenisedCount, violations: [{kind, line, snippet}, ...] }
```

`screensFolder` is the immediate child of `Screens/` (e.g.
`Screens/Checkout/PaymentView.swift` → `Checkout`).

Roll up by:

- **Screen** (`Screens/<folder>/`) — total tokenised, total violations,
  ratio = `tokenised / (tokenised + violations)`.
- **Flow** (per `flows.yaml` mapping) — sum across constituent screens.
- **Repo** — sum across all scan paths.

## Phase 5 — Compile and write report

Read `flows.yaml` from the same directory as this SKILL.md to get the
flow mapping.

Resolve output paths per the **Output destinations** section near the top:

```bash
LOTUS_REPO=$(cd "$SKILL_DIR/../../.." && pwd)
DATE=$(date +%F)

# Primary path
if [ -n "$OUT_OVERRIDE" ]; then
  PRIMARY="$OUT_OVERRIDE"
else
  PRIMARY="$LOTUS_REPO/audits/ios/$DATE.md"
fi

# Suffix -2, -3 etc. if today's file already exists.
# Capture the base (sans extension) once so each iteration appends to the
# original path, not the previously-suffixed one.
PRIMARY_BASE="${PRIMARY%.md}"
i=2
while [ -e "$PRIMARY" ]; do
  PRIMARY="$PRIMARY_BASE-$i.md"
  i=$((i+1))
done

mkdir -p "$(dirname "$PRIMARY")"
```

Write the compiled Markdown to `$PRIMARY`.

Then handle the optional mirror:

```bash
if [ -n "$LOTUS_AUDIT_MIRROR" ] && [ -d "$LOTUS_AUDIT_MIRROR" ]; then
  MIRROR="${LOTUS_AUDIT_MIRROR%/}/$DATE.md"
  MIRROR_BASE="${MIRROR%.md}"
  i=2
  while [ -e "$MIRROR" ]; do
    MIRROR="$MIRROR_BASE-$i.md"
    i=$((i+1))
  done
  cp "$PRIMARY" "$MIRROR"
fi
```

**Vault-index update (only if the mirror lands in Olly's vault):**

If `$LOTUS_AUDIT_MIRROR` resolves under
`~/Documents/Olly's Brain/Areas/JustPark/Projects/Lotus/Audits/`, append a
bullet to that vault's `_Index.md` under `## Audits`. Derive the wikilink
target from the actual mirror filename (which may have a `-2`, `-3`, etc.
suffix from the collision-check loop) — never hardcode the date format:

```bash
MIRROR_NAME=$(basename "$MIRROR" .md)
echo "- [[Audits/$MIRROR_NAME]] — auto-generated" >> "$INDEX_PATH"
```

Skip the index update for any other mirror destination — the skill only
knows the Obsidian-vault wiring; other knowledge bases (Notion, Slack drop
folders, etc.) handle their own indexing.

## Report structure

The report uses Obsidian-flavoured Markdown. Match the tone of the existing
manual `Lotus — iOS Audit.md` in the same folder — concise, factual, no
hedging. Use tables liberally, Mermaid for visuals, callouts for notable
findings.

Required sections in this order:

```markdown
# Lotus — iOS Audit (YYYY-MM-DD)

*Auto-generated by `/lotus-audit-ios`. Source of truth: Figma file YkS9s6Cz...*

## Summary

> [!summary]
> One paragraph: overall adoption %, headline parity issues, biggest violations
> source. Match the framing of the existing manual audit.

## Token parity (Figma ↔ iOS)

### Colours

Table: Figma name | iOS Swift name | Light value | Dark value | Status (✅ match / ⚠️ mismatch / ❌ missing)

Group rows by Figma collection. Show all matches first, then mismatches, then
missing. Highlight known critical issues (e.g. CTA green ≠ brand green).

### Padding (spacing)

Table: Figma var | iOS const | Figma value | iOS value | Status

### Corner radius

Same shape.

### Typography

> [!warning]
> Figma has no typography Variables. Type styles live in Figma Text Styles
> only. iOS has 20 named type styles in `LotusTypography.swift`. Direct
> token-level parity comparison is not possible. Listed here for completeness;
> manual cross-reference required.

Table of iOS type styles (name, family, size, weight) with a "Figma equivalent
known?" column populated from the existing audit's manual mapping.

## Adoption — repo total

Headline numbers:

- Total Swift files scanned: N
- Total tokenised references: N
- Total violations: N
- Overall tokenisation ratio: N%

Mermaid: stacked bar of tokenised vs violations across all scanned paths.

## Adoption by flow

Table: Flow | Files | Tokenised refs | Violations | Ratio | Trend (vs prior audit if exists)

Mermaid: heatmap or bar chart by flow.

## Adoption by screen

Table: Screen folder | Flow | Files | Tokenised refs | Violations | Ratio

Sort descending by violation count (worst first).

## Top violations

The 20 most-frequent violation patterns across the repo, by count.
Table: Pattern | Count | Most-affected files (top 3)

## Legacy colour systems

Counts of `jp*` (UIColor+JP) and `UIColor.Semantic`/`UIColor.Primitive`
(Design2.0) usage. List the top 10 files using each.

## Notable findings

Bulleted list of anything worth flagging:

- Token parity bugs (radiusFull, h2PoppinsLight, etc.)
- Screens that should be tokenised but aren't (high-traffic + low ratio)
- Drift since previous audit (if a prior audit exists in `Audits/`)

## Methodology + caveats

Brief — what the skill scanned, what it excluded, what it can't see (component
parity not assessed in v1, only token-level).
```

## Important rules

- **Always prompt for Lotus-tab-focused confirmation** in Phase 1 prereqs.
  Don't assume.
- **Each run produces a new dated file.** Never overwrite previous audits.
  Never modify any pre-existing manually-authored audit (e.g. a vault note
  titled "Lotus — iOS Audit.md"); the skill writes only to its own dated
  `audits/ios/YYYY-MM-DD.md` filenames.
- **Default output is repo-relative and gitignored.** Don't write to a vault
  path unless the user has explicitly opted in via `--out` or
  `LOTUS_AUDIT_MIRROR`. The skill is a team tool — its default behaviour
  must work for anyone who clones the repo.
- **Read-only on `parkhub/ios` and the Lotus Figma file.** This skill never
  writes to either.
- **No PAT, no API.** Token data comes via figma-cli's local CDP connection,
  never via Figma's REST API.
- **Don't run figma-cli's `connect` command** — it brings Figma to focus and
  can disrupt the user's full-screen workspace. The user is responsible for
  focusing the Lotus tab; the skill operates on whatever's focused.
- **Spell out acronyms on first use** in the report (e.g. "Search Results
  Page (SRP)").
- **Use Obsidian wikilinks** (`[[Note Name]]`) only when the report is being
  written to a vault destination. For repo-local primary output, prefer
  plain Markdown links — Obsidian-only syntax renders awkwardly elsewhere.

## Trend comparison (optional)

If the directory containing the primary output already has an audit dated
within the last 30 days, include a "Drift since [previous date]"
sub-section in **Notable findings** showing:

- Tokenisation ratio change (overall + per flow)
- New violation files
- Resolved violation files

Skip if no prior audit exists.

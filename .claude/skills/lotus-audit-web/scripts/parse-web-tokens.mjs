#!/usr/bin/env node
// Parse @justpark/ui's Lotus SCSS token files into a structured JSON shape
// comparable to the Figma JSON.
//
// Reads:
//   <ui>/scss/lotus/_colorPrimitives.scss   — primitive palette
//   <ui>/scss/lotus/_colors.scss            — semantic colour layer (CSS-var pattern)
//   <ui>/scss/lotus/_spacing.scss           — spacing scale
//   <ui>/scss/lotus/_radius.scss            — corner-radius scale
//
// The semantic layer at JustPark uses a private+public CSS-custom-property pattern:
//   $-text-primary: colorPrimitives.$grey-800;
//   $text-primary: var(--lotus-text-primary, #{$-text-primary});
//
// The "fallback" hex is what we compare against Figma. The CSS-var override
// surface is what Storyblok partner themes use at runtime — flagged but not
// audited here.
//
// Usage: parse-web-tokens.mjs <path-to-lotus-scss-dir>
//   default: $FRONTEND_REPO/justpark-ui/src/scss/lotus (auto-detected)

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] ||
  (existsSync(`${process.env.HOME}/code/frontend/justpark-ui/src/scss/lotus`)
    ? `${process.env.HOME}/code/frontend/justpark-ui/src/scss/lotus`
    : null);

if (!ROOT || !existsSync(ROOT)) {
  console.error(`Lotus SCSS dir not found. Pass as arg or set $HOME/code/frontend.`);
  process.exit(1);
}

function read(filename) {
  const p = path.join(ROOT, filename);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}

// Strip SCSS line comments (// ...) and block comments (/* ... */)
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

// Parse simple SCSS variable assignments. Returns Map<name, raw-value-string>.
// Names DO NOT include the leading $.
function parseVars(src) {
  const out = new Map();
  const re = /\$([A-Za-z0-9_-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(src))) out.set(m[1], m[2].trim());
  return out;
}

// ---------- _colorPrimitives.scss ----------

const primSrc = read('_colorPrimitives.scss');
const primitives = {};
if (primSrc) {
  const vars = parseVars(stripComments(primSrc));
  for (const [name, val] of vars) {
    // value should be a hex literal like #FEF9EC
    const hex = val.match(/^#([0-9A-Fa-f]{3,8})$/);
    if (hex) primitives[name] = `#${hex[1].toUpperCase()}`;
  }
}

// ---------- _colors.scss (semantic layer) ----------

const colSrc = read('_colors.scss');
const semantic = {}; // { name: { privateHex, cssVarName, hasOverrideSurface } }
if (colSrc) {
  const stripped = stripComments(colSrc);
  const vars = parseVars(stripped);

  // Index private vars first (names start with leading dash after $).
  // SCSS uses $-foo. Parser strips the $ but keeps the dash.
  const privateMap = new Map();
  for (const [name, val] of vars) {
    if (!name.startsWith('-')) continue;
    // value is like `colorPrimitives.$grey-800`
    const ref = val.match(/colorPrimitives\.\$([A-Za-z0-9_-]+)/);
    if (ref && primitives[ref[1]] !== undefined) {
      privateMap.set(name.slice(1), primitives[ref[1]]);
    } else {
      // direct value
      const hex = val.match(/^#([0-9A-Fa-f]{3,8})$/);
      if (hex) privateMap.set(name.slice(1), `#${hex[1].toUpperCase()}`);
    }
  }

  // Now public vars — they wrap private in `var(--lotus-<name>, #{$-<name>})`.
  for (const [name, val] of vars) {
    if (name.startsWith('-')) continue;
    const cssVarMatch = val.match(/var\(\s*--([A-Za-z0-9_-]+)\s*,\s*#\{\s*\$-([A-Za-z0-9_-]+)\s*\}\s*\)/);
    if (cssVarMatch) {
      const cssVar = cssVarMatch[1];
      const privRef = cssVarMatch[2];
      semantic[name] = {
        privateHex: privateMap.get(privRef) || null,
        cssVarName: `--${cssVar}`,
        hasOverrideSurface: true
      };
    } else {
      // direct value (no CSS-var wrapper)
      const hex = val.match(/^#([0-9A-Fa-f]{3,8})$/);
      semantic[name] = {
        privateHex: hex ? `#${hex[1].toUpperCase()}` : null,
        cssVarName: null,
        hasOverrideSurface: false
      };
    }
  }
}

// ---------- _spacing.scss ----------

const spaSrc = read('_spacing.scss');
const spacing = {};
if (spaSrc) {
  const vars = parseVars(stripComments(spaSrc));
  for (const [name, val] of vars) {
    const px = val.match(/^([0-9]+(?:\.[0-9]+)?)px$/);
    const raw = val.match(/^([0-9]+(?:\.[0-9]+)?)$/);
    if (px) spacing[name] = Number(px[1]);
    else if (raw) spacing[name] = Number(raw[1]);
  }
}

// ---------- _radius.scss ----------

const radSrc = read('_radius.scss');
const radius = {};
if (radSrc) {
  const vars = parseVars(stripComments(radSrc));
  for (const [name, val] of vars) {
    const px = val.match(/^([0-9]+(?:\.[0-9]+)?)px$/);
    const raw = val.match(/^([0-9]+(?:\.[0-9]+)?)$/);
    if (px) radius[name] = Number(px[1]);
    else if (raw) radius[name] = Number(raw[1]);
  }
}

// ---------- Output ----------

const output = {
  generatedAt: new Date().toISOString(),
  source: `${ROOT} (justpark-ui)`,
  primitives,
  semantic,
  spacing,
  radius,
  hasTypographyTokens: false, // web has no typography tokens in v1
  notes: {
    overrideSurface: 'Semantic colours wrap a CSS custom property over a static private value. The CSS var (--lotus-*) is the runtime override surface used by Storyblok partner themes.'
  }
};

console.log(JSON.stringify(output, null, 2));

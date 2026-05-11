#!/usr/bin/env node
// Find repeatedly-used hardcoded values in customer-facing web code that
// aren't already Lotus tokens. Mirrors the iOS skill's token-candidates but
// scans web file types (.tsx, .jsx, .scss, .css, .blade.php).
//
// Usage:
//   token-candidates.mjs <frontend-repo> <justpark-repo> <figma.json> <web-tokens.json>
//
// Thresholds (env override):
//   MIN_COLOUR=3 MIN_SPACING=3 MIN_RADIUS=3 MIN_FONT_SIZE=3

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const FRONTEND = process.argv[2] || `${process.env.HOME}/code/frontend`;
const JUSTPARK = process.argv[3] || `${process.env.HOME}/code/justpark`;
const FIGMA_PATH = process.argv[4] || '/tmp/lotus-figma-tokens.json';
const WEB_PATH = process.argv[5] || '/tmp/web-tokens.json';

const MIN_COLOUR    = Number(process.env.MIN_COLOUR    || 3);
const MIN_SPACING   = Number(process.env.MIN_SPACING   || 3);
const MIN_RADIUS    = Number(process.env.MIN_RADIUS    || 3);
const MIN_FONT_SIZE = Number(process.env.MIN_FONT_SIZE || 3);

const figma = JSON.parse(readFileSync(FIGMA_PATH, 'utf8'));
const web = JSON.parse(readFileSync(WEB_PATH, 'utf8'));

// === Figma sets ===
const fc = n => figma.collections.find(c => c.collection === n);
const padCol = fc('Padding');
const radCol = fc('Corner Radius');
const typoCol = fc('Typography');
const colCol = fc('Colour');
const colPrim = fc('Colour (Primitives)');

const figmaPaddingSet = new Set(padCol ? padCol.vars.map(v => Object.values(v.valuesByMode)[0]?.resolved) : []);
const figmaRadiusSet  = new Set(radCol ? radCol.vars.map(v => Object.values(v.valuesByMode)[0]?.resolved) : []);
const figmaFontSizes  = new Set(
  typoCol
    ? typoCol.vars.filter(v => v.name.startsWith('font-size/')).map(v => Object.values(v.valuesByMode)[0]?.resolved)
    : []
);

// Union of Figma + web hex sets for "use-existing-token" detection on colours
const knownColourHexSet = new Set();
for (const c of [colCol, colPrim].filter(Boolean)) {
  for (const v of c.vars) for (const m of Object.values(v.valuesByMode)) {
    if (typeof m.resolved === 'string' && m.resolved.startsWith('#')) knownColourHexSet.add(m.resolved.toUpperCase());
  }
}
for (const hex of Object.values(web.primitives || {})) knownColourHexSet.add(hex.toUpperCase());
for (const def of Object.values(web.semantic || {})) if (def.privateHex) knownColourHexSet.add(def.privateHex.toUpperCase());

// Web's own spacing/radius (for "use existing web token" classification)
const webSpacingValues = new Set(Object.values(web.spacing || {}));
const webRadiusValues = new Set(Object.values(web.radius || {}));

// === File walk ===
function* walk(dir) {
  let entries; try { entries = readdirSync(dir); } catch { return; }
  for (const f of entries) {
    if (f === 'node_modules' || f === '.git' || f === 'dist' || f === 'build') continue;
    const p = path.join(dir, f);
    let s; try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const SCAN_DIRS = [
  path.join(FRONTEND, 'web/app'),
  path.join(FRONTEND, 'pay/app'),
  path.join(JUSTPARK, 'resources/views/mobile'),
  path.join(JUSTPARK, 'resources/views/site'),
  path.join(JUSTPARK, 'public/assets/scss/app'),
  path.join(JUSTPARK, 'public/assets/scss/site')
];

const ACCEPTED_EXTS = ['.tsx', '.jsx', '.ts', '.scss', '.css', '.php'];

function isDefinitionFile(rel) {
  return /(_jpColors|_colorPrimitives|_variables|_colors|_spacing|_radius|_lotusMixins|_utilities)\.scss$/.test(rel);
}

const files = [];
for (const root of SCAN_DIRS) {
  if (!existsSync(root)) continue;
  for (const abs of walk(root)) {
    if (!ACCEPTED_EXTS.some(e => abs.endsWith(e))) continue;
    // Use relative-to-frontend or justpark for nicer paths
    const rel = abs.startsWith(FRONTEND) ? 'frontend/' + path.relative(FRONTEND, abs) : 'justpark/' + path.relative(JUSTPARK, abs);
    if (isDefinitionFile(rel)) continue;
    files.push({ abs, rel });
  }
}

// === Patterns ===
const findings = { colour: [], spacing: [], radius: [], fontSize: [] };
const TRIVIAL = new Set([0, 0.5, 1]);

const RX = {
  hexLiteral: /#([0-9A-Fa-f]{6})\b/g,
  // CSS-context px values: capture digit-only `Npx` with non-word context
  pxValue: /(?<![\w.])([2-9]|[1-9][0-9]+)px(?![\w-])/g,
  pxPadding: /padding(?:-(?:top|right|bottom|left|inline|block))?\s*:\s*([0-9]+)px/g,
  pxMargin: /margin(?:-(?:top|right|bottom|left|inline|block))?\s*:\s*([0-9]+)px/g,
  pxGap: /(?:gap|column-gap|row-gap)\s*:\s*([0-9]+)px/g,
  pxRadius: /border-radius\s*:\s*([0-9]+)px/g,
  pxFontSize: /font-size\s*:\s*([0-9]+(?:\.[0-9]+)?)px/g,

  // JSX inline numeric values inside style={{ ... }}
  jsxStylePadding: /(?:padding|margin|gap|top|right|bottom|left):\s*([0-9]+)(?:[,\s}]|px)/g,
  jsxStyleFontSize: /fontSize:\s*([0-9]+(?:\.[0-9]+)?)/g,
  jsxStyleRadius: /borderRadius:\s*([0-9]+)/g
};

for (const { abs, rel } of files) {
  let txt; try { txt = readFileSync(abs, 'utf8'); } catch { continue; }
  const lines = txt.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const at = `${rel}:${i + 1}`;

    // Colour hex
    for (const m of line.matchAll(RX.hexLiteral)) {
      findings.colour.push({ value: ('#' + m[1]).toUpperCase(), at });
    }
    // CSS spacing patterns
    for (const re of [RX.pxPadding, RX.pxMargin, RX.pxGap]) {
      for (const m of line.matchAll(re)) {
        const v = Number(m[1]);
        if (!TRIVIAL.has(v)) findings.spacing.push({ value: v, at });
      }
    }
    // Radius
    for (const m of line.matchAll(RX.pxRadius)) {
      const v = Number(m[1]);
      if (!TRIVIAL.has(v)) findings.radius.push({ value: v, at });
    }
    // Font size
    for (const m of line.matchAll(RX.pxFontSize)) {
      findings.fontSize.push({ value: Number(m[1]), at });
    }
    // JSX inline-style
    for (const m of line.matchAll(RX.jsxStylePadding)) {
      const v = Number(m[1]);
      if (!TRIVIAL.has(v)) findings.spacing.push({ value: v, at });
    }
    for (const m of line.matchAll(RX.jsxStyleFontSize)) {
      findings.fontSize.push({ value: Number(m[1]), at });
    }
    for (const m of line.matchAll(RX.jsxStyleRadius)) {
      const v = Number(m[1]);
      if (!TRIVIAL.has(v)) findings.radius.push({ value: v, at });
    }
  }
}

// === Cluster + annotate ===
function cluster(arr) {
  const map = new Map();
  for (const item of arr) {
    const key = String(item.value);
    if (!map.has(key)) map.set(key, { value: item.value, count: 0, files: [] });
    const e = map.get(key);
    e.count++;
    e.files.push(item.at);
  }
  for (const e of map.values()) {
    const seen = new Set();
    e.topFiles = [];
    for (const f of e.files) {
      const file = f.split(':').slice(0, -1).join(':');
      if (!seen.has(file)) { seen.add(file); e.topFiles.push(file); }
      if (e.topFiles.length >= 3) break;
    }
    delete e.files;
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function annotateNumeric(c, figmaSet, webSet) {
  if (webSet.has(c.value) || figmaSet.has(c.value)) {
    c.status = 'use-existing-token';
    c.nearest = c.value;
  } else {
    let nearest = null, bestDelta = Infinity;
    for (const v of new Set([...figmaSet, ...webSet])) {
      const delta = Math.abs(v - c.value);
      if (delta < bestDelta) { bestDelta = delta; nearest = v; }
    }
    c.nearest = nearest;
    c.status = bestDelta <= 1 ? 'near-miss' : 'new-candidate';
  }
}

function annotateColour(c) {
  c.status = knownColourHexSet.has(c.value) ? 'use-existing-token' : 'new-candidate';
}

const candidates = {
  colour:   cluster(findings.colour).filter(c => c.count >= MIN_COLOUR),
  spacing:  cluster(findings.spacing).filter(c => c.count >= MIN_SPACING),
  radius:   cluster(findings.radius).filter(c => c.count >= MIN_RADIUS),
  fontSize: cluster(findings.fontSize).filter(c => c.count >= MIN_FONT_SIZE)
};

candidates.colour.forEach(annotateColour);
candidates.spacing.forEach(c => annotateNumeric(c, figmaPaddingSet, webSpacingValues));
candidates.radius.forEach(c => annotateNumeric(c, figmaRadiusSet, webRadiusValues));
candidates.fontSize.forEach(c => annotateNumeric(c, figmaFontSizes, new Set()));

const summary = Object.fromEntries(
  Object.entries(candidates).map(([k, list]) => [k, {
    total: list.length,
    useExisting: list.filter(c => c.status === 'use-existing-token').length,
    nearMiss:    list.filter(c => c.status === 'near-miss').length,
    newCandidate: list.filter(c => c.status === 'new-candidate').length
  }])
);

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  thresholds: { MIN_COLOUR, MIN_SPACING, MIN_RADIUS, MIN_FONT_SIZE },
  summary,
  candidates
}, null, 2));

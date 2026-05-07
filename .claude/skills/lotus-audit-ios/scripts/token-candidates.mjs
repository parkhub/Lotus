#!/usr/bin/env node
// Find repeatedly-used hardcoded values in iOS code that aren't already
// represented as Lotus tokens, and surface them as candidates for new Figma
// tokens — or as "use existing token" suggestions when the value is close to
// a token that already exists.
//
// Categories: colour, spacing, radius, font-size.
//
// Usage:
//   token-candidates.mjs <ios-repo> [figma-tokens.json] [ios-colors.json]
//
// Defaults:
//   ios-repo:        $HOME/code/ios
//   figma-tokens:    /tmp/lotus-figma-tokens.json
//   ios-colors:      /tmp/ios-colors.json
//
// Thresholds (override via env vars):
//   MIN_COLOUR=3 MIN_SPACING=3 MIN_RADIUS=3 MIN_FONT_SIZE=3
//
// Output JSON to stdout:
//   { summary, candidates: { colour, spacing, radius, fontSize } }

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const IOS = process.argv[2] || `${process.env.HOME}/code/ios`;
const FIGMA_PATH = process.argv[3] || '/tmp/lotus-figma-tokens.json';
const IOS_COLORS_PATH = process.argv[4] || '/tmp/ios-colors.json';

const MIN_COLOUR    = Number(process.env.MIN_COLOUR    || 3);
const MIN_SPACING   = Number(process.env.MIN_SPACING   || 3);
const MIN_RADIUS    = Number(process.env.MIN_RADIUS    || 3);
const MIN_FONT_SIZE = Number(process.env.MIN_FONT_SIZE || 3);

const figma = JSON.parse(readFileSync(FIGMA_PATH, 'utf8'));
const iosColors = JSON.parse(readFileSync(IOS_COLORS_PATH, 'utf8'));

// ---------- Build Figma token sets ----------

const fc = name => figma.collections.find(c => c.collection === name);
const padCol  = fc('Padding');
const radCol  = fc('Corner Radius');
const typoCol = fc('Typography');
const colCol  = fc('Colour');
const colPrim = fc('Colour (Primitives)');

const figmaPaddingSet = new Set(padCol ? padCol.vars.map(v => Object.values(v.valuesByMode)[0]?.resolved) : []);
const figmaRadiusSet  = new Set(radCol ? radCol.vars.map(v => Object.values(v.valuesByMode)[0]?.resolved) : []);
const figmaFontSizes  = new Set(
  typoCol
    ? typoCol.vars.filter(v => v.name.startsWith('font-size/')).map(v => Object.values(v.valuesByMode)[0]?.resolved)
    : []
);

// All Figma colour hex values (semantic + primitive, both modes).
const figmaColourHexSet = new Set();
for (const collection of [colCol, colPrim].filter(Boolean)) {
  for (const v of collection.vars) {
    for (const modeVal of Object.values(v.valuesByMode)) {
      if (typeof modeVal.resolved === 'string' && modeVal.resolved.startsWith('#')) {
        figmaColourHexSet.add(modeVal.resolved.toUpperCase());
      }
    }
  }
}

// iOS asset-catalog displayed-sRGB hex set.
const iosColourHexSet = new Set();
for (const c of iosColors) {
  if (c.light) iosColourHexSet.add(c.light.toUpperCase());
  if (c.dark)  iosColourHexSet.add(c.dark.toUpperCase());
}

// ---------- File walk ----------

const SCAN_ROOTS = [
  'JustPark/Screens', 'JustPark/Shared', 'Shared', 'Frameworks',
  'Widget', 'NotificationsContent', 'NotificationsService', 'JPIntents'
];

// Files that *define* colour systems (not consume them). Excluded from candidate
// scanning so we don't flag e.g. the hex literals inside `UIColor+JP.swift`'s
// declarations as "new candidates" — they are the declarations.
const COLOUR_SYSTEM_DEFINITION_FILES = [
  'UIColor+JP.swift',
  'UIColor+Design2.0.swift',
  'UIColor+fromHEX.swift'
];

function shouldExclude(rel) {
  if (rel.includes('/Lotus/Sources/')) return true;
  if (rel.includes('Tests/')) return true;
  if (rel.includes('/Ampli/')) return true;
  if (rel.includes('/Screens/Debug/Lotus/')) return true;
  if (COLOUR_SYSTEM_DEFINITION_FILES.some(name => rel.endsWith(`/${name}`))) return true;
  return false;
}

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const f of entries) {
    const p = path.join(dir, f);
    let s; try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) yield* walk(p);
    else if (f.endsWith('.swift')) yield p;
  }
}

const files = [];
for (const root of SCAN_ROOTS) {
  const abs = path.join(IOS, root);
  for (const f of walk(abs)) {
    const rel = path.relative(IOS, f);
    if (!shouldExclude(rel)) files.push({ abs: f, rel });
  }
}

// ---------- Pattern scanners ----------

function rgbFloatToHex(r, g, b) {
  // r/g/b can be 0-1 floats or 0-255 ints — autodetect by max.
  const max = Math.max(r, g, b);
  const norm = max > 1.0001 ? (x) => x / 255 : (x) => x;
  const to = x => Math.round(Math.max(0, Math.min(1, norm(x))) * 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${to(r)}${to(g)}${to(b)}`;
}

const findings = { colour: [], spacing: [], radius: [], fontSize: [] };

const RX = {
  hexLiteral:    /(?:["'])#([0-9A-Fa-f]{6})(?:["'])/g,
  uikitRGB:      /UIColor\(\s*red:\s*([0-9.]+)\s*(?:\/\s*255(?:\.[0-9]+)?)?\s*,\s*green:\s*([0-9.]+)\s*(?:\/\s*255(?:\.[0-9]+)?)?\s*,\s*blue:\s*([0-9.]+)/g,
  swiftUIRGB:    /Color\(\s*red:\s*([0-9.]+)\s*,\s*green:\s*([0-9.]+)\s*,\s*blue:\s*([0-9.]+)/g,

  paddingNumeric: /\.padding\(\s*([0-9]+(?:\.[0-9]+)?)\s*\)/g,
  paddingEdge:    /\.padding\(\s*\.\s*[a-z]+\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*\)/g,
  spacingArg:     /\bspacing:\s*([0-9]+(?:\.[0-9]+)?)\s*[,)]/g,
  edgeInsets:     /EdgeInsets\(\s*top:\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*leading:\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*bottom:\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*trailing:\s*([0-9]+(?:\.[0-9]+)?)/g,

  cornerRadius:    /\.cornerRadius\(\s*([0-9]+(?:\.[0-9]+)?)\s*\)/g,
  roundedRadius:   /RoundedRectangle\(\s*cornerRadius:\s*([0-9]+(?:\.[0-9]+)?)/g,

  fontSystem:    /Font\.system\(\s*size:\s*([0-9]+(?:\.[0-9]+)?)/g,
  uifontSystem:  /UIFont\.systemFont\(\s*ofSize:\s*([0-9]+(?:\.[0-9]+)?)/g,
  uifontCustom:  /UIFont\(\s*name:\s*"[^"]+"\s*,\s*size:\s*([0-9]+(?:\.[0-9]+)?)/g
};

// Skip values 0 and 1 — they are not tokens (used for borders, hairlines).
const TRIVIAL_SPACING = new Set([0, 0.5, 1]);

for (const { abs, rel } of files) {
  let txt;
  try { txt = readFileSync(abs, 'utf8'); } catch { continue; }
  const lines = txt.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const at = (n) => `${rel}:${i + 1}`;

    // Hex literals
    for (const m of line.matchAll(RX.hexLiteral)) {
      findings.colour.push({ value: ('#' + m[1]).toUpperCase(), at: at() });
    }
    // RGB constructors (UIColor or Color)
    for (const m of line.matchAll(RX.uikitRGB)) {
      findings.colour.push({ value: rgbFloatToHex(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])), at: at() });
    }
    for (const m of line.matchAll(RX.swiftUIRGB)) {
      findings.colour.push({ value: rgbFloatToHex(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])), at: at() });
    }

    // Spacing / padding
    for (const re of [RX.paddingNumeric, RX.paddingEdge, RX.spacingArg]) {
      for (const m of line.matchAll(re)) {
        const v = Number(m[1]);
        if (!TRIVIAL_SPACING.has(v)) findings.spacing.push({ value: v, at: at() });
      }
    }
    for (const m of line.matchAll(RX.edgeInsets)) {
      for (const idx of [1, 2, 3, 4]) {
        const v = Number(m[idx]);
        if (!TRIVIAL_SPACING.has(v)) findings.spacing.push({ value: v, at: at() });
      }
    }

    // Corner radius
    for (const re of [RX.cornerRadius, RX.roundedRadius]) {
      for (const m of line.matchAll(re)) {
        const v = Number(m[1]);
        if (!TRIVIAL_SPACING.has(v)) findings.radius.push({ value: v, at: at() });
      }
    }

    // Font size
    for (const re of [RX.fontSystem, RX.uifontSystem, RX.uifontCustom]) {
      for (const m of line.matchAll(re)) {
        findings.fontSize.push({ value: Number(m[1]), at: at() });
      }
    }
  }
}

// ---------- Cluster by value ----------

function cluster(arr, valueKey = 'value') {
  const map = new Map();
  for (const item of arr) {
    const key = String(item[valueKey]);
    if (!map.has(key)) map.set(key, { value: item[valueKey], count: 0, files: [] });
    const e = map.get(key);
    e.count++;
    e.files.push(item.at);
  }
  // Top-3 distinct files
  for (const e of map.values()) {
    const seen = new Set();
    e.topFiles = [];
    for (const f of e.files) {
      const file = f.split(':')[0];
      if (!seen.has(file)) { seen.add(file); e.topFiles.push(file); }
      if (e.topFiles.length >= 3) break;
    }
    delete e.files;
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

// ---------- Annotate vs existing tokens ----------

function annotateNumeric(c, existingSet) {
  if (existingSet.has(c.value)) {
    c.status = 'use-existing-token';
    c.nearest = c.value;
  } else {
    let nearest = null, bestDelta = Infinity;
    for (const v of existingSet) {
      const delta = Math.abs(v - c.value);
      if (delta < bestDelta) { bestDelta = delta; nearest = v; }
    }
    c.nearest = nearest;
    c.status = bestDelta <= 1 ? 'near-miss' : 'new-candidate';
  }
}

function annotateColour(c) {
  if (figmaColourHexSet.has(c.value) || iosColourHexSet.has(c.value)) {
    c.status = 'use-existing-token';
  } else {
    c.status = 'new-candidate';
  }
}

const candidates = {
  colour:   cluster(findings.colour).filter(c => c.count >= MIN_COLOUR),
  spacing:  cluster(findings.spacing).filter(c => c.count >= MIN_SPACING),
  radius:   cluster(findings.radius).filter(c => c.count >= MIN_RADIUS),
  fontSize: cluster(findings.fontSize).filter(c => c.count >= MIN_FONT_SIZE)
};

candidates.colour.forEach(annotateColour);
candidates.spacing.forEach(c => annotateNumeric(c, figmaPaddingSet));
candidates.radius.forEach(c => annotateNumeric(c, figmaRadiusSet));
candidates.fontSize.forEach(c => annotateNumeric(c, figmaFontSizes));

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

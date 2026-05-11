#!/usr/bin/env node
// Compare Figma's semantic Colour collection against web's _colors.scss tokens.
//
// Figma uses kebab-case names with `/` separators ("Action-App/Primary-Default").
// Web uses kebab-case names with `-` separators ("brand-justpark-green") at one
// flat level. Normalise both for comparison.
//
// Usage: colour-parity.mjs <figma-tokens.json> <web-tokens.json>
//   defaults: /tmp/lotus-figma-tokens.json /tmp/web-tokens.json

import { readFileSync } from 'node:fs';

const figmaPath = process.argv[2] || '/tmp/lotus-figma-tokens.json';
const webPath   = process.argv[3] || '/tmp/web-tokens.json';
const figma = JSON.parse(readFileSync(figmaPath, 'utf8'));
const web   = JSON.parse(readFileSync(webPath, 'utf8'));

const norm = s => s.toLowerCase().replace(/[\s\/\-_]+/g, '');

// Index web semantic by normalised name → hex
const webByName = new Map();
for (const [name, def] of Object.entries(web.semantic)) {
  if (def.privateHex) webByName.set(norm(name), { name, hex: def.privateHex, hasOverride: def.hasOverrideSurface });
}

// Figma semantic Colour collection
const semantic = figma.collections.find(c => c.collection === 'Colour');
const lightModeId = semantic?.modes.find(m => m.name === 'Light Mode')?.id;

// Figma category → web prefix remapping for fuzzy matching.
// e.g. Figma "Action-App/Primary-Default" → web `action-primary-default` (we don't yet have one)
// Figma "Brand/Primary" → web `brand-justpark-green` (close but not identical naming)
function figmaToWeb(figmaName) {
  if (!figmaName) return null;
  if (figmaName.startsWith('Action-Web/')) return null; // web-specific in Figma — should map to web sem-action but unclear yet
  return figmaName
    .replace(/^Action-App\//, 'action-')
    .replace(/^Brand\/Primary$/, 'brand-justpark-green')
    .replace(/^Brand\/Secondary$/, 'brand-justpark-green-forest')
    .replace(/^Surface\/Primary$/, 'surface-white')
    .replace(/^Surface\/Secondary$/, 'surface-light-grey')
    .replace(/^Surface\/Tertiary$/, 'surface-grey')
    .replace(/^On Surface\/Primary$/, 'text-primary')
    .replace(/^Border\/Light$/, 'border-default')
    .replace(/^Border\/Medium$/, 'border-default')
    .replace(/^Border\/Dark$/, 'border-hover')
    .replace(/\//g, '-')
    .toLowerCase();
}

const rows = [];
if (semantic && lightModeId) {
  for (const v of semantic.vars) {
    const target = figmaToWeb(v.name);
    if (!target) continue;
    const webHit = webByName.get(norm(target));
    const figmaHex = v.valuesByMode[lightModeId]?.resolved;
    rows.push({
      figmaName: v.name,
      webName: webHit?.name || target,
      figmaLight: typeof figmaHex === 'string' ? figmaHex.toUpperCase() : null,
      webHex: webHit?.hex || null,
      webHasOverride: webHit?.hasOverride || false,
      webFound: !!webHit
    });
  }
}

function status(r) {
  if (!r.webFound) return 'missing-web';
  if (!r.figmaLight || !r.webHex) return 'unknown';
  return r.figmaLight.toUpperCase() === r.webHex.toUpperCase() ? 'match' : 'mismatch';
}
rows.forEach(r => r.status = status(r));

// Web-only semantic tokens (not in Figma after remap)
const figmaMatched = new Set(rows.filter(r => r.webFound).map(r => norm(r.webName)));
const webOnly = Object.entries(web.semantic)
  .filter(([name]) => !figmaMatched.has(norm(name)))
  .map(([name, def]) => ({ name, hex: def.privateHex, hasOverride: def.hasOverrideSurface }));

const summary = {
  totalFigmaSemantic: rows.length,
  match: rows.filter(r => r.status === 'match').length,
  mismatch: rows.filter(r => r.status === 'mismatch').length,
  missingWeb: rows.filter(r => r.status === 'missing-web').length,
  webOnly: webOnly.length
};

console.log(JSON.stringify({ summary, rows, webOnly }, null, 2));

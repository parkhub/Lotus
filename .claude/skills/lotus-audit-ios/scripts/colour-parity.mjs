// Compare Figma semantic colours against iOS asset-catalog parsed output.
// Usage: colour-parity.mjs <figma-tokens.json> <ios-colors.json>
//   defaults: /tmp/lotus-figma-tokens.json, /tmp/ios-colors.json
import { readFileSync } from 'node:fs';
const figmaPath = process.argv[2] || '/tmp/lotus-figma-tokens.json';
const iosPath   = process.argv[3] || '/tmp/ios-colors.json';
const figma = JSON.parse(readFileSync(figmaPath, 'utf8'));
const ios = JSON.parse(readFileSync(iosPath, 'utf8'));

// Index iOS colours by NORMALIZED name (lowercase, no dashes/spaces)
const norm = s => s.toLowerCase().replace(/[-\s]/g, '');
const iosByName = Object.fromEntries(ios.map(c => [norm(c.name), c]));

const semantic = figma.collections.find(c => c.collection === 'Colour');
const lightModeId = semantic.modes.find(m => m.name === 'Light Mode').id;
const darkModeId = semantic.modes.find(m => m.name === 'Dark Mode').id;

function figmaToAsset(name) {
  if (name.startsWith('Action-Web/')) return null;
  if (name.startsWith('Tab/')) return null;
  if (name.startsWith('System/')) return null;
  if (name.startsWith('Neutral/')) return null;
  return name.replace(/^Action-App\//, 'Action/').replace(/\//g, '.');
}

const KNOWN_REMAPS = {
  'Brand.Primary': 'Brand.JustparkGreen',
  'Brand.Secondary': 'Brand.JustparkGreenForest',
  'Surface.Primary': 'Surface.White',
  'Surface.Secondary': 'Surface.LightGrey',
  'Surface.Tertiary': 'Surface.Grey',
  'Border.Light': 'Border.Default',
  'Border.Medium': 'Border.Default',
  'Border.Dark': 'Border.Hover',
  'On Surface.Primary': 'Text.Primary'
};

const rows = [];
for (const v of semantic.vars) {
  const asAsset = figmaToAsset(v.name);
  if (!asAsset) continue;
  const targetAsset = KNOWN_REMAPS[asAsset] || asAsset;
  const iosColour = iosByName[norm(targetAsset)];
  const figmaLight = v.valuesByMode[lightModeId]?.resolved;
  const figmaDark = v.valuesByMode[darkModeId]?.resolved;
  rows.push({
    figmaName: v.name,
    iosAsset: targetAsset,
    figmaLight, figmaDark,
    iosLight: iosColour?.light || null,
    iosDark: iosColour?.dark || null,
    iosLightSpace: iosColour?.lightSpace || null,
    iosFound: !!iosColour
  });
}

function status(r) {
  if (!r.iosFound) return 'missing-ios';
  const lightMatch = r.figmaLight && r.iosLight && r.figmaLight.toUpperCase() === r.iosLight.toUpperCase();
  const darkMatch = r.figmaDark && r.iosDark && r.figmaDark.toUpperCase() === r.iosDark.toUpperCase();
  if (lightMatch && darkMatch) return 'match';
  if (lightMatch && !r.iosDark) return 'match-no-dark';
  if (lightMatch && !darkMatch) return 'dark-only-mismatch';
  return 'mismatch';
}
rows.forEach(r => r.status = status(r));

const figmaMatchedAssets = new Set(rows.filter(r => r.iosFound).map(r => norm(r.iosAsset)));
const iosOnlyTokens = ios.filter(c => !figmaMatchedAssets.has(norm(c.name)) && !c.name.match(/^(Grey|Green|Red|Blue|Yellow|Black|White)/i));

const summary = {
  totalFigmaSemantic: rows.length,
  match: rows.filter(r => r.status === 'match').length,
  darkOnlyMismatch: rows.filter(r => r.status === 'dark-only-mismatch').length,
  mismatch: rows.filter(r => r.status === 'mismatch').length,
  missingIos: rows.filter(r => r.status === 'missing-ios').length,
  iosOnlySemantic: iosOnlyTokens.length
};
console.log(JSON.stringify({ summary, rows, iosOnlyTokens }, null, 2));

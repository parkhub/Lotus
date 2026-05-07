#!/usr/bin/env node
// Compare Figma's atomic typography tokens against iOS's composed type styles.
//
// Figma tokens are atomic: font-size/h2 = 24, font-family/primary = "Nunito Sans",
// font-style/bold = "Bold", line-height/h2 = 30, etc.
//
// iOS tokens are composed: each named style has (family, size, weight). We
// decompose iOS into its atoms and check each atom against Figma's set.
//
// Usage: typography-parity.mjs <figma-tokens.json> <ios-typography.json>
//   defaults: /tmp/lotus-figma-tokens.json /tmp/ios-typography.json

import { readFileSync } from 'node:fs';

const figmaPath = process.argv[2] || '/tmp/lotus-figma-tokens.json';
const iosPath   = process.argv[3] || '/tmp/ios-typography.json';
const figma = JSON.parse(readFileSync(figmaPath, 'utf8'));
const ios   = JSON.parse(readFileSync(iosPath, 'utf8'));

const typoCol = figma.collections.find(c => c.collection === 'Typography');
if (!typoCol) {
  console.error('No Typography collection in Figma JSON. Has typography been added?');
  process.exit(1);
}

// Index Figma typography vars by category
const figmaSizes = {}, figmaLineHeights = {}, figmaFamilies = {}, figmaWeights = {};
for (const v of typoCol.vars) {
  const val = Object.values(v.valuesByMode)[0]?.resolved;
  if (v.name.startsWith('font-size/'))    figmaSizes[v.name.replace('font-size/', '')]   = val;
  else if (v.name.startsWith('line-height/')) figmaLineHeights[v.name.replace('line-height/', '')] = val;
  else if (v.name.startsWith('font-family/'))  figmaFamilies[v.name.replace('font-family/', '')]   = val;
  else if (v.name.startsWith('font-style/'))   figmaWeights[v.name.replace('font-style/', '')]     = val;
}

const figmaSizeSet = new Set(Object.values(figmaSizes));
const figmaFamilySet = new Set(Object.values(figmaFamilies).map(s => s.toLowerCase()));
const figmaWeightSet = new Set(Object.values(figmaWeights).map(s => s.toLowerCase()));

// For each iOS style, classify atom-level alignment with Figma
const normWeight = w => (w || '').toLowerCase().split('+')[0]; // strip composite ".weight(.medium)" suffix

const iosRows = ios.map(t => {
  const sizeOk   = figmaSizeSet.has(t.size);
  const familyOk = figmaFamilySet.has(t.family.toLowerCase()) || t.family === 'System'; // System = SF, intentional
  const weightOk = figmaWeightSet.has(normWeight(t.weight));

  const issues = [];
  if (!sizeOk)   issues.push(`size ${t.size} not in Figma sizes`);
  if (!familyOk) issues.push(`family "${t.family}" not in Figma families`);
  if (!weightOk) issues.push(`weight "${t.weight}" not in Figma weights`);

  return {
    name: t.name,
    family: t.family,
    weight: t.weight,
    size: t.size,
    sizeOk, familyOk, weightOk,
    status: issues.length === 0 ? 'match' : 'mismatch',
    issues
  };
});

// Reverse direction: Figma sizes/families/weights iOS doesn't use
const iosSizes = new Set(ios.map(t => t.size));
const iosFamilies = new Set(ios.map(t => t.family.toLowerCase()));
const iosWeights = new Set(ios.map(t => normWeight(t.weight)));

const figmaSizesNotUsed = Object.entries(figmaSizes)
  .filter(([, val]) => !iosSizes.has(val))
  .map(([name, value]) => ({ name: `font-size/${name}`, value }));

const figmaFamiliesNotUsed = Object.entries(figmaFamilies)
  .filter(([, val]) => !iosFamilies.has(val.toLowerCase()))
  .map(([name, value]) => ({ name: `font-family/${name}`, value }));

const figmaWeightsNotUsed = Object.entries(figmaWeights)
  .filter(([, val]) => !iosWeights.has(val.toLowerCase()))
  .map(([name, value]) => ({ name: `font-style/${name}`, value }));

const summary = {
  iosTotal: iosRows.length,
  iosMatch: iosRows.filter(r => r.status === 'match').length,
  iosMismatch: iosRows.filter(r => r.status === 'mismatch').length,
  iosSizeViolations: iosRows.filter(r => !r.sizeOk).length,
  iosFamilyViolations: iosRows.filter(r => !r.familyOk).length,
  iosWeightViolations: iosRows.filter(r => !r.weightOk).length,
  figmaSizesNotUsed: figmaSizesNotUsed.length,
  figmaFamiliesNotUsed: figmaFamiliesNotUsed.length,
  figmaWeightsNotUsed: figmaWeightsNotUsed.length
};

console.log(JSON.stringify({
  summary,
  figma: { sizes: figmaSizes, lineHeights: figmaLineHeights, families: figmaFamilies, weights: figmaWeights },
  iosRows,
  figmaNotUsed: { sizes: figmaSizesNotUsed, families: figmaFamiliesNotUsed, weights: figmaWeightsNotUsed }
}, null, 2));

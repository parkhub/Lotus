#!/usr/bin/env node
// Reads DESIGN.md front matter and outputs design-tokens/tokens.json in W3C DTCG format.
// Run: node scripts/build-tokens.js

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '..');
const DESIGN_MD = path.join(ROOT, 'DESIGN.md');
const OUTPUT = path.join(ROOT, 'design-tokens', 'tokens.json');

function extractFrontMatter(src) {
  const match = src.match(/^---\n([\s\S]+?)\n---/);
  if (!match) throw new Error('No YAML front matter found in DESIGN.md');
  return yaml.load(match[1]);
}

function toColorToken(value) {
  return { $type: 'color', $value: String(value) };
}

function toDimensionToken(value) {
  return { $type: 'dimension', $value: String(value) };
}

function toTypographyToken(value) {
  return {
    $type: 'typography',
    $value: {
      fontFamily: value.fontFamily,
      fontSize: String(value.fontSize),
      fontWeight: value.fontWeight,
      lineHeight: value.lineHeight,
    },
  };
}

function buildTokens(data) {
  const tokens = {};

  // Colors
  if (data.colors) {
    tokens.colors = {};
    for (const [key, value] of Object.entries(data.colors)) {
      tokens.colors[key] = toColorToken(value);
    }
  }

  // Spacing
  if (data.spacing) {
    tokens.spacing = {};
    for (const [key, value] of Object.entries(data.spacing)) {
      tokens.spacing[key] = toDimensionToken(value);
    }
  }

  // Corner radius (YAML key: rounded)
  if (data.rounded) {
    tokens.rounded = {};
    for (const [key, value] of Object.entries(data.rounded)) {
      tokens.rounded[key] = toDimensionToken(value);
    }
  }

  // Typography
  if (data.typography) {
    tokens.typography = {};
    for (const [key, value] of Object.entries(data.typography)) {
      tokens.typography[key] = toTypographyToken(value);
    }
  }

  return tokens;
}

function main() {
  const src = fs.readFileSync(DESIGN_MD, 'utf8');
  const data = extractFrontMatter(src);
  const tokens = buildTokens(data);

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(tokens, null, 2) + '\n');

  const counts = Object.entries(tokens).map(([k, v]) => `${Object.keys(v).length} ${k}`).join(', ');
  console.log(`✓ design-tokens/tokens.json written (${counts})`);
}

main();

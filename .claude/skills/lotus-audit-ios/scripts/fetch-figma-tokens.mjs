#!/usr/bin/env node
/**
 * Fetch Lotus design tokens from Figma via figma-ds-cli.
 *
 * Requires:
 *   - Figma Desktop running with figma-ds-cli connected (the desktop must have
 *     been patched once via `figma-ds-cli init` or similar).
 *   - The Lotus design system file open AND the active/focused tab in Figma.
 *
 * Usage:
 *   node fetch-figma-tokens.mjs [outpath]
 *
 * Outputs structured JSON to outpath (default /tmp/lotus-figma-tokens.json) with
 * collections, modes, variables, and resolved values. Aliases on the semantic
 * Colour collection are walked and resolved to primitive hex values per mode.
 *
 * Exit codes:
 *   0  success
 *   1  figma-cli failed (Figma not running, or Lotus tab not focused)
 *   2  parse failure (figma-cli returned non-JSON)
 */

import { execSync } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const FIGMA_CLI = process.env.FIGMA_CLI_PATH || path.join(process.env.HOME, 'figma-cli');
const OUT = process.argv[2] || '/tmp/lotus-figma-tokens.json';

if (!existsSync(path.join(FIGMA_CLI, 'src/index.js'))) {
  console.error(`figma-cli not found at ${FIGMA_CLI}.`);
  console.error('Set FIGMA_CLI_PATH or install figma-ds-cli.');
  process.exit(1);
}

const evalScript = `(async () => {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const out = [];
  for (const col of collections) {
    const modes = col.modes.map(m => ({ id: m.modeId, name: m.name }));
    const vars = [];
    for (const id of col.variableIds) {
      const v = await figma.variables.getVariableByIdAsync(id);
      if (!v) continue;
      vars.push({
        id: v.id,
        name: v.name,
        type: v.resolvedType,
        valuesByMode: v.valuesByMode
      });
    }
    out.push({
      collection: col.name,
      defaultModeId: col.defaultModeId,
      modes,
      vars
    });
  }
  return JSON.stringify(out);
})()`;

const tmpScript = path.join(tmpdir(), `lotus-fetch-${Date.now()}.mjs`);
writeFileSync(tmpScript, evalScript);

let raw;
try {
  raw = execSync(`node "${FIGMA_CLI}/src/index.js" run "${tmpScript}"`, {
    encoding: 'utf8',
    timeout: 90000,
    stdio: ['ignore', 'pipe', 'pipe']
  });
} catch (e) {
  console.error('figma-cli eval failed.');
  console.error('Likely causes:');
  console.error('  1. Figma Desktop is not running');
  console.error('  2. The Lotus design system file is not the focused tab');
  console.error('  3. figma-cli debug-port patch is broken (try: cd ~/figma-cli && node src/index.js status)');
  console.error(`\nDetail: ${(e.stderr || e.message || '').toString().split('\n')[0]}`);
  process.exit(1);
}

let collections;
try {
  collections = JSON.parse(raw);
} catch {
  console.error('figma-cli eval returned non-JSON. Raw output:');
  console.error(raw);
  process.exit(2);
}

const byId = new Map();
for (const col of collections) {
  for (const v of col.vars) byId.set(v.id, { collection: col.collection, ...v });
}

function resolveAlias(value, modeIdHint, depth = 0) {
  if (depth > 10) return { error: 'alias chain too deep' };
  if (value && typeof value === 'object' && value.type === 'VARIABLE_ALIAS') {
    const target = byId.get(value.id);
    if (!target) return { error: `unresolved alias ${value.id}` };
    const targetMode = target.valuesByMode[modeIdHint] !== undefined
      ? modeIdHint
      : Object.keys(target.valuesByMode)[0];
    return resolveAlias(target.valuesByMode[targetMode], targetMode, depth + 1);
  }
  return value;
}

function rgbaToHex({ r, g, b, a }) {
  const to255 = x => Math.round(x * 255).toString(16).padStart(2, '0');
  const hex = `#${to255(r)}${to255(g)}${to255(b)}`.toUpperCase();
  return a < 1 ? `${hex}${to255(a)}` : hex;
}

function display(rawValue, type, modeId) {
  const r = resolveAlias(rawValue, modeId);
  if (r && typeof r === 'object' && 'error' in r) return r;
  if (type === 'COLOR' && r && typeof r === 'object' && 'r' in r) return rgbaToHex(r);
  return r;
}

const resolved = collections.map(col => ({
  collection: col.collection,
  defaultModeId: col.defaultModeId,
  modes: col.modes,
  vars: col.vars.map(v => ({
    name: v.name,
    type: v.type,
    valuesByMode: Object.fromEntries(
      Object.entries(v.valuesByMode).map(([modeId, raw]) => [
        modeId,
        { raw, resolved: display(raw, v.type, modeId) }
      ])
    )
  }))
}));

const totalVars = resolved.reduce((n, c) => n + c.vars.length, 0);
writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: 'figma-ds-cli (Lotus design system file)',
      totalVars,
      collections: resolved
    },
    null,
    2
  )
);

console.error(`Wrote ${OUT} — ${totalVars} variables across ${resolved.length} collections`);
console.log(OUT);

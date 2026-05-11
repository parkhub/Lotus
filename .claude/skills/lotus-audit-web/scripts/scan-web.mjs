#!/usr/bin/env node
// Scan customer-facing web apps for Lotus compliance.
//
// Usage:
//   scan-web.mjs <frontend-repo> <justpark-repo> <apps.yaml>
//   defaults: $HOME/code/frontend $HOME/code/justpark <skill-dir>/apps.yaml
//
// Counts per-file:
//   - Compliant uses (Lotus SCSS imports, @justpark/ui component imports, CSS var refs)
//   - Legacy uses (_jpColors.scss vars: $justparkGreen, $jp-*, $brown-grey-*, etc.)
//   - Hardcoded literals (hex strings, raw px/rem in CSS contexts, inline style={{}}/style="")

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const FRONTEND = process.argv[2] || `${process.env.HOME}/code/frontend`;
const JUSTPARK = process.argv[3] || `${process.env.HOME}/code/justpark`;
const APPS_YAML = process.argv[4] || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'apps.yaml');

// --- tiny YAML parser sufficient for apps.yaml ---
function parseAppsYaml(text) {
  const apps = {};
  let cur = null;
  let inApps = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').replace(/\s+$/, '');
    if (!line.trim()) continue;
    if (line === 'apps:') { inApps = true; continue; }
    if (line.startsWith('excluded:') || /^[a-z_]+:/.test(line) && !line.startsWith(' ')) inApps = (line === 'apps:');
    if (!inApps) continue;
    if (/^  [a-zA-Z][a-zA-Z0-9_-]*:\s*$/.test(line)) {
      cur = line.trim().replace(/:$/, '');
      apps[cur] = { name: cur };
    } else if (cur && /^    \w+:\s*/.test(line)) {
      const m = line.trim().match(/^(\w+):\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2];
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      } else {
        val = val.replace(/^["']|["']$/g, '');
      }
      apps[cur][key] = val;
    }
  }
  return Object.values(apps);
}

const apps = parseAppsYaml(readFileSync(APPS_YAML, 'utf8'));

function repoRoot(name) {
  return name === 'frontend' ? FRONTEND : name === 'justpark' ? JUSTPARK : null;
}

function matchesGlob(file, globs) {
  // Very simple: check extension match (we only use **/*.ext globs).
  return globs.some(g => {
    const ext = g.split('.').pop();
    return file.endsWith('.' + ext);
  });
}

function* walk(dir) {
  let entries; try { entries = readdirSync(dir); } catch { return; }
  for (const f of entries) {
    if (f === 'node_modules' || f === '.git' || f === 'dist' || f === 'build' || f === 'cypress' || f === 'playwright' || f === 'test') continue;
    const p = path.join(dir, f);
    let s; try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) yield* walk(p);
    else yield p;
  }
}

// Files that *define* colour systems (don't scan their internals for violations)
function isDefinitionFile(rel) {
  return /(_jpColors|_colorPrimitives|_variables|_colors|_spacing|_radius|_lotusMixins|_utilities)\.scss$/.test(rel);
}

// === Compiled patterns ===
const PATTERNS = {
  // Compliant
  compliant_scss_import:     [/@use\s+['"]@justpark\/ui\/src\/scss\/lotus\/[a-zA-Z]+['"]/g, /@use\s+['"][./]*lotus\/[a-zA-Z]+['"]/g],
  compliant_lotus_ref:       [/(colors|spacing|radius)\.\$[a-zA-Z0-9_-]+/g],
  compliant_css_var:         [/var\(\s*--lotus-[a-zA-Z0-9_-]+/g],
  compliant_ui_import:       [/from\s+['"]@justpark\/ui['"]/g, /from\s+['"]@justpark\/ui\/[^'"]+['"]/g],

  // Legacy
  legacy_jp_colors_import:   [/@use\s+['"][^'"]*jpColors['"]/g, /@import\s+['"][^'"]*jpColors['"]/g],
  legacy_jp_var:             [/\$jp[A-Z][a-zA-Z0-9-]*/g, /\$(justpark|jp)-?[a-zA-Z0-9-]+/gi],
  legacy_brown_grey:         [/\$(brown-grey|pale-grey|light-grey|dark-sky-blue|orange-pink|white-smoke|very-light-pink)[a-zA-Z0-9-]*/g],

  // Hardcoded literals
  hard_hex_scss:             [/(?<!\w)#[0-9A-Fa-f]{3,8}(?!\w)/g], // #FFF or #ABCDEF (any context)
  hard_inline_style_jsx:     [/style=\{\{[^}]*\}\}/g],
  hard_inline_style_blade:   [/style="[^"]*[0-9]+(px|rem|em|%)[^"]*"/g, /style="[^"]*#[0-9A-Fa-f]{3,8}[^"]*"/g],
  hard_px_scss:              [/[:\s]([2-9]|[1-9][0-9]+)px(?![\w-])/g], // raw px values in CSS contexts (exclude 0px, 1px)
  hard_font_size:            [/font-size\s*:\s*[0-9]+(\.[0-9]+)?(px|rem|em)/g],
  hard_color_jsx_named:      [/\.(color|backgroundColor|borderColor)\s*=\s*["']#[0-9A-Fa-f]{3,8}["']/g],
};

const COMPLIANT_KEYS = ['compliant_scss_import', 'compliant_lotus_ref', 'compliant_css_var', 'compliant_ui_import'];
const LEGACY_KEYS = ['legacy_jp_colors_import', 'legacy_jp_var', 'legacy_brown_grey'];
const HARDCODED_KEYS = Object.keys(PATTERNS).filter(k => !COMPLIANT_KEYS.includes(k) && !LEGACY_KEYS.includes(k));

const fileResults = [];
const appAgg = {};

for (const app of apps) {
  const root = repoRoot(app.repo);
  if (!root) continue;
  const dir = path.join(root, app.path);
  if (!existsSync(dir)) continue;

  appAgg[app.name] = { tier: app.tier, files: 0, compliant: 0, legacy: 0, hardcoded: 0 };

  for (const abs of walk(dir)) {
    const rel = path.relative(root, abs);
    if (!matchesGlob(abs, app.file_globs || ['**/*'])) continue;
    if (isDefinitionFile(rel)) continue;

    let txt; try { txt = readFileSync(abs, 'utf8'); } catch { continue; }
    const counts = {};
    for (const [k, regexes] of Object.entries(PATTERNS)) {
      let c = 0;
      for (const re of regexes) {
        const matches = txt.match(re);
        if (matches) c += matches.length;
      }
      counts[k] = c;
    }
    const compliant = COMPLIANT_KEYS.reduce((s, k) => s + counts[k], 0);
    const legacy = LEGACY_KEYS.reduce((s, k) => s + counts[k], 0);
    const hardcoded = HARDCODED_KEYS.reduce((s, k) => s + counts[k], 0);
    const total = compliant + legacy + hardcoded;
    if (total === 0) continue;

    const violations = legacy + hardcoded;
    fileResults.push({
      rel: `${app.repo}/${rel}`,
      app: app.name,
      compliant, legacy, hardcoded, violations,
      ratio: compliant / (compliant + violations) || 0,
      counts
    });

    appAgg[app.name].files++;
    appAgg[app.name].compliant += compliant;
    appAgg[app.name].legacy += legacy;
    appAgg[app.name].hardcoded += hardcoded;
  }
}

const totals = fileResults.reduce((a, f) => {
  a.compliant += f.compliant; a.legacy += f.legacy; a.hardcoded += f.hardcoded;
  a.violations += f.violations; a.files++; return a;
}, { compliant: 0, legacy: 0, hardcoded: 0, violations: 0, files: 0 });
totals.ratio = totals.compliant / (totals.compliant + totals.violations) || 0;

// Pattern totals + top affected files
const patternCounts = Object.fromEntries(Object.keys(PATTERNS).map(k => [k, 0]));
const topAffected = Object.fromEntries(Object.keys(PATTERNS).map(k => [k, []]));
for (const f of fileResults) {
  for (const [k, n] of Object.entries(f.counts)) {
    patternCounts[k] += n;
    if (n > 0) topAffected[k].push({ rel: f.rel, n });
  }
}
for (const k of Object.keys(topAffected)) topAffected[k].sort((a, b) => b.n - a.n);

function repoHead(root) {
  try { return execSync(`git -C "${root}" rev-parse HEAD`, { encoding: 'utf8' }).trim(); } catch { return null; }
}

const output = {
  generatedAt: new Date().toISOString(),
  frontendCommit: repoHead(FRONTEND),
  justparkCommit: repoHead(JUSTPARK),
  totals,
  byApp: Object.fromEntries(Object.entries(appAgg).map(([n, s]) => [n, { ...s, ratio: s.compliant / (s.compliant + s.legacy + s.hardcoded) || 0 }])),
  patternCounts,
  topAffected: Object.fromEntries(Object.entries(topAffected).map(([k, arr]) => [k, arr.slice(0, 5)])),
  worstFiles: [...fileResults].filter(f => f.violations > 0).sort((a, b) => b.violations - a.violations).slice(0, 25)
};
console.log(JSON.stringify(output, null, 2));

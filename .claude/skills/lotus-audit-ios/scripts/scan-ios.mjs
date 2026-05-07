import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const IOS = process.argv[2] || `${process.env.HOME}/code/ios`;
const FLOWS_YAML = process.argv[3] || `${process.env.HOME}/code/Lotus/.claude/skills/lotus-audit-ios/flows.yaml`;

// Tiny YAML parser sufficient for our flat flows.yaml
function parseFlowsYaml(text) {
  const flows = {};
  const exclude = [];
  let mode = null, currentFlow = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').replace(/\s+$/, '');
    if (!line.trim()) continue;
    if (line === 'flows:') { mode = 'flows'; continue; }
    if (line === 'exclude:') { mode = 'exclude'; continue; }
    if (mode === 'flows') {
      if (/^  [^\s-]/.test(line)) { currentFlow = line.trim().replace(/:$/, ''); flows[currentFlow] = []; }
      else if (/^    -\s*/.test(line) && currentFlow) flows[currentFlow].push(line.trim().replace(/^-\s*/, ''));
    } else if (mode === 'exclude') {
      if (/^\s*-\s*/.test(line)) exclude.push(line.trim().replace(/^-\s*/, ''));
    }
  }
  return { flows, exclude };
}

const { flows, exclude } = parseFlowsYaml(readFileSync(FLOWS_YAML, 'utf8'));

// Reverse map: screen folder -> flow name
const screenToFlow = {};
for (const [flow, screens] of Object.entries(flows)) for (const s of screens) screenToFlow[s] = flow;

const SCAN_ROOTS = [
  'JustPark/Screens', 'JustPark/Shared', 'Shared', 'Frameworks',
  'Widget', 'NotificationsContent', 'NotificationsService', 'JPIntents'
];

const EXCLUDE_GLOBS = [
  '**/Lotus/**', '**/*Tests/**', '**/Ampli/**', '**/Screens/Debug/Lotus/**'
];

function shouldExcludeFile(rel) {
  return rel.includes('/Lotus/Sources/') || rel.includes('Tests/') || rel.includes('/Ampli/')
      || rel.includes('/Screens/Debug/Lotus/');
}

// Collect all swift files in scope
function* walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    let s; try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) yield* walk(p);
    else if (f.endsWith('.swift')) yield p;
  }
}

const files = [];
for (const root of SCAN_ROOTS) {
  const abs = path.join(IOS, root);
  if (!existsSync(abs)) continue;
  for (const f of walk(abs)) {
    const rel = path.relative(IOS, f);
    if (!shouldExcludeFile(rel)) files.push(rel);
  }
}

// Patterns
const PATTERNS = {
  tokenised_colour:       [/LotusColours\.[A-Za-z]+\.[A-Za-z]+/g],
  tokenised_typography:   [/LotusTypography\.[A-Za-z]+/g],
  tokenised_spacing:      [/LotusSpacing\.spacing[A-Za-z]+/g],
  tokenised_radius:       [/LotusCorners\.radius[A-Za-z]+/g],

  legacy_jp_colour:       [/\.jp[A-Z][A-Za-z0-9]+/g],
  legacy_design2_sem:     [/UIColor\.Semantic\./g],
  legacy_design2_prim:    [/UIColor\.Primitive\./g],

  hard_uicolor_rgb:       [/UIColor\(red:\s*[0-9.]+,\s*green:/g, /UIColor\(white:\s*[0-9.]+/g],
  hard_uicolor_system:    [/UIColor\.(white|black|systemGray|systemRed|systemBlue|systemGreen|systemYellow|systemOrange)/g],
  hard_color_rgb:         [/Color\(red:\s*[0-9.]+,\s*green:/g, /Color\(\.system[A-Z]/g],
  hard_color_named:       [/\.(foregroundColor|foregroundStyle|background|tint)\(\s*\.(white|black|gray|red|blue|green|yellow|orange)\s*\)/g],
  hard_hex_init:          [/UIColor\(fromHexString:/g, /Color\(hex:/g],

  hard_font_system:       [/Font\.system\(size:/g, /UIFont\.systemFont\(ofSize:/g, /UIFont\(name:.+size:/g],
  hard_font_custom:       [/Font\.custom\(/g],

  // Padding/spacing literals - exclude 0 and 1 single digits
  hard_padding:           [/\.padding\(\s*[2-9][0-9]*(\.[0-9]+)?\s*\)/g, /\.padding\(\.[a-z]+,\s*[2-9][0-9]*/g],
  hard_spacing:           [/\bspacing:\s*[2-9][0-9]*\s*[,)]/g],
  hard_edgeinsets:        [/EdgeInsets\(top:\s*[2-9][0-9]*/g],

  hard_radius:            [/\.cornerRadius\(\s*[2-9][0-9]*/g, /RoundedRectangle\(cornerRadius:\s*[2-9][0-9]*/g]
};

const TOKENISED_KEYS = ['tokenised_colour', 'tokenised_typography', 'tokenised_spacing', 'tokenised_radius'];
const LEGACY_KEYS = ['legacy_jp_colour', 'legacy_design2_sem', 'legacy_design2_prim'];
const HARDCODED_KEYS = Object.keys(PATTERNS).filter(k => !TOKENISED_KEYS.includes(k) && !LEGACY_KEYS.includes(k));

const fileResults = [];
const screenAgg = {};
const flowAgg = {};

function bucket(rel) {
  // Screens/<folder>/...  -> "Screens/<folder>"
  const m = rel.match(/JustPark\/Screens\/([^/]+)\//);
  if (m) {
    const screen = m[1];
    return { screen, flow: screenToFlow[screen] || 'Unmapped' };
  }
  if (rel.startsWith('JustPark/Shared/'))           return { screen: '_JustPark/Shared', flow: 'Shared & Infra' };
  if (rel.startsWith('Shared/'))                    return { screen: '_Shared', flow: 'Shared & Infra' };
  if (rel.startsWith('Frameworks/'))                return { screen: '_Frameworks', flow: 'Shared & Infra' };
  if (rel.startsWith('Widget/'))                    return { screen: '_Widget', flow: 'Widget & Extensions' };
  if (rel.startsWith('NotificationsContent/'))      return { screen: '_NotificationsContent', flow: 'Widget & Extensions' };
  if (rel.startsWith('NotificationsService/'))      return { screen: '_NotificationsService', flow: 'Widget & Extensions' };
  if (rel.startsWith('JPIntents/'))                 return { screen: '_JPIntents', flow: 'Widget & Extensions' };
  return { screen: '_Other', flow: 'Unmapped' };
}

for (const rel of files) {
  let txt;
  try { txt = readFileSync(path.join(IOS, rel), 'utf8'); } catch { continue; }
  const counts = Object.fromEntries(Object.keys(PATTERNS).map(k => [k, 0]));
  for (const [k, regexes] of Object.entries(PATTERNS)) {
    for (const re of regexes) {
      const matches = txt.match(re);
      if (matches) counts[k] += matches.length;
    }
  }
  const tokenised = TOKENISED_KEYS.reduce((s, k) => s + counts[k], 0);
  const legacy = LEGACY_KEYS.reduce((s, k) => s + counts[k], 0);
  const hardcoded = HARDCODED_KEYS.reduce((s, k) => s + counts[k], 0);
  const violations = legacy + hardcoded;
  const total = tokenised + violations;
  const ratio = total > 0 ? tokenised / total : null;

  if (total === 0) continue; // ignore files with no UI styling at all

  const { screen, flow } = bucket(rel);
  fileResults.push({ rel, screen, flow, tokenised, legacy, hardcoded, violations, total, ratio, counts });

  if (!screenAgg[screen]) screenAgg[screen] = { flow, files: 0, tokenised: 0, legacy: 0, hardcoded: 0, violations: 0 };
  screenAgg[screen].files++;
  screenAgg[screen].tokenised += tokenised;
  screenAgg[screen].legacy += legacy;
  screenAgg[screen].hardcoded += hardcoded;
  screenAgg[screen].violations += violations;

  if (!flowAgg[flow]) flowAgg[flow] = { files: 0, tokenised: 0, legacy: 0, hardcoded: 0, violations: 0, screens: new Set() };
  flowAgg[flow].files++;
  flowAgg[flow].tokenised += tokenised;
  flowAgg[flow].legacy += legacy;
  flowAgg[flow].hardcoded += hardcoded;
  flowAgg[flow].violations += violations;
  flowAgg[flow].screens.add(screen);
}

// Top violation patterns across the repo
const patternCounts = Object.fromEntries(Object.keys(PATTERNS).map(k => [k, 0]));
const topAffected = Object.fromEntries(Object.keys(PATTERNS).map(k => [k, []]));
for (const f of fileResults) {
  for (const [k, n] of Object.entries(f.counts)) {
    patternCounts[k] += n;
    if (n > 0) topAffected[k].push({ rel: f.rel, n });
  }
}
for (const k of Object.keys(topAffected)) topAffected[k].sort((a, b) => b.n - a.n);

const totals = fileResults.reduce((acc, f) => {
  acc.tokenised += f.tokenised;
  acc.legacy += f.legacy;
  acc.hardcoded += f.hardcoded;
  acc.violations += f.violations;
  acc.files++;
  return acc;
}, { tokenised: 0, legacy: 0, hardcoded: 0, violations: 0, files: 0 });
totals.ratio = totals.tokenised / (totals.tokenised + totals.violations);

const out = {
  generatedAt: new Date().toISOString(),
  iosCommit: execSync(`git -C "${IOS}" rev-parse HEAD`, { encoding: 'utf8' }).trim(),
  scanRoots: SCAN_ROOTS.filter(r => existsSync(path.join(IOS, r))),
  totals,
  patternCounts,
  topAffected: Object.fromEntries(Object.entries(topAffected).map(([k, arr]) => [k, arr.slice(0, 5)])),
  byFlow: Object.fromEntries(Object.entries(flowAgg).map(([f, s]) => [f, { ...s, screens: [...s.screens], ratio: s.tokenised / (s.tokenised + s.violations) }])),
  byScreen: Object.fromEntries(Object.entries(screenAgg).map(([s, v]) => [s, { ...v, ratio: v.tokenised / (v.tokenised + v.violations) }])),
  worstFiles: [...fileResults].filter(f => f.violations > 0).sort((a, b) => b.violations - a.violations).slice(0, 25).map(f => ({ rel: f.rel, screen: f.screen, flow: f.flow, tokenised: f.tokenised, violations: f.violations, ratio: f.ratio }))
};
console.log(JSON.stringify(out, null, 2));

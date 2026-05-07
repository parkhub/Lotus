import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.argv[2] || `${process.env.HOME}/code/ios/Lotus/Sources/Lotus/Assets.xcassets/Lotus-Colour-Pallet`;

function* walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (f === 'Contents.json' && dir.endsWith('.colorset')) yield p;
  }
}

// Parse component string -> 0..1 float
function parseChannel01(s) {
  if (typeof s !== 'string') return Number(s);
  s = s.trim();
  if (s.startsWith('0x') || s.startsWith('0X')) return parseInt(s, 16) / 255;
  return parseFloat(s);
}

// sRGB encode/decode
const srgbToLinear = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const linearToSrgb = c => c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1/2.4) - 0.055;

// P3 EOTF/OETF — Display P3 uses the same sRGB transfer function
const p3ToLinear = srgbToLinear;
const linearToP3 = linearToSrgb;

// Matrix: linear Display-P3 → linear sRGB (D65)
// Source: standard color science, Bradford-adapted
const P3_TO_SRGB = [
  [ 1.2249401174, -0.2249401174,  0.0           ],
  [-0.0420569546,  1.0420569546,  0.0           ],
  [-0.0196375546, -0.0786360454,  1.0982736000  ]
];

function matmul3(m, v) {
  return [
    m[0][0]*v[0] + m[0][1]*v[1] + m[0][2]*v[2],
    m[1][0]*v[0] + m[1][1]*v[1] + m[1][2]*v[2],
    m[2][0]*v[0] + m[2][1]*v[1] + m[2][2]*v[2]
  ];
}

const clamp01 = x => Math.max(0, Math.min(1, x));

function p3ToSrgb({ r, g, b }) {
  const lin = [p3ToLinear(r), p3ToLinear(g), p3ToLinear(b)];
  const linSrgb = matmul3(P3_TO_SRGB, lin).map(clamp01);
  return {
    r: linearToSrgb(linSrgb[0]),
    g: linearToSrgb(linSrgb[1]),
    b: linearToSrgb(linSrgb[2])
  };
}

const to255 = v => Math.round(v * 255).toString(16).padStart(2, '0').toUpperCase();
const toHex = (r, g, b) => `#${to255(r)}${to255(g)}${to255(b)}`;

function colorToHex(components, space) {
  const r01 = parseChannel01(components.red);
  const g01 = parseChannel01(components.green);
  const b01 = parseChannel01(components.blue);
  if (space === 'display-p3') {
    const conv = p3ToSrgb({ r: r01, g: g01, b: b01 });
    return { hex: toHex(conv.r, conv.g, conv.b), rawHex: toHex(r01, g01, b01) };
  }
  // sRGB or default
  return { hex: toHex(r01, g01, b01), rawHex: toHex(r01, g01, b01) };
}

const result = [];
for (const file of walk(root)) {
  const setDir = path.dirname(file);
  const name = path.basename(setDir, '.colorset');
  const data = JSON.parse(readFileSync(file, 'utf8'));
  let light = null, dark = null, lightSpace = null, darkSpace = null, lightRaw = null, darkRaw = null;
  for (const entry of (data.colors || [])) {
    if (!entry.color) continue;
    const isDark = (entry.appearances || []).some(a => a.appearance === 'luminosity' && a.value === 'dark');
    const c = entry.color.components;
    const space = entry.color['color-space'] || 'srgb';
    const { hex, rawHex } = colorToHex(c, space);
    if (isDark) { dark = hex; darkSpace = space; darkRaw = rawHex; }
    else { light = hex; lightSpace = space; lightRaw = rawHex; }
  }
  result.push({ name, light, lightSpace, lightRaw, dark, darkSpace, darkRaw });
}
result.sort((a, b) => a.name.localeCompare(b.name));
console.log(JSON.stringify(result, null, 2));

#!/usr/bin/env node
// Parse LotusTypography.swift into structured (name, family, size, weight) tuples.
//
// Usage: parse-ios-typography.mjs [path-to-LotusTypography.swift]
//   default: $HOME/code/ios/Lotus/Sources/Lotus/LotusTypography.swift
//
// Recognised forms:
//   public static let h1Nunito = Font.custom("NunitoSans-Bold", size: 32)
//   public static let h1Poppins = Font.custom("Poppins-Bold", size: 32)
//   public static let bodySmallMedium = Font.custom("NunitoSans-Regular", size: 14).weight(.medium)
//   public static let bodyLargeBoldUIKit = UIFont(name: "NunitoSans-Bold", size: 18)
//   public static let sfSemiBoldFont = Font.system(size: 15, weight: .semibold)
//   public static let sfRegularFont = Font.system(size: 15, weight: .regular)

import { readFileSync } from 'node:fs';

const PATH = process.argv[2] || `${process.env.HOME}/code/ios/Lotus/Sources/Lotus/LotusTypography.swift`;
const src = readFileSync(PATH, 'utf8');

// PostScript name → { family, weight }
function decomposePostscript(name) {
  // e.g. "NunitoSans-Bold" → family "Nunito Sans" (display), psFamily "NunitoSans", weight "Bold"
  const m = name.match(/^([A-Za-z]+)-([A-Za-z]+)$/);
  if (m) return { psFamily: m[1], displayFamily: m[1].replace(/([a-z])([A-Z])/g, '$1 $2'), weight: m[2] };
  return { psFamily: name, displayFamily: name, weight: 'Regular' };
}

const tokens = [];
const lineRe = /public\s+static\s+let\s+([A-Za-z][A-Za-z0-9]*)\s*=\s*(.+)$/gm;
let m;
while ((m = lineRe.exec(src))) {
  const tokenName = m[1];
  const expr = m[2].trim();

  // Skip non-Font assignments (e.g. struct LotusFontFamily(...))
  let parsed = null;

  // Font.custom("NunitoSans-Bold", size: 32) [.weight(.medium)]?
  const fontCustom = expr.match(/Font\.custom\("([^"]+)",\s*size:\s*([0-9.]+)\)(?:\.weight\(\.([a-zA-Z]+)\))?/);
  if (fontCustom) {
    const ps = decomposePostscript(fontCustom[1]);
    parsed = {
      name: tokenName,
      kind: 'Font',
      psName: fontCustom[1],
      family: ps.displayFamily,
      weight: fontCustom[3] ? `${ps.weight}+${fontCustom[3]}` : ps.weight,
      size: Number(fontCustom[2])
    };
  }

  // UIFont(name: "NunitoSans-Bold", size: 18)
  const uiFont = expr.match(/UIFont\(\s*name:\s*"([^"]+)",\s*size:\s*([0-9.]+)\s*\)/);
  if (!parsed && uiFont) {
    const ps = decomposePostscript(uiFont[1]);
    parsed = {
      name: tokenName,
      kind: 'UIFont',
      psName: uiFont[1],
      family: ps.displayFamily,
      weight: ps.weight,
      size: Number(uiFont[2])
    };
  }

  // Font.system(size: 15, weight: .semibold)
  const fontSystem = expr.match(/Font\.system\(\s*size:\s*([0-9.]+),\s*weight:\s*\.([a-zA-Z]+)\s*\)/);
  if (!parsed && fontSystem) {
    parsed = {
      name: tokenName,
      kind: 'Font.system',
      psName: null,
      family: 'System',
      weight: fontSystem[2],
      size: Number(fontSystem[1])
    };
  }

  if (parsed) tokens.push(parsed);
}

console.log(JSON.stringify(tokens, null, 2));

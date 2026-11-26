#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const cssPath = path.resolve(process.cwd(), 'src/app/globals.css');
const css = fs.readFileSync(cssPath, 'utf8');

function extractVars(blockText) {
  const map = {};
  const re = /(--tw-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g;
  let m;
  while ((m = re.exec(blockText)) !== null) {
    map[m[1]] = m[2].toUpperCase();
  }
  return map;
}

const darkStart = css.indexOf(':root {');
const darkEnd = css.indexOf('[data-theme="light"]', darkStart);
const lightEnd = css.indexOf('/* Aliases for direct Tidewater mockup compatibility (Light) */', darkEnd);

const darkVars = extractVars(css.slice(darkStart, darkEnd));
const lightVars = extractVars(css.slice(darkEnd, lightEnd));

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function linearize(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relLuminance([r, g, b]) {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrastRatio(hexA, hexB) {
  const l1 = relLuminance(hexToRgb(hexA));
  const l2 = relLuminance(hexToRgb(hexB));
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

// Viénot 1999 sRGB simulation matrices for protanopia & deuteranopia
function simCvd([r, g, b], mode) {
  const lr = linearize(r);
  const lg = linearize(g);
  const lb = linearize(b);
  let sr, sg, sb;
  if (mode === 'protanopia') {
    sr = 0.152286 * lr + 1.052583 * lg - 0.204868 * lb;
    sg = 0.114503 * lr + 0.786281 * lg + 0.099216 * lb;
    sb = -0.003882 * lr - 0.048116 * lg + 1.051998 * lb;
  } else {
    // deuteranopia
    sr = 0.367322 * lr + 0.860646 * lg - 0.227968 * lb;
    sg = 0.280085 * lr + 0.672501 * lg + 0.047413 * lb;
    sb = -0.01182 * lr + 0.04294 * lg + 0.968881 * lb;
  }
  const to8 = (v) => {
    const c = Math.max(0, Math.min(1, v));
    const srgb = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.round(srgb * 255);
  };
  return [to8(sr), to8(sg), to8(sb)];
}

function rgbDist(a, b) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

const textPairs = [
  ['ink on tile', '--tw-ink', '--tw-tile'],
  ['ink-2 on tile', '--tw-ink-2', '--tw-tile'],
  ['ink-3 on tile', '--tw-ink-3', '--tw-tile'],
  ['ink on pill', '--tw-ink', '--tw-pill'],
  ['ink-2 on pill', '--tw-ink-2', '--tw-pill'],
  ['ink-3 on pill', '--tw-ink-3', '--tw-pill'],
  ['gain on tile', '--tw-gain', '--tw-tile'],
  ['gain on gain-bg', '--tw-gain', '--tw-gain-bg'],
  ['loss on tile', '--tw-loss', '--tw-tile'],
  ['loss on loss-bg', '--tw-loss', '--tw-loss-bg'],
  ['warn on tile', '--tw-warn', '--tw-tile'],
  ['hero-ink on hero', '--tw-hero-ink', '--tw-hero'],
  ['hero-2 on hero', '--tw-hero-2', '--tw-hero'],
  ['hero-line on hero', '--tw-hero-line', '--tw-hero'],
  ['s1 on tile', '--tw-s1', '--tw-tile'],
];

const markPairs = [
  ['gain mark on track', '--tw-gain', '--tw-track'],
  ['loss mark on track', '--tw-loss', '--tw-track'],
  ['warn mark on track', '--tw-warn', '--tw-track'],
  ['s1 mark on tile', '--tw-s1', '--tw-tile'],
  ['s2 mark on tile', '--tw-s2', '--tw-tile'],
  ['s3 mark on tile', '--tw-s3', '--tw-tile'],
  ['focus mark on tile', '--tw-focus', '--tw-tile'],
];

let failures = 0;

function auditTheme(name, vars) {
  console.log(`\n=== ${name.toUpperCase()} THEME CONTRAST AUDIT ===`);
  for (const [label, fgKey, bgKey] of textPairs) {
    const fg = vars[fgKey];
    const bg = vars[bgKey];
    if (!fg || !bg) {
      console.log(`SKIP ${label} (missing ${fgKey} or ${bgKey})`);
      continue;
    }
    const ratio = contrastRatio(fg, bg);
    const pass = ratio >= 4.5;
    if (!pass) failures++;
    console.log(
      `${pass ? 'PASS' : 'FAIL'} [text >=4.5] ${label.padEnd(22)} ${fg} on ${bg} => ${ratio.toFixed(2)}:1`
    );
  }
  for (const [label, fgKey, bgKey] of markPairs) {
    const fg = vars[fgKey];
    const bg = vars[bgKey];
    if (!fg || !bg) continue;
    const ratio = contrastRatio(fg, bg);
    const pass = ratio >= 3.0;
    if (!pass) failures++;
    console.log(
      `${pass ? 'PASS' : 'FAIL'} [mark >=3.0] ${label.padEnd(22)} ${fg} on ${bg} => ${ratio.toFixed(2)}:1`
    );
  }

  console.log(`--- CVD Simulation (${name}) ---`);
  const cvdKeys = ['--tw-gain', '--tw-loss', '--tw-warn', '--tw-s1'];
  for (const mode of ['protanopia', 'deuteranopia']) {
    const gainSim = simCvd(hexToRgb(vars['--tw-gain']), mode);
    const lossSim = simCvd(hexToRgb(vars['--tw-loss']), mode);
    const dist = rgbDist(gainSim, lossSim);
    console.log(
      `${mode.padEnd(13)}: gain vs loss Euclidean RGB distance = ${dist.toFixed(1)} (always paired with +/-/text label)`
    );
    for (const k of cvdKeys) {
      const s = simCvd(hexToRgb(vars[k]), mode);
      const hexSim =
        '#' +
        s.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
      const ratioTile = contrastRatio(hexSim, vars['--tw-tile']);
      if (ratioTile < 3.0) {
        failures++;
        console.log(`FAIL [CVD mark >=3.0] ${k} simulated ${mode} (${hexSim}) on ${vars['--tw-tile']} => ${ratioTile.toFixed(2)}:1`);
      } else {
        console.log(`PASS [CVD mark >=3.0] ${k} (${mode}) => ${ratioTile.toFixed(2)}:1 on tile`);
      }
    }
  }
}

auditTheme('dark', darkVars);
auditTheme('light', lightVars);

console.log(`\nTotal failures: ${failures}`);
process.exit(failures > 0 ? 1 : 0);

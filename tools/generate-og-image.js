#!/usr/bin/env node
// Generates /og-image.png (1200x630) for social share previews.
// Run: node tools/generate-og-image.js
// Uses sharp to rasterize an SVG to PNG. No external fonts needed — DM Mono
// would require font embedding; we use the closest system serif via SVG text.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const W = 1200, H = 630;

// Colors match the site's palette (var(--paper), --ink, --accent)
const INK = '#0e0e0e';
const PAPER = '#f5f2ed';
const ACCENT = '#c8411a';
const MUTED = '#7a7670';
const BORDER = '#d4cfc7';

// Grid of 16 type codes as subtle background pattern
const TYPES = ['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'];

function svg() {
  // Background grid of 16 type labels, very subtle
  const cellW = W / 4, cellH = 110;
  const gridStartY = 150;
  const gridSvg = TYPES.map((t, i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const x = col * cellW + cellW / 2;
    const y = gridStartY + row * cellH + cellH / 2;
    return `<text x="${x}" y="${y}" font-family="monospace" font-size="28" font-weight="700" fill="${BORDER}" text-anchor="middle" dominant-baseline="middle">${t}</text>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <!-- subtle background type grid -->
  ${gridSvg}
  <!-- centered foreground card -->
  <rect x="80" y="180" width="1040" height="270" fill="${PAPER}" opacity="0.95"/>
  <text x="${W/2}" y="255" font-family="monospace" font-size="22" font-weight="500" fill="${MUTED}" text-anchor="middle" letter-spacing="4">PERSONALITY.FYI</text>
  <text x="${W/2}" y="335" font-family="monospace" font-size="56" font-weight="700" fill="${INK}" text-anchor="middle">Free MBTI personality test</text>
  <text x="${W/2}" y="395" font-family="monospace" font-size="36" font-weight="500" fill="${INK}" text-anchor="middle">Find your type in 60 seconds</text>
  <text x="${W/2}" y="450" font-family="monospace" font-size="22" fill="${MUTED}" text-anchor="middle">16 types \u00b7 career fit \u00b7 compatibility \u00b7 honest analysis</text>
  <!-- accent rule -->
  <rect x="${(W-120)/2}" y="485" width="120" height="3" fill="${ACCENT}"/>
</svg>`;
}

(async () => {
  const svgBuf = Buffer.from(svg());
  const outPath = path.join(__dirname, '..', 'og-image.png');
  await sharp(svgBuf).png().toFile(outPath);
  const stat = fs.statSync(outPath);
  console.log('Wrote og-image.png ' + (stat.size / 1024).toFixed(1) + 'kb');
})();

#!/usr/bin/env node
// Einmaliges Rendern der PWA-PNG-Icons aus einem maskable-sicheren Bauhaus-SVG
// (Vollflächiger Tinte-Hintergrund, Formen in der zentralen Safe-Zone).
// Aufruf: node scripts/gen-icons.ts   (Ergebnis in static/icons/, committen)
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "static", "icons");
mkdirSync(OUT, { recursive: true });

// 512er-Grid, Formen zentriert mit Rand (Maskable-Safe-Zone ~80 %).
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1a1a1a"/>
  <circle cx="200" cy="212" r="96" fill="#f3c019"/>
  <path d="M300 104 H416 V220 Z" fill="#e0382c"/>
  <rect x="288" y="300" width="120" height="120" fill="#2350a8"/>
  <rect x="98" y="360" width="132" height="40" rx="20" fill="#ffffff"/>
</svg>`;

const buf = Buffer.from(SVG);
const targets: Array<[string, number]> = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["icon-maskable-512.png", 512],
  ["apple-touch-icon.png", 180],
];

for (const [name, size] of targets) {
  await sharp(buf).resize(size, size).png().toFile(join(OUT, name));
  console.log("✓", name, `${size}×${size}`);
}
console.log("Fertig.");

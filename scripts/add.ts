#!/usr/bin/env node
// Orchestrator: verkettet die drei Schritte für ein neues Rezept.
//   1. Import   – Entwurf aus Foto / URL / Text (scripts/import-photo.ts)
//   2. Bilder   – fehlendes Aquarell-Badge erzeugen (scripts/gen-images.ts)
//   3. PDF      – Karte(n) rendern (src/cli.ts)
//
// Verwendung:
//   npm run add -- <foto.heic | https://… | "Rezepttext" | datei.txt> [--category <name>]
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
  console.log(`add — Rezept in einem Schritt anlegen (Import → Bild → PDF)

Verwendung:
  npm run add -- <foto | url | text | datei> [--category <name>]

Beispiele:
  npm run add -- foto.heic
  npm run add -- "https://example.com/rezept"
  npm run add -- "500 g Mehl, 3 Eier … (Rezepttext)"`);
  process.exit(args.length === 0 ? 1 : 0);
}

function step(title: string, cmd: string, cmdArgs: string[]): void {
  console.error(`\n▶ ${title}`);
  execFileSync(cmd, cmdArgs, { cwd: ROOT, stdio: "inherit" });
}

// 1) Import (reicht alle Argumente durch: Eingabe + evtl. --category/--force)
step("Import", "node", ["scripts/import-photo.ts", ...args]);
// 2) Bilder (erzeugt nur fehlende Badges)
step("Bildgenerierung", "node", ["scripts/gen-images.ts"]);
// 3) PDF-Rendering
step("PDF-Rendering", "node", ["scripts/cli.ts"]);

console.error("\n✓ Fertig.");

#!/usr/bin/env node
// Bibliothek vervollständigen: fehlende Aquarell-Bilder erzeugen und alle
// PDFs rendern. Für bestehende Rezepte gedacht (z. B. nach einem Reimport).
//
// Verwendung:
//   npm run refresh                                            # ./recipes → ./out
//   npm run refresh -- --input <dir> --out <dir>               # auch außerhalb des Projekts
//   npm run refresh -- --category backen                       # nur Kategorie filtern
//
// (Für eine einzelne neue Eingabe – Foto/URL/Text – nutze stattdessen `npm run add`.)
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

if (args[0] === "-h" || args[0] === "--help") {
  console.log(`refresh — fehlende Bilder erzeugen + alle PDFs rendern

Verwendung:
  npm run refresh -- [--input <dir>] [--out <dir>] [--category <name>] [--tag <name>] …

Die Optionen werden 1:1 an den Renderer durchgereicht; --input wird zusätzlich
für die Bildgenerierung verwendet.`);
  process.exit(0);
}

// --input <dir> für gen-images als Positional extrahieren; ans cli alles durchreichen.
let inputDir: string | undefined;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--input" && i + 1 < args.length) {
    inputDir = args[i + 1];
    break;
  }
}

function step(title: string, cmd: string, cmdArgs: string[]): void {
  console.error(`\n▶ ${title}`);
  execFileSync(cmd, cmdArgs, { cwd: ROOT, stdio: "inherit" });
}

step(
  "Bilder (fehlende erzeugen)",
  "node",
  ["scripts/gen-images.ts", ...(inputDir ? [inputDir] : [])],
);
step("PDF-Rendering", "node", ["src/cli.ts", ...args]);

console.error("\n✓ Fertig.");

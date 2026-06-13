#!/usr/bin/env node
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { matchesFilter } from "../core/filter.ts";
import { parseRecipe } from "../core/parse.ts";
import { getProjectRoot } from "../core/paths.ts";
import { renderCard } from "../core/render.ts";
import { findRecipeFiles } from "../core/scan.ts";

const PROJECT_ROOT = getProjectRoot(resolve(dirname(fileURLToPath(import.meta.url)), ".."));

function printHelp(): void {
  console.log(`recipe-cards — A5-Rezeptkarten aus YAML-Rezepten erzeugen

Verwendung:
  recipe-cards [verzeichnis] [optionen]
  recipe-cards --input <ordner> --out <ordner> [optionen]

Beide Ordner sind frei wählbar (auch außerhalb des Projekts) – z.B. um eine
heruntergeladene Sammlung lokal neu zu rendern (Reimport).

Argumente:
  verzeichnis            Eingabe-Ordner mit .md-Rezepten (Standard: ./recipes)

Optionen:
  --input <ordner>       Eingabe-Ordner (Alternative zum Positional-Argument)
  --out <ordner>         Zielordner für PDFs (Standard: ./out)
  --scale <faktor>       Mengen in der Zutatenliste skalieren, z.B. 2 oder 0.5
  --category <name>      nur Rezepte dieser Kategorie
  --tag <name>           nur Rezepte mit diesem Tag
  --grouping <name>      nur Rezepte dieser Gruppierung
  -h, --help             diese Hilfe anzeigen`);
}

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      input: { type: "string" },
      out: { type: "string" },
      scale: { type: "string" },
      category: { type: "string" },
      tag: { type: "string" },
      grouping: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    printHelp();
    return;
  }

  const recipesDir = resolve(values.input ?? positionals[0] ?? join(PROJECT_ROOT, "recipes"));
  const outDir = resolve(values.out ?? join(PROJECT_ROOT, "out"));

  const scale = values.scale != null ? Number(values.scale.replace(",", ".")) : 1;
  if (!Number.isFinite(scale) || scale <= 0) {
    console.error(`Ungültiger Skalierungsfaktor: ${values.scale}`);
    process.exit(1);
  }

  let files: string[];
  try {
    files = findRecipeFiles(recipesDir);
  } catch {
    console.error(`Verzeichnis nicht lesbar: ${recipesDir}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.error(`Keine .md-Rezepte in ${recipesDir} gefunden.`);
    process.exit(1);
  }

  const filter = {
    category: values.category,
    tag: values.tag,
    grouping: values.grouping,
  };

  let rendered = 0;
  let skipped = 0;
  let failed = 0;
  let overlong = 0;

  for (const file of files) {
    let recipe;
    try {
      recipe = parseRecipe(file);
    } catch (err) {
      console.error(`✗ ${file}: ${(err as Error).message}`);
      failed++;
      continue;
    }

    if (!matchesFilter(recipe, filter)) {
      skipped++;
      continue;
    }

    try {
      // Kategorie-Struktur aus dem Eingabe-Ordner im Output spiegeln.
      const sub = dirname(relative(recipesDir, recipe.sourceFile));
      const effectiveOut = sub && sub !== "." ? join(outDir, sub) : outDir;
      const { pdfPath, pages, scaleFront, scaleBack } = renderCard(recipe, {
        projectRoot: PROJECT_ROOT,
        outDir: effectiveOut,
        scale,
      });
      const pageInfo = pages > 0 ? ` (${pages} ${pages === 1 ? "Seite" : "Seiten"})` : "";
      const minScale = Math.min(scaleFront, scaleBack);
      const fitNote = minScale < 1 ? ` · Schrift auf ${Math.round(minScale * 100)}% verkleinert` : "";
      if (pages > 2) {
        console.log(`⚠ ${recipe.meta.title}${pageInfo} → ${pdfPath}  [über 2 Seiten – bitte kürzen]`);
        overlong++;
      } else {
        console.log(`✓ ${recipe.meta.title}${pageInfo}${fitNote} → ${pdfPath}`);
      }
      rendered++;
    } catch (err) {
      const detail = (err as { stderr?: Buffer }).stderr?.toString() ?? (err as Error).message;
      console.error(`✗ ${recipe.meta.title}: Typst-Fehler\n${detail}`);
      failed++;
    }
  }

  const scaleNote = scale !== 1 ? ` (skaliert ×${scale})` : "";
  const overlongNote = overlong > 0 ? `, ${overlong} über 2 Seiten` : "";
  console.log(
    `\nFertig: ${rendered} erzeugt${scaleNote}, ${skipped} gefiltert, ${failed} fehlgeschlagen${overlongNote}.`,
  );
  if (failed > 0) process.exit(1);
}

main();

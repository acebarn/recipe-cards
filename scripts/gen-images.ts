#!/usr/bin/env node
// CLI: KI-Aquarell-Symbole pro Rezept via Pixazo FLUX.1 [schnell].
// Die Generierung liegt in core/services/gen-image.ts; hier nur Argument-Parsing,
// das Durchlaufen der Rezepte und das Caching unter assets/<slug>.<ext>.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadDotEnv } from "../core/env.ts";
import type { Recipe } from "../core/model.ts";
import { parseRecipe } from "../core/parse.ts";
import { getProjectRoot } from "../core/paths.ts";
import { slugify } from "../core/render.ts";
import { findRecipeFiles } from "../core/scan.ts";
import {
  DEFAULT_IMAGE_SIZE,
  DEFAULT_IMAGE_STEPS,
  generateRecipeImage,
} from "../core/services/gen-image.ts";

const PROJECT_ROOT = getProjectRoot(resolve(dirname(fileURLToPath(import.meta.url)), ".."));

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      force: { type: "boolean" },
      size: { type: "string" },
      steps: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(`gen-images — KI-Aquarell-Symbole pro Rezept via Pixazo FLUX.1 [schnell]

Verwendung:
  node scripts/gen-images.ts [verzeichnis] [--force] [--size <px>] [--steps <n>]

Voraussetzung:
  PIXAZO_API_KEY in der Umgebung oder in einer .env-Datei im Projekt-Root.
  (Pixazo-Dashboard → API Key, Header Ocp-Apim-Subscription-Key)

Optionen:
  --force          vorhandene Bilder neu erzeugen (sonst übersprungen)
  --size <px>      Kantenlänge des quadratischen Bildes (Standard: ${DEFAULT_IMAGE_SIZE})
  --steps <n>      Diffusions-Schritte 1–8 (Standard: ${DEFAULT_IMAGE_STEPS})
  -h, --help       diese Hilfe`);
    return;
  }

  loadDotEnv(PROJECT_ROOT);
  const apiKey = process.env.PIXAZO_API_KEY;
  if (!apiKey) {
    console.error(
      "Fehlender API-Key. Setze PIXAZO_API_KEY (z.B. in einer .env-Datei). Siehe .env.example.",
    );
    process.exit(1);
  }

  const size = values.size ? Number(values.size) : DEFAULT_IMAGE_SIZE;
  const steps = values.steps ? Math.min(8, Math.max(1, Number(values.steps))) : DEFAULT_IMAGE_STEPS;
  const recipesDir = resolve(positionals[0] ?? join(PROJECT_ROOT, "recipes"));
  const assetsDir = join(PROJECT_ROOT, "assets");
  mkdirSync(assetsDir, { recursive: true });

  const files = findRecipeFiles(recipesDir);
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    let recipe: Recipe;
    try {
      recipe = parseRecipe(file);
    } catch {
      continue; // nicht-konforme Rezepte überspringen
    }

    const slug = slugify(recipe);
    const existing = ["png", "jpg", "jpeg", "webp"]
      .map((e) => join(assetsDir, `${slug}.${e}`))
      .find(existsSync);
    if (existing && !values.force) {
      console.log(`• übersprungen (existiert): ${slug}`);
      skipped++;
      continue;
    }

    try {
      const { buffer, ext } = await generateRecipeImage(recipe, slug, { apiKey, size, steps });
      // stale Dateien anderer Endung für diesen Slug entfernen
      for (const e of ["png", "jpg", "jpeg", "webp"]) {
        const p = join(assetsDir, `${slug}.${e}`);
        if (existsSync(p)) rmSync(p);
      }
      writeFileSync(join(assetsDir, `${slug}.${ext}`), buffer);
      console.log(`✓ ${recipe.meta.title} → assets/${slug}.${ext}`);
      created++;
    } catch (err) {
      console.error(`✗ ${recipe.meta.title}: ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\nFertig: ${created} erzeugt, ${skipped} übersprungen, ${failed} fehlgeschlagen.`);
  if (failed > 0) process.exit(1);
}

main();

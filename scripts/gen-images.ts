#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadDotEnv } from "../src/env.ts";
import type { Recipe } from "../src/model.ts";
import { parseRecipe } from "../src/parse.ts";
import { slugify } from "../src/render.ts";
import { findRecipeFiles } from "../src/scan.ts";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Pixazo FLUX.1 [schnell] — günstig (~$0,0012/Bild), synchroner Flow.
const ENDPOINT = "https://gateway.pixazo.ai/flux-1-schnell/v1/getData";
const DEFAULT_SIZE = 1024; // quadratisch fürs runde Badge
const DEFAULT_STEPS = 4; // schnell-Default (max. 8)

// Komposition: Motiv groß und mittig, damit das runde Badge gut gefüllt ist.
const COMPOSITION =
  "close-up, centered composition, the subject fills most of the frame";

// Einheitlicher Aquarell-Stil für ALLE Rezepte → konsistenter Look.
// Bewusst ohne Anführungszeichen im Subjekt (FLUX rendert zitierten Text sonst wörtlich).
const STYLE =
  "minimalist watercolor food illustration, soft loose painterly washes, gentle pastel tones, " +
  "single subject isolated on a pure white background, " +
  "no plate, no dish, no cutlery, no background scenery, " +
  "absolutely no text, no words, no letters, no captions, no labels, no watermark, " +
  "consistent hand-painted watercolor style";

/**
 * Baut den englischen Bild-Prompt. Priorität:
 *   1. image_prompt  → vollständig übernommen (nur Stil angehängt)
 *   2. image_subject → englische Gerichtsbeschreibung (empfohlen)
 *   3. title         → deutscher Titel als Notlösung (oft ungenau)
 */
function buildPrompt(recipe: Recipe): string {
  if (recipe.meta.image_prompt) return `${recipe.meta.image_prompt}. ${STYLE}.`;
  const subject = recipe.meta.image_subject ?? recipe.meta.title;
  return `A watercolor food icon of ${subject}. ${COMPOSITION}. ${STYLE}.`;
}

/** Bestimmt die Dateiendung anhand der Magic Bytes (Pixazo liefert JPEG). */
function extFor(buf: Buffer): "jpg" | "png" | "webp" {
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  if (buf[0] === 0x89 && buf[1] === 0x50) return "png";
  if (buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return "jpg";
}

/** Deterministischer Seed aus dem Slug, damit erneute Läufe dasselbe Bild liefern. */
function seedFrom(slug: string): number {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) % 2147483647;
  return h;
}

async function generate(
  prompt: string,
  apiKey: string,
  opts: { size: number; steps: number; seed: number },
): Promise<Buffer> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "Ocp-Apim-Subscription-Key": apiKey,
    },
    body: JSON.stringify({
      prompt,
      num_steps: opts.steps,
      seed: opts.seed,
      width: opts.size,
      height: opts.size,
    }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300)}`);
  }

  const data = (await res.json()) as { output?: string };
  if (!data.output) {
    throw new Error(`Keine Bild-URL in der Antwort: ${JSON.stringify(data).slice(0, 300)}`);
  }

  // Antwort liefert eine URL zum PNG → herunterladen.
  const img = await fetch(data.output);
  if (!img.ok) throw new Error(`Bild-Download fehlgeschlagen: HTTP ${img.status} (${data.output})`);
  return Buffer.from(await img.arrayBuffer());
}

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
  --size <px>      Kantenlänge des quadratischen Bildes (Standard: ${DEFAULT_SIZE})
  --steps <n>      Diffusions-Schritte 1–8 (Standard: ${DEFAULT_STEPS})
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

  const size = values.size ? Number(values.size) : DEFAULT_SIZE;
  const steps = values.steps ? Math.min(8, Math.max(1, Number(values.steps))) : DEFAULT_STEPS;
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

    const prompt = buildPrompt(recipe);
    try {
      const img = await generate(prompt, apiKey, { size, steps, seed: seedFrom(slug) });
      // stale Dateien anderer Endung für diesen Slug entfernen
      for (const e of ["png", "jpg", "jpeg", "webp"]) {
        const p = join(assetsDir, `${slug}.${e}`);
        if (existsSync(p)) rmSync(p);
      }
      const ext = extFor(img);
      writeFileSync(join(assetsDir, `${slug}.${ext}`), img);
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

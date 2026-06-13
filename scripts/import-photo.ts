#!/usr/bin/env node
// CLI: Rezept aus Foto, Webseite oder Text generieren (Google Gemini).
// Die Extraktions-Logik liegt in core/services/import-recipe.ts; hier nur
// Argument-Parsing und die Datei-Ablage unter recipes/<kategorie>/.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadDotEnv } from "../core/env.ts";
import { parseRecipe } from "../core/parse.ts";
import { getProjectRoot } from "../core/paths.ts";
import { slugify } from "../core/render.ts";
import {
  DEFAULT_IMPORT_MODEL,
  extOf,
  IMG_EXT,
  importRecipeMarkdown,
  isUrl,
  resolveInput,
  type Input,
} from "../core/services/import-recipe.ts";

const PROJECT_ROOT = getProjectRoot(resolve(dirname(fileURLToPath(import.meta.url)), ".."));

// ---------------- Ablage ----------------

/** Sanitisiert einen (ggf. modellgenerierten) Ordnernamen → kein Pfad-Traversal. */
function safeFolder(name: string): string {
  const cleaned = name
    .replace(/[^\p{L}\p{N} _-]+/gu, "") // nur Buchstaben/Ziffern/Leerzeichen/_/-
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 60)
    .trim();
  return cleaned || "_import";
}

/** Findet den passenden Kategorie-Ordner unter recipes/ (z.B. "backen" → "3 backen"); legt sonst einen an. */
function categoryDir(recipesRoot: string, category: string | undefined): string {
  const dirs = readdirSync(recipesRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name);
  if (category) {
    const cat = category.toLowerCase();
    const match = dirs.find((d) => {
      const n = d.toLowerCase();
      return n === cat || n.endsWith(" " + cat) || n.split(" ").includes(cat);
    });
    return join(recipesRoot, match ?? safeFolder(category));
  }
  return join(recipesRoot, "_import");
}

/** Eindeutigen Dateinamen finden (slug.md, slug-2.md, …). */
function uniquePath(dir: string, slug: string): string {
  let candidate = join(dir, `${slug}.md`);
  let i = 2;
  while (existsSync(candidate)) {
    candidate = join(dir, `${slug}-${i}.md`);
    i++;
  }
  return candidate;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      model: { type: "string" },
      category: { type: "string" }, // Kategorie-Ordner überschreiben
      stdout: { type: "boolean" }, // nur ausgeben, nicht schreiben
      force: { type: "boolean" }, // vorhandene Datei überschreiben
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(`import — Rezept aus Foto, Webseite oder Text generieren (Google Gemini)

Verwendung:
  node scripts/import-photo.ts <eingabe …> [optionen]

Die Eingabeart wird automatisch erkannt:
  • Bilddatei(en)  → Foto-Modus (mehrere Bilder = mehrseitiges Rezept)
  • http(s)-URL    → Webseite wird geladen und ausgewertet
  • Textdatei      → Inhalt wird als Rezepttext gelesen
  • sonst / "-"    → Fließtext (Argumente oder stdin)

Beispiele:
  node scripts/import-photo.ts foto.heic
  node scripts/import-photo.ts https://example.com/mein-rezept
  node scripts/import-photo.ts "500 g Mehl, 3 Eier … (Rezepttext)"
  pbpaste | node scripts/import-photo.ts -

Voraussetzung:
  GEMINI_API_KEY in der Umgebung oder in einer .env-Datei im Projekt-Root.

Optionen:
  --category <name>  Ziel-Kategorieordner erzwingen (sonst aus dem Inhalt abgeleitet)
  --stdout           Ergebnis nur ausgeben, keine Datei schreiben
  --force            vorhandene Datei überschreiben statt zu nummerieren
  --model <name>     Gemini-Modell (Standard: ${DEFAULT_IMPORT_MODEL})
  -h, --help         diese Hilfe`);
    return;
  }

  loadDotEnv(PROJECT_ROOT);
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error("Fehlender API-Key. Setze GEMINI_API_KEY (z.B. in einer .env-Datei).");
    process.exit(1);
  }

  // Bild-Argumente, die wie Dateien aussehen, aber fehlen → klarer Hinweis.
  for (const p of positionals) {
    if (!isUrl(p) && p !== "-" && IMG_EXT.has(extOf(p)) && !existsSync(p)) {
      console.error(`Datei nicht gefunden: ${p}`);
      process.exit(1);
    }
  }

  let input: Input | null;
  try {
    input = await resolveInput(positionals);
  } catch (err) {
    console.error(`Eingabe konnte nicht gelesen werden: ${(err as Error).message}`);
    process.exit(1);
  }
  if (!input) {
    console.error("Keine Eingabe. Übergib eine Bilddatei, eine URL oder Rezepttext (oder via stdin). Siehe --help.");
    process.exit(1);
  }

  const model = values.model ?? DEFAULT_IMPORT_MODEL;
  console.error(`Lese ${input.label} mit ${model} …`);

  let markdown: string;
  try {
    markdown = await importRecipeMarkdown(input, { apiKey, model });
  } catch (err) {
    console.error(`Extraktion fehlgeschlagen: ${(err as Error).message}`);
    process.exit(1);
  }

  if (values.stdout) {
    process.stdout.write(markdown + "\n");
    return;
  }

  // Titel/Kategorie/Slug aus dem erzeugten Markdown gewinnen (über einen Temp-Parse).
  const recipesRoot = join(PROJECT_ROOT, "recipes");
  let slug = "rezept-" + Date.now();
  let category: string | undefined;
  let title = "(unbekannt)";
  const tmp = join(PROJECT_ROOT, ".import-tmp.md");
  try {
    writeFileSync(tmp, markdown, "utf8");
    const recipe = parseRecipe(tmp);
    title = recipe.meta.title;
    slug = slugify(recipe);
    category = recipe.meta.category;
  } catch {
    console.error("Hinweis: erzeugtes Rezept ließ sich nicht sauber parsen – schreibe Rohausgabe.");
  } finally {
    if (existsSync(tmp)) rmSync(tmp);
  }

  const dir = values.category
    ? join(recipesRoot, safeFolder(values.category))
    : categoryDir(recipesRoot, category);
  mkdirSync(dir, { recursive: true });

  let target = join(dir, `${slug}.md`);
  if (existsSync(target) && !values.force) target = uniquePath(dir, slug);
  writeFileSync(target, markdown.endsWith("\n") ? markdown : markdown + "\n", "utf8");

  const rel = target.replace(PROJECT_ROOT + "/", "");
  console.error(`\n✓ Entwurf erstellt: ${title}\n  → ${rel}\n`);
  console.error("Nächste Schritte: Entwurf prüfen/anpassen, dann:");
  console.error("  npm run images   # Aquarell-Bild erzeugen");
  console.error("  npm start        # Karte rendern");
}

main();

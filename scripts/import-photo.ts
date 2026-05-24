#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadDotEnv } from "../src/env.ts";
import { parseRecipe } from "../src/parse.ts";
import { slugify } from "../src/render.ts";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_MODEL = "gemini-3.5-flash";

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
};

function mimeFor(path: string): string {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  return MIME[ext] ?? "image/jpeg";
}

const today = () => new Date().toISOString().slice(0, 10);

/** Detaillierte Anweisung an Gemini, das Rezept ins Template-Format zu gießen. */
function buildPrompt(): string {
  return `Du erhältst ein oder mehrere Fotos einer Rezeptseite (z.B. aus einem Kochbuch).
Lies das Rezept vollständig aus und gib es EXAKT im folgenden Markdown-Format mit YAML-Frontmatter zurück.
Antworte AUSSCHLIESSLICH mit dem Markdown-Inhalt – keine Code-Fences, keine Erklärungen, kein Vor-/Nachtext.

Regeln:
- Sprache des Rezepts: Deutsch. Übersetze fremdsprachige Inhalte ins Deutsche.
- WICHTIG: Formuliere Schritte und Hinweise in EIGENEN, knappen Worten neu (sinngemäß, nicht wörtlich von der Vorlage abgeschrieben). Zutaten, Mengen und Kerndaten exakt übernehmen.
- Fülle nur Felder, die du sicher erkennst; unsichere Felder leer lassen (Schlüssel trotzdem ausgeben).
- prep_time/cook_time/rest_time: als "H:MM" (z.B. 1:30) ODER als reine Minutenzahl. Nur angeben, wenn erkennbar.
- servings: ganze Zahl (Portionen/Stück).
- difficulty: genau eines von easy, medium, hard – oder leer.
- category: ein kurzes Schlagwort, bevorzugt eines von: grundwissen, kochen, backen, salate, saucen, desserts, getränke.
- tags: 1-4 kurze Schlagwörter.
- equipment: benötigte Geräte/Gefäße, je Eintrag eine Zeile.
- source_url: nur wenn im Foto eine URL steht, sonst leer.
- theme_color: leer lassen.
- image_subject: KURZE ENGLISCHE Beschreibung des fertigen Gerichts für eine Aquarell-Illustration (z.B. a slice of apple pie with lattice crust). OHNE Anführungszeichen.
- last_modified: ${today()}
- "## Zutaten": bei Bedarf in "### Unterabschnitte" gliedern; jede Zutat als "- Menge Einheit Zutat".
- "## Schritte": nummerierte Liste "1. ...". Wichtige Zutaten, Zeiten und Temperaturen mit **fett** hervorheben.
- "## Hinweise": NUR kurze, praktische Tipps als "- ..." (höchstens 3 Stichpunkte, je ein knapper Satz). KEINE langen Hintergrundtexte, Anekdoten oder wörtlichen Zitate. Weglassen, wenn es keine echten Tipps gibt.

Gib genau diese Struktur aus:
---
title:
tags:
  -
category:
grouping:
prep_time:
cook_time:
rest_time:
servings:
equipment:
  -
difficulty:
source_url:
theme_color:
image_subject:
last_modified: ${today()}
---
# <Titel>

## Zutaten
- ...

## Schritte
1. ...

## Hinweise
- ...`;
}

interface Part {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

async function extractRecipe(
  images: string[],
  apiKey: string,
  model: string,
): Promise<string> {
  const parts: Part[] = images.map((p) => ({
    inline_data: { mime_type: mimeFor(p), data: readFileSync(p).toString("base64") },
  }));
  parts.push({ text: buildPrompt() });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.2 },
    }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Part[] }; finishReason?: string }>;
  };
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) {
    const reason = cand?.finishReason ?? "?";
    if (reason === "RECITATION") {
      throw new Error(
        "Gemini hat die Antwort wegen des Recitation-Filters blockiert " +
          "(Ausgabe zu wörtlich an geschütztem Text). Tipp: erneut versuchen oder ein anderes " +
          "Modell wählen (--model gemini-3-flash-preview / gemini-2.5-pro). " +
          "Das Skript bittet bereits um Paraphrasierung.",
      );
    }
    if (reason === "SAFETY") {
      throw new Error("Gemini hat die Antwort aus Sicherheitsgründen blockiert (finishReason: SAFETY).");
    }
    throw new Error(`Leere Antwort (finishReason: ${reason}): ${JSON.stringify(data).slice(0, 200)}`);
  }
  return stripFences(text);
}

/** Entfernt evtl. doch vorhandene ```-Code-Fences. */
function stripFences(s: string): string {
  const t = s.trim();
  if (t.startsWith("```")) {
    return t.replace(/^```[a-zA-Z]*\r?\n/, "").replace(/\r?\n```\s*$/, "").trim();
  }
  return t;
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
    return join(recipesRoot, match ?? category);
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

  if (values.help || positionals.length === 0) {
    console.log(`import-photo — Rezept aus Foto(s) generieren (Google Gemini Vision)

Verwendung:
  node scripts/import-photo.ts <foto> [weiteres-foto …] [optionen]

Voraussetzung:
  GEMINI_API_KEY in der Umgebung oder in einer .env-Datei im Projekt-Root.

Optionen:
  --category <name>  Ziel-Kategorieordner erzwingen (sonst aus dem Foto abgeleitet)
  --stdout           Ergebnis nur ausgeben, keine Datei schreiben
  --force            vorhandene Datei überschreiben statt zu nummerieren
  --model <name>     Gemini-Modell (Standard: ${DEFAULT_MODEL})
  -h, --help         diese Hilfe

Mehrere Fotos = mehrseitiges Rezept (werden gemeinsam ausgewertet).`);
    return;
  }

  loadDotEnv(PROJECT_ROOT);
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error("Fehlender API-Key. Setze GEMINI_API_KEY (z.B. in einer .env-Datei).");
    process.exit(1);
  }

  const images = positionals.map((p) => resolve(p));
  for (const img of images) {
    if (!existsSync(img)) {
      console.error(`Bilddatei nicht gefunden: ${img}`);
      process.exit(1);
    }
  }

  const model = values.model ?? DEFAULT_MODEL;
  console.error(`Lese ${images.length} Foto(s) mit ${model} …`);

  let markdown: string;
  try {
    markdown = await extractRecipe(images, apiKey, model);
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
    ? join(recipesRoot, values.category)
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

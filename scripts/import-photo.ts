#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadDotEnv } from "../src/env.ts";
import { parseRecipe } from "../src/parse.ts";
import { slugify } from "../src/render.ts";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_MODEL = "gemini-3.5-flash";

const IMG_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"]);
const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
};

const extOf = (p: string) => p.toLowerCase().split(".").pop() ?? "";
const mimeFor = (p: string) => MIME[extOf(p)] ?? "image/jpeg";
const isUrl = (s: string) => /^https?:\/\//i.test(s);
const isImageFile = (s: string) => existsSync(s) && IMG_EXT.has(extOf(s));

const today = () => new Date().toISOString().slice(0, 10);

/** Detaillierte Anweisung an Gemini, das Rezept ins Template-Format zu gießen. */
function buildPrompt(): string {
  return `Du erhältst den Inhalt eines Rezepts – als Foto(s), Webseiten-Text oder Fließtext.
Extrahiere das Rezept und gib es EXAKT im folgenden Markdown-Format mit YAML-Frontmatter zurück.
Antworte AUSSCHLIESSLICH mit dem Markdown-Inhalt – keine Code-Fences, keine Erklärungen, kein Vor-/Nachtext.
Bei Webseiten-Text: ignoriere Navigation, Werbung, Kommentare und Beiwerk; extrahiere nur das eigentliche Rezept.

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
- source_url: die Quell-URL, falls angegeben oder im Inhalt erkennbar, sonst leer.
- theme_color: leer lassen.
- image_subject: KURZE ENGLISCHE Beschreibung des fertigen Gerichts für eine Aquarell-Illustration (z.B. a slice of apple pie with lattice crust). OHNE Anführungszeichen.
- last_modified: ${today()}
- "## Zutaten": bei Bedarf in "### Unterabschnitte" gliedern; jede Zutat als "- Menge Einheit Zutat".
- "## Schritte": nummerierte Liste "1. ...". Wichtige Zutaten, Zeiten und Temperaturen mit **fett** hervorheben.
- "## Hinweise": NUR kurze, praktische Tipps als "- ..." (höchstens 3 Stichpunkte, je ein knapper Satz). KEINE langen Hintergrundtexte, Anekdoten oder wörtlichen Zitate. Weglassen, wenn es keine echten Tipps gibt.

Gib genau diese Struktur aus. WICHTIG: Die erste Zeile der Antwort MUSS "---" sein und das Frontmatter MUSS mit einer Zeile "---" abgeschlossen werden:
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

// ---------------- Eingabe-Erkennung ----------------

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß",
  eacute: "é", egrave: "è", agrave: "à", deg: "°", frac12: "½", frac14: "¼", frac34: "¾",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITIES[name] ?? m);
}

/** Grobe HTML→Text-Umwandlung (Skripte/Styles raus, Tags zu Zeilenumbrüchen). */
function htmlToText(html: string): string {
  const s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|ul|ol|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(s)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** SSRF-Schutz: blockt localhost, interne Hostnamen und private/Link-Local-IPs. */
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    h === "localhost" ||
    h.endsWith(".local") ||
    h.endsWith(".localhost") ||
    ["supervisor", "homeassistant", "hassio", "host"].includes(h)
  ) {
    return true;
  }
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // Link-Local inkl. Cloud-Metadaten
  }
  if (h === "::1" || h.startsWith("fe80") || h.startsWith("fc") || h.startsWith("fd")) return true;
  return false;
}

function assertPublicUrl(raw: string): void {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`Ungültige URL: ${raw}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`Nicht unterstütztes Protokoll: ${u.protocol}`);
  }
  if (isPrivateHost(u.hostname)) {
    throw new Error("Interne/private Adressen sind nicht erlaubt.");
  }
}

async function fetchUrlText(url: string): Promise<string> {
  assertPublicUrl(url);
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
      "accept-language": "de,en;q=0.8",
    },
    redirect: "follow",
  });
  // Auch nach Redirects darf das Ziel nicht intern sein.
  try {
    if (res.url) assertPublicUrl(res.url);
  } catch (e) {
    throw new Error("Weiterleitung auf eine interne Adresse wurde blockiert.");
  }
  if (!res.ok) {
    const blocked = [401, 402, 403, 404, 429, 451].includes(res.status);
    const hint = blocked
      ? " Die Seite blockt vermutlich automatisierte Zugriffe – kopiere den Rezepttext und sende ihn direkt als Text."
      : "";
    throw new Error(`Webseite nicht erreichbar: HTTP ${res.status} ${res.statusText}.${hint}`);
  }
  const text = htmlToText(await res.text());
  if (!text) throw new Error("Konnte keinen Text aus der Webseite extrahieren.");
  return text.slice(0, 60000);
}

function readStdin(): string {
  if (process.stdin.isTTY) return "";
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

type Input =
  | { mode: "images"; images: string[]; label: string }
  | { mode: "text"; text: string; sourceUrl?: string; label: string };

/** Erkennt anhand der Argumente, ob Bilder, eine URL oder Fließtext übergeben wurden. */
async function resolveInput(positionals: string[]): Promise<Input | null> {
  // stdin (kein Argument oder "-")
  if (positionals.length === 0 || (positionals.length === 1 && positionals[0] === "-")) {
    const text = readStdin().trim();
    return text ? { mode: "text", text, label: "Text (stdin)" } : null;
  }

  // alle Argumente sind Bilddateien → Foto-Modus (mehrere = mehrseitig)
  if (positionals.every(isImageFile)) {
    const images = positionals.map((p) => resolve(p));
    return { mode: "images", images, label: `${images.length} Foto(s)` };
  }

  // genau eine URL → Webseite laden
  if (positionals.length === 1 && isUrl(positionals[0])) {
    const url = positionals[0];
    return { mode: "text", text: await fetchUrlText(url), sourceUrl: url, label: `Webseite ${url}` };
  }

  // genau eine vorhandene (Nicht-Bild-)Datei → Textdatei lesen.
  // Enthält sie nur eine URL, wird die Webseite geladen (Inbox-Fall).
  if (positionals.length === 1 && existsSync(positionals[0])) {
    const raw = readFileSync(positionals[0], "utf8");
    const trimmed = raw.trim();
    if (isUrl(trimmed) && !/\s/.test(trimmed)) {
      return { mode: "text", text: await fetchUrlText(trimmed), sourceUrl: trimmed, label: `URL aus Datei (${trimmed})` };
    }
    return { mode: "text", text: raw, label: `Textdatei ${positionals[0]}` };
  }

  // sonst: Argumente als Fließtext zusammenfügen
  return { mode: "text", text: positionals.join(" "), label: "Fließtext" };
}

// ---------------- Gemini-Aufruf ----------------

async function callGemini(parts: Part[], apiKey: string, model: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.2 } }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Part[] }; finishReason?: string }>;
  };
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text) {
    const reason = cand?.finishReason ?? "?";
    if (reason === "RECITATION") {
      throw new Error(
        "Gemini hat die Antwort wegen des Recitation-Filters blockiert " +
          "(Ausgabe zu wörtlich an geschütztem Text). Tipp: erneut versuchen oder ein anderes " +
          "Modell wählen (--model gemini-3-flash-preview / gemini-2.5-pro).",
      );
    }
    if (reason === "SAFETY") {
      throw new Error("Gemini hat die Antwort aus Sicherheitsgründen blockiert (finishReason: SAFETY).");
    }
    throw new Error(`Leere Antwort (finishReason: ${reason}): ${JSON.stringify(data).slice(0, 200)}`);
  }
  return stripFences(text);
}

/** Baut die Gemini-Parts je nach Eingabeart. */
function partsFor(input: Input): Part[] {
  if (input.mode === "images") {
    const parts: Part[] = input.images.map((p) => ({
      inline_data: { mime_type: mimeFor(p), data: readFileSync(p).toString("base64") },
    }));
    parts.push({ text: buildPrompt() });
    return parts;
  }
  const src = input.sourceUrl ? `Quell-URL (source_url): ${input.sourceUrl}\n\n` : "";
  return [{ text: `${buildPrompt()}\n\n---\n${src}Rezept-Inhalt:\n\n${input.text}` }];
}

/**
 * Bereinigt die Modellausgabe und repariert das Frontmatter:
 * - entfernt ```-Code-Fences
 * - wenn das öffnende "---" fehlt (Gemini lässt es gelegentlich weg) oder Vorspann
 *   davor steht, wird der YAML-Kopf vor der ersten Markdown-Überschrift sauber
 *   in "---\n…\n---" eingerahmt, damit der Parser das Frontmatter zuverlässig findet.
 */
function stripFences(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\r?\n/, "").replace(/\r?\n```\s*$/, "").trim();
  }
  if (t.startsWith("---")) return t;

  // Body beginnt bei der ersten Markdown-Überschrift; alles davor ist der YAML-Kopf.
  const headingIdx = t.search(/(?:^|\n)#{1,6}\s/);
  if (headingIdx >= 0) {
    const head = t
      .slice(0, headingIdx)
      .split(/\r?\n/)
      .filter((line) => line.trim() !== "---") // verirrte ---/Begrenzer entfernen
      .join("\n")
      .trim();
    const body = t.slice(headingIdx).replace(/^\n+/, "");
    if (head) return `---\n${head}\n---\n\n${body}`;
  }
  return t;
}

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
  --model <name>     Gemini-Modell (Standard: ${DEFAULT_MODEL})
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

  const model = values.model ?? DEFAULT_MODEL;
  console.error(`Lese ${input.label} mit ${model} …`);

  let markdown: string;
  try {
    markdown = await callGemini(partsFor(input), apiKey, model);
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

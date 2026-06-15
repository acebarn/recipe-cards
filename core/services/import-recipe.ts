// Rezept-Import-Service: aus Foto(s), Webseite oder Text einen Rezept-Entwurf
// (Markdown mit YAML-Frontmatter) per Google Gemini erzeugen.
//
// Reine, wiederverwendbare Logik – genutzt sowohl von der CLI (scripts/import-photo.ts)
// als auch vom Web-/Bot-Add-Flow. Datei-Ablage/Argument-Parsing liegt bei den Aufrufern.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flattenIngredients } from "../ingredients.ts";
import type { Recipe } from "../model.ts";
import { parseRecipeFromString } from "../parse.ts";

export const DEFAULT_IMPORT_MODEL = "gemini-3.5-flash";

export const IMG_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"]);
const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
};

export const extOf = (p: string) => p.toLowerCase().split(".").pop() ?? "";
export const mimeFor = (p: string) => MIME[extOf(p)] ?? "image/jpeg";
export const isUrl = (s: string) => /^https?:\/\//i.test(s);
export const isImageFile = (s: string) => existsSync(s) && IMG_EXT.has(extOf(s));

const today = () => new Date().toISOString().slice(0, 10);

/** Detaillierte Anweisung an Gemini, das Rezept ins Template-Format zu gießen. */
export function buildImportPrompt(): string {
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
- region: Herkunft des Gerichts als deutsches Substantiv – ein Land (z.B. Italien, Japan, Mexiko), ein Kontinent oder eine Region (z.B. Levantinisch, Mediterran, Nordafrikanisch). Nur angeben, wenn sinnvoll erkennbar, sonst leer.
- category: GENAU EINEN dieser Keys (kleingeschrieben, nach Gang/Gericht-Typ):
  fruehstueck (Frühstück/Brunch), vorspeisen, snacks (Fingerfood/Streetfood),
  salate, suppen, eintoepfe (Eintopf/Chili/Gulasch), hauptgerichte (warmes Hauptgericht),
  beilagen (Beilage/Püree/Sättigung), grundrezepte (Basis wie Reis/Teig/Hummus),
  saucen (Saucen & Dips), brot (Brot/Pizzateig/herzhafte Kuchen wie Zwiebelkuchen),
  kuchen (süße Backwaren/Kuchen/Gebäck), desserts (Süßspeisen/Nachtisch), getraenke.
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
region:
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

export interface Part {
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
export function htmlToText(html: string): string {
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
export function isPrivateHost(host: string): boolean {
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

export function assertPublicUrl(raw: string): void {
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

export async function fetchUrlText(url: string): Promise<string> {
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

export type Input =
  | { mode: "images"; images: string[]; label: string }
  | { mode: "text"; text: string; sourceUrl?: string; label: string };

/** Erkennt anhand der Argumente, ob Bilder, eine URL oder Fließtext übergeben wurden. */
export async function resolveInput(positionals: string[]): Promise<Input | null> {
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

export async function callGemini(parts: Part[], apiKey: string, model: string): Promise<string> {
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
export function partsFor(input: Input): Part[] {
  if (input.mode === "images") {
    const parts: Part[] = input.images.map((p) => ({
      inline_data: { mime_type: mimeFor(p), data: readFileSync(p).toString("base64") },
    }));
    parts.push({ text: buildImportPrompt() });
    return parts;
  }
  const src = input.sourceUrl ? `Quell-URL (source_url): ${input.sourceUrl}\n\n` : "";
  return [{ text: `${buildImportPrompt()}\n\n---\n${src}Rezept-Inhalt:\n\n${input.text}` }];
}

/**
 * Bereinigt die Modellausgabe und repariert das Frontmatter:
 * - entfernt ```-Code-Fences
 * - wenn das öffnende "---" fehlt (Gemini lässt es gelegentlich weg) oder Vorspann
 *   davor steht, wird der YAML-Kopf vor der ersten Markdown-Überschrift sauber
 *   in "---\n…\n---" eingerahmt, damit der Parser das Frontmatter zuverlässig findet.
 */
export function stripFences(s: string): string {
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

// ---------------- High-Level-API ----------------

export interface ImportOptions {
  apiKey: string;
  model?: string;
}

/** Eingabe → bereinigtes Rezept-Markdown (Frontmatter + Body) via Gemini. */
export async function importRecipeMarkdown(input: Input, opts: ImportOptions): Promise<string> {
  return callGemini(partsFor(input), opts.apiKey, opts.model ?? DEFAULT_IMPORT_MODEL);
}

/** Eingabe → geparstes Recipe-Objekt (für DB-Insert/Bot/Web). */
export async function importRecipe(input: Input, opts: ImportOptions): Promise<Recipe> {
  const markdown = await importRecipeMarkdown(input, opts);
  return parseRecipeFromString(markdown, input.label);
}

// ---------------- Schritt → Zutat-Zuordnung (M3) ----------------

/** Gemini mit JSON-Ausgabe aufrufen und das Objekt geparst zurückgeben. */
async function callGeminiJson<T>(prompt: string, apiKey: string, model: string): Promise<T> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Part[] } }> };
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  const m = text.match(/\{[\s\S]*\}/); // robust gegen evtl. Code-Fences/Vorspann
  if (!m) throw new Error(`Keine JSON-Antwort: ${text.slice(0, 200)}`);
  return JSON.parse(m[0]) as T;
}

function buildStepMapPrompt(ingredients: string[], steps: string[]): string {
  const ing = ingredients.map((s, i) => `${i}: ${s}`).join("\n");
  const stp = steps.map((s, i) => `${i}: ${s}`).join("\n");
  return `Du erhältst die Zutaten und Schritte eines Rezepts, jeweils ab 0 nummeriert.
Gib für JEDEN Schritt die Indizes der Zutaten zurück, die in diesem Schritt verwendet,
hinzugefügt oder verarbeitet werden. Nur Zutaten – keine Werkzeuge, keine Mengen.
Wenn ein Schritt keine konkrete Zutat verwendet, gib eine leere Liste zurück.

Antworte AUSSCHLIESSLICH als JSON in genau dieser Form (so viele Einträge wie Schritte, in Reihenfolge):
{"steps": [[0,2], [1], [], ...]}

Zutaten:
${ing}

Schritte:
${stp}`;
}

/**
 * Erzeugt die exakte Schritt→Zutat-Zuordnung (Indizes in die flache Zutatenliste,
 * siehe flattenIngredients). Validiert die Indizes; bei leerem Rezept leere Listen.
 */
export async function mapStepIngredients(recipe: Recipe, opts: ImportOptions): Promise<number[][]> {
  const ingredients = flattenIngredients(recipe.ingredients);
  if (!ingredients.length || !recipe.steps.length) return recipe.steps.map(() => []);
  const out = await callGeminiJson<{ steps?: number[][] }>(
    buildStepMapPrompt(ingredients, recipe.steps),
    opts.apiKey,
    opts.model ?? DEFAULT_IMPORT_MODEL,
  );
  const arr = Array.isArray(out?.steps) ? out.steps : [];
  const n = ingredients.length;
  return recipe.steps.map((_, i) => {
    const ids = Array.isArray(arr[i]) ? arr[i] : [];
    return [...new Set(ids.filter((x) => Number.isInteger(x) && x >= 0 && x < n))];
  });
}

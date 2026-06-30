// Hintergrund-Warteschlange für Rezept-Importe.
//
// Bei Gemini-Überlastung geht die Nutzereingabe nicht verloren: sie wird als Job
// persistiert (Text/URL bzw. Bilder als base64) und vom Worker in wachsenden
// Abständen erneut versucht, bis der Import gelingt. Nur vorübergehende Fehler
// (Überlastung/Netz, siehe isRetryableError) werden wiederholt; echte Fehler
// (z.B. unbrauchbare Eingabe) landen sofort auf 'error'.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { parseRecipeFromString } from "../parse.ts";
import { slugify } from "../render.ts";
import { getDb } from "./db.ts";
import { queueImageGeneration } from "./image-store.ts";
import {
  type Input,
  importRecipeMarkdown,
  isRetryableError,
  mimeFor,
} from "./import-recipe.ts";
import { categoryDirForCategory, insertRecipe, uniqueSlug } from "./library.ts";
import { queueStepMapping } from "./step-map.ts";
import { enqueueUpsert } from "./sync-queue.ts";

/** Eingabe → Gemini → Rezept in der DB anlegen; gibt den neuen Slug zurück. */
export async function createRecipeFromInput(input: Input, userId?: number): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY ist nicht gesetzt – Import nicht möglich.");
  const markdown = await importRecipeMarkdown(input, { apiKey });
  const recipe = parseRecipeFromString(markdown, input.label);
  const slug = uniqueSlug(slugify(recipe));
  insertRecipe({
    recipe,
    markdownBody: markdown.endsWith("\n") ? markdown : markdown + "\n",
    slug,
    categoryDir: categoryDirForCategory(recipe.meta.category),
    createdBy: userId,
  });
  enqueueUpsert(slug);
  // Aquarell-Bild + Schritt→Zutat-Zuordnung asynchron erzeugen (blockiert nicht).
  queueImageGeneration(recipe, slug, process.env.PIXAZO_API_KEY);
  queueStepMapping(recipe, slug, process.env.GEMINI_API_KEY);
  return slug;
}

// ---------------- Pro-Nutzer-Schalter ----------------

export function isImportRetryEnabled(userId: number): boolean {
  const row = getDb().prepare("SELECT import_retry_enabled FROM users WHERE id = ?").get(userId) as
    | { import_retry_enabled: number }
    | undefined;
  return row ? row.import_retry_enabled === 1 : true;
}

export function setImportRetryEnabled(userId: number, enabled: boolean): void {
  getDb()
    .prepare("UPDATE users SET import_retry_enabled = ? WHERE id = ?")
    .run(enabled ? 1 : 0, userId);
}

// ---------------- Serialisierung der Eingabe ----------------

type StoredPayload =
  | { mode: "text"; text: string; sourceUrl?: string; label: string }
  | { mode: "images"; images: { data: string; mime: string; name: string }[]; label: string };

/** Eingabe in einen DB-tauglichen Payload überführen (Bilder → base64). */
function serializeInput(input: Input): StoredPayload {
  if (input.mode === "text") {
    return { mode: "text", text: input.text, sourceUrl: input.sourceUrl, label: input.label };
  }
  return {
    mode: "images",
    label: input.label,
    images: input.images.map((p) => ({
      data: readFileSync(p).toString("base64"),
      mime: mimeFor(p),
      name: basename(p),
    })),
  };
}

/** Payload zurück in eine Input verwandeln; Bilder landen in einem Temp-Verzeichnis. */
function materialize(payload: StoredPayload): { input: Input; cleanup: () => void } {
  if (payload.mode === "text") {
    return {
      input: { mode: "text", text: payload.text, sourceUrl: payload.sourceUrl, label: payload.label },
      cleanup: () => {},
    };
  }
  const dir = mkdtempSync(join(tmpdir(), "recipe-retry-"));
  const images = payload.images.map((img, i) => {
    const ext = img.name.includes(".") ? "" : ".jpg";
    const p = join(dir, img.name || `bild-${i}${ext}`);
    writeFileSync(p, Buffer.from(img.data, "base64"));
    return p;
  });
  return {
    input: { mode: "images", images, label: payload.label },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

// ---------------- Enqueue ----------------

const BASE_DELAY_MS = 30_000; // erster Wiederholungsversuch nach ~30s
const MAX_DELAY_MS = 15 * 60_000; // Backoff-Deckel: höchstens alle 15 min

const delayFor = (attempts: number) =>
  Math.min(BASE_DELAY_MS * 2 ** Math.min(attempts, 10), MAX_DELAY_MS);

/**
 * Eingabe als Retry-Job einreihen. Aufrufen, wenn der synchrone erste Versuch
 * mit einem vorübergehenden Fehler scheitert und der Nutzer Auto-Retry aktiv hat.
 */
export function enqueueImportJob(source: string, input: Input, userId?: number): number {
  const now = new Date();
  const nowIso = now.toISOString();
  const nextTry = new Date(now.getTime() + BASE_DELAY_MS).toISOString();
  const info = getDb()
    .prepare(
      `INSERT INTO import_jobs (user_id, source, payload, label, created_at, next_try_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(userId ?? null, source, JSON.stringify(serializeInput(input)), input.label, nowIso, nextTry, nowIso);
  return Number(info.lastInsertRowid);
}

// ---------------- Anzeige / Verwaltung ----------------

export interface ImportJobView {
  id: number;
  source: string;
  label: string;
  status: "pending" | "error";
  attempts: number;
  last_error: string | null;
}

/** Offene + fehlgeschlagene Jobs eines Nutzers (für die Status-Anzeige). */
export function listActiveImportJobs(userId: number): ImportJobView[] {
  return getDb()
    .prepare(
      `SELECT id, source, label, status, attempts, last_error
         FROM import_jobs
        WHERE user_id = ? AND status IN ('pending', 'error')
        ORDER BY id DESC`,
    )
    .all(userId) as ImportJobView[];
}

/** Einen (fehlgeschlagenen oder offenen) Job des Nutzers entfernen. */
export function dismissImportJob(id: number, userId: number): void {
  getDb().prepare("DELETE FROM import_jobs WHERE id = ? AND user_id = ?").run(id, userId);
}

// ---------------- Worker ----------------

interface ImportJobRow {
  id: number;
  user_id: number | null;
  payload: string;
  attempts: number;
}

let running = false;

/** Verarbeitet alle fälligen Jobs einmal (next_try_at <= jetzt). */
export async function processPendingImports(): Promise<void> {
  if (running || !process.env.GEMINI_API_KEY) return;
  running = true;
  try {
    const db = getDb();
    const due = db
      .prepare(
        "SELECT id, user_id, payload, attempts FROM import_jobs WHERE status = 'pending' AND next_try_at <= ? ORDER BY id",
      )
      .all(new Date().toISOString()) as ImportJobRow[];
    for (const row of due) {
      const payload = JSON.parse(row.payload) as StoredPayload;
      const { input, cleanup } = materialize(payload);
      const attempts = row.attempts + 1;
      try {
        const slug = await createRecipeFromInput(input, row.user_id ?? undefined);
        db.prepare(
          "UPDATE import_jobs SET status = 'done', slug = ?, attempts = ?, last_error = NULL, updated_at = ? WHERE id = ?",
        ).run(slug, attempts, new Date().toISOString(), row.id);
      } catch (e) {
        const err = e as Error;
        const now = new Date();
        if (isRetryableError(err)) {
          // Vorübergehend → erneut einplanen (Backoff), Job bleibt pending.
          const next = new Date(now.getTime() + delayFor(attempts)).toISOString();
          db.prepare(
            "UPDATE import_jobs SET attempts = ?, last_error = ?, next_try_at = ?, updated_at = ? WHERE id = ?",
          ).run(attempts, err.message, next, now.toISOString(), row.id);
        } else {
          // Dauerhaft (z.B. unbrauchbare Eingabe) → nicht endlos wiederholen.
          db.prepare(
            "UPDATE import_jobs SET status = 'error', attempts = ?, last_error = ?, updated_at = ? WHERE id = ?",
          ).run(attempts, err.message, now.toISOString(), row.id);
        }
      } finally {
        cleanup();
      }
    }
  } finally {
    running = false;
  }
}

let started = false;

/** Startet den periodischen Import-Worker (No-op ohne GEMINI_API_KEY-Jobs). */
export function startImportWorker(): void {
  if (started) return;
  started = true;
  setInterval(() => void processPendingImports(), 30_000);
  void processPendingImports();
}

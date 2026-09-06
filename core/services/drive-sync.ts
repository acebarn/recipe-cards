// Drive-Backup-Sync-Worker: arbeitet die sync_queue ab (rclone).
// SQLite ist die Quelle der Wahrheit; Drive ist ein einseitiger Mirror.
//
// Opt-in: läuft nur, wenn RECIPE_SYNC=1 gesetzt ist (verhindert versehentliche
// Drive-Schreibzugriffe im lokalen Dev). In Produktion im Container aktivieren.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getProjectRoot } from "../paths.ts";
import { renderCard } from "../render.ts";
import { getDb } from "./db.ts";
import { getRecipeBySlug, purgeRecipe, toRecipe } from "./library.ts";

const enabled = () => process.env.RECIPE_SYNC === "1";
const REMOTE = () => (process.env.DRIVE_REMOTE || "drive").trim();
const FOLDER = () => (process.env.DRIVE_FOLDER || "Rezepte").trim();

const NOT_FOUND = /not found|didn't find|directory not found|no such file/i;

interface SyncRow {
  id: number;
  recipe_slug: string;
  op: "upsert" | "delete";
  category_dir: string | null;
  image_path: string | null;
  attempts: number;
}

// rclone asynchron aufrufen: synchron (spawnSync) hielt der Worker den einzigen
// Event-Loop an — bei drei Netzaufrufen pro Rezept stand die App sekundenlang
// für alle. Timeout, damit ein hängender Transfer die Queue nicht blockiert.
const run = promisify(execFile);
const RCLONE_TIMEOUT_MS = 120_000;

async function rclone(args: string[]): Promise<{ ok: boolean; stderr: string }> {
  try {
    await run("rclone", args, { timeout: RCLONE_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 });
    return { ok: true, stderr: "" };
  } catch (e) {
    const err = e as { stderr?: string | Buffer; message?: string };
    return { ok: false, stderr: String(err.stderr ?? err.message ?? "") };
  }
}

/** Prüft, ob das konfigurierte rclone-Remote existiert. */
export async function driveConfigured(): Promise<boolean> {
  try {
    const { stdout } = await run("rclone", ["listremotes"], { timeout: 15_000 });
    return String(stdout)
      .split(/\r?\n/)
      .some((l) => l.trim() === `${REMOTE()}:`);
  } catch {
    return false;
  }
}

function drivePath(type: "md" | "pdf" | "assets", cat: string | null, file: string): string {
  const parts = [FOLDER(), type];
  if (type !== "assets" && cat) parts.push(cat); // Assets liegen flach
  parts.push(file);
  return `${REMOTE()}:${parts.join("/")}`;
}

/** Aktuelles Rezept nach Drive spiegeln (md + gerendertes pdf + Bild). */
async function processUpsert(slug: string): Promise<boolean> {
  const r = getRecipeBySlug(slug);
  if (!r) return true; // wurde gelöscht → ein Delete-Eintrag erledigt den Rest
  const tmp = mkdtempSync(join(tmpdir(), "recipe-sync-"));
  try {
    const mdFile = join(tmp, `${slug}.md`);
    writeFileSync(mdFile, r.markdownBody);
    if (!(await rclone(["copyto", mdFile, drivePath("md", r.categoryDir ?? null, `${slug}.md`)])).ok) return false;

    const pdf = await renderCard(toRecipe(r), { projectRoot: getProjectRoot(), outDir: tmp, scale: 1, slug });
    if (!(await rclone(["copyto", pdf.pdfPath, drivePath("pdf", r.categoryDir ?? null, `${slug}.pdf`)])).ok) {
      return false;
    }

    if (r.imageFilename) {
      const local = join(getProjectRoot(), "assets", r.imageFilename);
      // best effort – ein fehlendes Bild soll den Rest nicht scheitern lassen
      if (existsSync(local)) await rclone(["copyto", local, drivePath("assets", null, r.imageFilename)]);
    }
    return true;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Rezept aus Drive entfernen (gezielt) und danach die soft-gelöschte Zeile purgen. */
async function processDelete(row: SyncRow): Promise<boolean> {
  const del = async (path: string): Promise<boolean> => {
    const { ok, stderr } = await rclone(["deletefile", path]);
    return ok || NOT_FOUND.test(stderr); // bereits weg = ok
  };
  const okMd = await del(drivePath("md", row.category_dir, `${row.recipe_slug}.md`));
  const okPdf = await del(drivePath("pdf", row.category_dir, `${row.recipe_slug}.pdf`));
  const okImg = row.image_path ? await del(drivePath("assets", null, row.image_path)) : true;
  if (okMd && okPdf && okImg) {
    purgeRecipe(row.recipe_slug);
    return true;
  }
  return false;
}

const MAX_ATTEMPTS = 5;
let running = false;

/** Verarbeitet alle ausstehenden Queue-Einträge einmal. */
export async function processPending(): Promise<void> {
  if (!enabled() || running) return;
  if (!(await driveConfigured())) return;
  running = true;
  try {
    const db = getDb();
    const rows = db
      .prepare("SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY id")
      .all() as SyncRow[];
    for (const row of rows) {
      let ok = false;
      try {
        ok = row.op === "delete" ? await processDelete(row) : await processUpsert(row.recipe_slug);
      } catch (e) {
        console.error(`Drive-Sync ${row.op} ${row.recipe_slug}:`, (e as Error).message);
      }
      const now = new Date().toISOString();
      if (ok) {
        db.prepare("UPDATE sync_queue SET status='done', processed_at=? WHERE id=?").run(now, row.id);
      } else {
        db.prepare(
          `UPDATE sync_queue
             SET attempts = attempts + 1,
                 status = CASE WHEN attempts + 1 >= ${MAX_ATTEMPTS} THEN 'error' ELSE 'pending' END,
                 processed_at = ?
           WHERE id = ?`,
        ).run(now, row.id);
      }
    }
  } finally {
    running = false;
  }
}

let started = false;

/** Startet den periodischen Worker (nur bei RECIPE_SYNC=1 und vorhandenem Remote). */
export function startSyncWorker(): void {
  if (started || !enabled()) return;
  started = true;
  void (async () => {
    if (!(await driveConfigured())) {
      started = false;
      console.error(`Drive-Sync: kein rclone-Remote "${REMOTE()}:" – Worker bleibt aus.`);
      return;
    }
    const interval = Number(process.env.SYNC_INTERVAL_MS) || 30000;
    setInterval(() => void processPending(), interval);
    void processPending();
    console.error(`Drive-Sync aktiv: ${REMOTE()}:${FOLDER()} (alle ${interval / 1000}s).`);
  })();
}

/** Sofortigen Sync-Lauf anstoßen (nach einem Schreibzugriff). No-op, wenn deaktiviert. */
export function kickSync(): void {
  if (!enabled()) return;
  setTimeout(() => void processPending(), 200);
}

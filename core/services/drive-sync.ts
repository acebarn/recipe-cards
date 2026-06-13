// Drive-Backup-Sync-Worker: arbeitet die sync_queue ab (rclone).
// SQLite ist die Quelle der Wahrheit; Drive ist ein einseitiger Mirror.
//
// Opt-in: läuft nur, wenn RECIPE_SYNC=1 gesetzt ist (verhindert versehentliche
// Drive-Schreibzugriffe im lokalen Dev). In Produktion im Container aktivieren.
import { spawnSync } from "node:child_process";
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

function rclone(args: string[]): { ok: boolean; stderr: string } {
  const r = spawnSync("rclone", args, { encoding: "utf8" });
  return { ok: !r.error && r.status === 0, stderr: r.stderr || r.error?.message || "" };
}

/** Prüft, ob das konfigurierte rclone-Remote existiert. */
export function driveConfigured(): boolean {
  const r = spawnSync("rclone", ["listremotes"], { encoding: "utf8" });
  if (r.error || r.status !== 0) return false;
  return r.stdout.split(/\r?\n/).some((l) => l.trim() === `${REMOTE()}:`);
}

function drivePath(type: "md" | "pdf" | "assets", cat: string | null, file: string): string {
  const parts = [FOLDER(), type];
  if (type !== "assets" && cat) parts.push(cat); // Assets liegen flach
  parts.push(file);
  return `${REMOTE()}:${parts.join("/")}`;
}

/** Aktuelles Rezept nach Drive spiegeln (md + gerendertes pdf + Bild). */
function processUpsert(slug: string): boolean {
  const r = getRecipeBySlug(slug);
  if (!r) return true; // wurde gelöscht → ein Delete-Eintrag erledigt den Rest
  const tmp = mkdtempSync(join(tmpdir(), "recipe-sync-"));
  try {
    const mdFile = join(tmp, `${slug}.md`);
    writeFileSync(mdFile, r.markdownBody);
    if (!rclone(["copyto", mdFile, drivePath("md", r.categoryDir ?? null, `${slug}.md`)]).ok) return false;

    const pdf = renderCard(toRecipe(r), { projectRoot: getProjectRoot(), outDir: tmp, scale: 1, slug });
    if (!rclone(["copyto", pdf.pdfPath, drivePath("pdf", r.categoryDir ?? null, `${slug}.pdf`)]).ok) return false;

    if (r.imageFilename) {
      const local = join(getProjectRoot(), "assets", r.imageFilename);
      if (existsSync(local)) rclone(["copyto", local, drivePath("assets", null, r.imageFilename)]); // best effort
    }
    return true;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Rezept aus Drive entfernen (gezielt) und danach die soft-gelöschte Zeile purgen. */
function processDelete(row: SyncRow): boolean {
  const del = (path: string): boolean => {
    const { ok, stderr } = rclone(["deletefile", path]);
    return ok || NOT_FOUND.test(stderr); // bereits weg = ok
  };
  const okMd = del(drivePath("md", row.category_dir, `${row.recipe_slug}.md`));
  const okPdf = del(drivePath("pdf", row.category_dir, `${row.recipe_slug}.pdf`));
  const okImg = row.image_path ? del(drivePath("assets", null, row.image_path)) : true;
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
  if (!driveConfigured()) return;
  running = true;
  try {
    const db = getDb();
    const rows = db
      .prepare("SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY id")
      .all() as SyncRow[];
    for (const row of rows) {
      let ok = false;
      try {
        ok = row.op === "delete" ? processDelete(row) : processUpsert(row.recipe_slug);
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
  if (!driveConfigured()) {
    console.error(`Drive-Sync: kein rclone-Remote "${REMOTE()}:" – Worker bleibt aus.`);
    return;
  }
  started = true;
  const interval = Number(process.env.SYNC_INTERVAL_MS) || 30000;
  setInterval(() => void processPending(), interval);
  void processPending();
  console.error(`Drive-Sync aktiv: ${REMOTE()}:${FOLDER()} (alle ${interval / 1000}s).`);
}

/** Sofortigen Sync-Lauf anstoßen (nach einem Schreibzugriff). No-op, wenn deaktiviert. */
export function kickSync(): void {
  if (!enabled()) return;
  setTimeout(() => void processPending(), 200);
}

// Enqueue-Funktionen für den Drive-Backup-Sync. Der Worker, der die Queue
// abarbeitet (rclone copy/deletefile), kommt in M1.6 (drive-sync.ts).
import { getDb } from "./db.ts";
import { kickSync } from "./drive-sync.ts";
import type { DeletedRecipeRef } from "./library.ts";

/** Upsert eines Rezepts nach Drive vormerken (Worker liest markdown_body frisch aus der DB). */
export function enqueueUpsert(slug: string): void {
  getDb()
    .prepare("INSERT INTO sync_queue (recipe_slug, op, created_at) VALUES (?, 'upsert', ?)")
    .run(slug, new Date().toISOString());
  kickSync();
}

/** Löschen eines Rezepts in Drive vormerken (Pfade jetzt festhalten – Row wird später gepurged). */
export function enqueueDelete(ref: DeletedRecipeRef): void {
  getDb()
    .prepare(
      "INSERT INTO sync_queue (recipe_slug, op, category_dir, image_path, created_at) VALUES (?, 'delete', ?, ?, ?)",
    )
    .run(ref.slug, ref.categoryDir ?? null, ref.imageFilename ?? null, new Date().toISOString());
  kickSync();
}

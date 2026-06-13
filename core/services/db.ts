// SQLite-Connection + Migrations-Runner (better-sqlite3, synchron).
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getProjectRoot } from "../paths.ts";
import { MIGRATIONS } from "./migrations.ts";

export type DB = Database.Database;

let _db: DB | null = null;

/** Pfad zur DB-Datei: ENV `RECIPE_DB_PATH`, sonst <projectRoot>/data/library.db. */
export function dbPath(): string {
  const env = process.env.RECIPE_DB_PATH?.trim();
  return env || join(getProjectRoot(), "data", "library.db");
}

/** Liefert die (einmalig geöffnete + migrierte) DB-Verbindung. */
export function getDb(): DB {
  if (_db) return _db;
  const path = dbPath();
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  _db = db;
  return db;
}

/** Schließt die Verbindung (Tests/Shutdown). */
export function closeDb(): void {
  _db?.close();
  _db = null;
}

/** Wendet alle noch nicht angewandten Migrationen aus MIGRATIONS an. */
export function runMigrations(db: DB): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const applied = new Set(
    (db.prepare("SELECT id FROM schema_migrations").all() as { id: string }[]).map((r) => r.id),
  );
  const insert = db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)");
  for (const { id, sql } of MIGRATIONS) {
    if (applied.has(id)) continue;
    const tx = db.transaction(() => {
      db.exec(sql);
      insert.run(id, new Date().toISOString());
    });
    tx();
  }
}

// Standardzutaten je Nutzer: Posten, die beim "Auf die Einkaufsliste" übersprungen werden
// (z. B. Salz, Pfeffer). Matching über die normalisierte Form (siehe ingredient-parse.ts).
import { normalizeName } from "../../ingredient-parse.ts";
import { getDb } from "../db.ts";

export interface StandardIngredient {
  id: number;
  name: string;
}

const DEFAULTS = ["Salz", "Pfeffer", "Öl", "Olivenöl", "Wasser", "Zucker"];

/** Listet die Standardzutaten des Nutzers; legt beim ersten Aufruf Defaults an. */
export function listStandard(userId: number): StandardIngredient[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, name FROM standard_ingredients WHERE user_id = ? ORDER BY name COLLATE NOCASE")
    .all(userId) as StandardIngredient[];
  if (rows.length > 0) return rows;

  for (const name of DEFAULTS) addStandard(userId, name);
  return db
    .prepare("SELECT id, name FROM standard_ingredients WHERE user_id = ? ORDER BY name COLLATE NOCASE")
    .all(userId) as StandardIngredient[];
}

/** Fügt eine Standardzutat hinzu (idempotent über die normalisierte Form). */
export function addStandard(userId: number, name: string): void {
  const clean = name.trim();
  if (!clean) return;
  getDb()
    .prepare(
      `INSERT INTO standard_ingredients (user_id, name, normalized, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, normalized) DO NOTHING`,
    )
    .run(userId, clean, normalizeName(clean), new Date().toISOString());
}

export function removeStandard(userId: number, id: number): void {
  getDb().prepare("DELETE FROM standard_ingredients WHERE id = ? AND user_id = ?").run(id, userId);
}

/** Ist der Name (normalisiert) eine Standardzutat des Nutzers? */
export function isStandard(userId: number, name: string): boolean {
  const row = getDb()
    .prepare("SELECT 1 FROM standard_ingredients WHERE user_id = ? AND normalized = ?")
    .get(userId, normalizeName(name));
  return !!row;
}

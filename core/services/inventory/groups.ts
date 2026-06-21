// Inventar-Gruppen je Haushalt (Vorschläge + eigene) sowie das "Gruppen-Gedächtnis":
// die zuletzt gewählte Gruppe je Artikelname, damit künftige Einträge automatisch
// einsortiert werden. Heuristik-Fallback über foodCategory (core/food-category.ts).
import { getDb } from "../db.ts";
import { normalizeName } from "../../ingredient-parse.ts";
import { foodCategory, type Aisle } from "../../food-category.ts";

export interface InventoryGroup {
  id: number;
  name: string;
  sort: number;
}

// Sinnvolle Startgruppen für eine Vorratskammer; werden beim ersten Aufruf angelegt,
// sind aber frei änder-/erweiterbar.
const DEFAULT_GROUPS = [
  "Konserven",
  "Nudeln & Reis",
  "Backen",
  "Gewürze",
  "Saucen & Öle",
  "Snacks",
  "TK-Gemüse",
  "TK-Fertiggerichte",
  "Getränke",
  "Sonstiges",
];

// Heuristik: Ladengang → Vorrats-Gruppe (best effort).
const AISLE_TO_GROUP: Record<Aisle, string> = {
  "Obst & Gemüse": "Sonstiges",
  "Milch & Eier": "Sonstiges",
  "Fleisch & Fisch": "TK-Fertiggerichte",
  "Backen & Mehl": "Backen",
  "Gewürze & Öle": "Gewürze",
  "Konserven & Vorräte": "Konserven",
  Tiefkühl: "TK-Gemüse",
  Getränke: "Getränke",
  Sonstiges: "Sonstiges",
};

/** Listet die Gruppen des Haushalts; legt beim ersten Aufruf die Default-Gruppen an. */
export function listGroups(householdId: number): InventoryGroup[] {
  const db = getDb();
  let rows = db
    .prepare("SELECT id, name, sort FROM inventory_groups WHERE household_id = ? ORDER BY sort, name COLLATE NOCASE")
    .all(householdId) as InventoryGroup[];
  if (rows.length === 0) {
    const now = new Date().toISOString();
    const ins = db.prepare(
      "INSERT INTO inventory_groups (household_id, name, sort, created_at) VALUES (?, ?, ?, ?)",
    );
    DEFAULT_GROUPS.forEach((name, i) => ins.run(householdId, name, i, now));
    rows = db
      .prepare("SELECT id, name, sort FROM inventory_groups WHERE household_id = ? ORDER BY sort, name COLLATE NOCASE")
      .all(householdId) as InventoryGroup[];
  }
  return rows;
}

export function addGroup(householdId: number, name: string): void {
  const clean = name.trim();
  if (!clean) return;
  const db = getDb();
  const max = db
    .prepare("SELECT COALESCE(MAX(sort), -1) AS m FROM inventory_groups WHERE household_id = ?")
    .get(householdId) as { m: number };
  db.prepare(
    `INSERT INTO inventory_groups (household_id, name, sort, created_at)
     VALUES (?, ?, ?, ?) ON CONFLICT(household_id, name) DO NOTHING`,
  ).run(householdId, clean, max.m + 1, new Date().toISOString());
}

export function renameGroup(householdId: number, id: number, name: string): void {
  const clean = name.trim();
  if (!clean) return;
  const db = getDb();
  const old = db
    .prepare("SELECT name FROM inventory_groups WHERE id = ? AND household_id = ?")
    .get(id, householdId) as { name: string } | undefined;
  if (!old) return;
  const tx = db.transaction(() => {
    db.prepare("UPDATE inventory_groups SET name = ? WHERE id = ? AND household_id = ?").run(
      clean,
      id,
      householdId,
    );
    // Bestehende Posten + Gedächtnis mitziehen.
    db.prepare(
      "UPDATE inventory_items SET group_name = ? WHERE household_id = ? AND group_name = ?",
    ).run(clean, householdId, old.name);
    db.prepare(
      "UPDATE inventory_group_memory SET group_name = ? WHERE household_id = ? AND group_name = ?",
    ).run(clean, householdId, old.name);
  });
  tx();
}

export function deleteGroup(householdId: number, id: number): void {
  const db = getDb();
  const row = db
    .prepare("SELECT name FROM inventory_groups WHERE id = ? AND household_id = ?")
    .get(id, householdId) as { name: string } | undefined;
  if (!row) return;
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM inventory_groups WHERE id = ? AND household_id = ?").run(id, householdId);
    // Posten dieser Gruppe werden "ungruppiert".
    db.prepare(
      "UPDATE inventory_items SET group_name = NULL WHERE household_id = ? AND group_name = ?",
    ).run(householdId, row.name);
    db.prepare(
      "DELETE FROM inventory_group_memory WHERE household_id = ? AND group_name = ?",
    ).run(householdId, row.name);
  });
  tx();
}

/** Merkt sich die Gruppenzuordnung für einen Artikelnamen (für künftige Einträge). */
export function rememberGroup(householdId: number, name: string, group: string): void {
  const clean = group.trim();
  if (!clean) return;
  getDb()
    .prepare(
      `INSERT INTO inventory_group_memory (household_id, normalized, group_name, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(household_id, normalized) DO UPDATE SET group_name = excluded.group_name, updated_at = excluded.updated_at`,
    )
    .run(householdId, normalizeName(name), clean, new Date().toISOString());
}

/** Schlägt eine Gruppe für einen Artikelnamen vor: Gedächtnis → Heuristik → "Sonstiges". */
export function suggestGroup(householdId: number, name: string): string {
  const row = getDb()
    .prepare("SELECT group_name FROM inventory_group_memory WHERE household_id = ? AND normalized = ?")
    .get(householdId, normalizeName(name)) as { group_name: string } | undefined;
  if (row) return row.group_name;
  return AISLE_TO_GROUP[foodCategory(name)] ?? "Sonstiges";
}

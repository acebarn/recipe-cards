// Inventar-Posten je Haushalt. Matching/Normalisierung wie in der Einkaufsliste über
// normalizeName (core/ingredient-parse.ts). Bereiche: 'pantry' (Vorratsschrank) und
// 'freezer' (Tiefkühlschrank). Menge ist eine ganze Zahl (Spinner); `low` markiert
// niedrigen Bestand.
import { getDb } from "../db.ts";
import { normalizeName } from "../../ingredient-parse.ts";
import { rememberGroup } from "./groups.ts";

export type InventoryLocation = "pantry" | "freezer";

export interface InventoryItem {
  id: number;
  name: string;
  normalized: string;
  amount: number;
  low: boolean;
  location: InventoryLocation;
  group: string | null;
}

interface ItemRow {
  id: number;
  name: string;
  normalized: string;
  amount: number;
  low: number;
  location: string;
  group_name: string | null;
}

function rowToItem(row: ItemRow): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    normalized: row.normalized,
    amount: row.amount,
    low: row.low === 1,
    location: row.location === "freezer" ? "freezer" : "pantry",
    group: row.group_name,
  };
}

export function listItems(householdId: number): InventoryItem[] {
  return (
    getDb()
      .prepare(
        "SELECT id, name, normalized, amount, low, location, group_name FROM inventory_items WHERE household_id = ? ORDER BY name COLLATE NOCASE",
      )
      .all(householdId) as ItemRow[]
  ).map(rowToItem);
}

/** Normalisierter Name → Posten (für den Einkaufslisten-Abgleich am Rezept). */
export function inventoryMap(householdId: number): Map<string, InventoryItem> {
  const map = new Map<string, InventoryItem>();
  for (const item of listItems(householdId)) {
    // Erster Treffer je normalisiertem Namen genügt (Bereich egal fürs Matching).
    if (!map.has(item.normalized)) map.set(item.normalized, item);
  }
  return map;
}

export interface AddItemInput {
  name: string;
  amount?: number;
  location?: InventoryLocation;
  group?: string;
  userId?: number;
}

/**
 * Legt einen Posten an oder erhöht die Menge eines bestehenden gleichen Namens im selben
 * Bereich. Merkt sich die Gruppenzuordnung.
 */
export function addItem(householdId: number, input: AddItemInput): void {
  const name = input.name.trim();
  if (!name) return;
  const location: InventoryLocation = input.location === "freezer" ? "freezer" : "pantry";
  const group = input.group?.trim() || null;
  const amount = Math.max(1, Math.round(input.amount ?? 1));
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO inventory_items
         (household_id, name, normalized, amount, low, location, group_name, updated_by, created_at, updated_at)
       VALUES (@household_id, @name, @normalized, @amount, 0, @location, @group_name, @user_id, @now, @now)
       ON CONFLICT(household_id, location, normalized) DO UPDATE SET
         name = excluded.name,
         amount = amount + excluded.amount,
         group_name = COALESCE(excluded.group_name, group_name),
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    )
    .run({
      household_id: householdId,
      name,
      normalized: normalizeName(name),
      amount,
      location,
      group_name: group,
      user_id: input.userId ?? null,
      now,
    });
  if (group) rememberGroup(householdId, name, group);
}

/** Menge um delta ändern (Untergrenze 1). */
export function adjustAmount(householdId: number, id: number, delta: number, userId?: number): void {
  getDb()
    .prepare(
      `UPDATE inventory_items
         SET amount = MAX(1, amount + ?), updated_by = ?, updated_at = ?
       WHERE id = ? AND household_id = ?`,
    )
    .run(delta, userId ?? null, new Date().toISOString(), id, householdId);
}

export function setLow(householdId: number, id: number, low: boolean, userId?: number): void {
  getDb()
    .prepare(
      "UPDATE inventory_items SET low = ?, updated_by = ?, updated_at = ? WHERE id = ? AND household_id = ?",
    )
    .run(low ? 1 : 0, userId ?? null, new Date().toISOString(), id, householdId);
}

export function setGroup(
  householdId: number,
  id: number,
  group: string | null,
  userId?: number,
): void {
  const db = getDb();
  const row = db
    .prepare("SELECT name FROM inventory_items WHERE id = ? AND household_id = ?")
    .get(id, householdId) as { name: string } | undefined;
  if (!row) return;
  const clean = group?.trim() || null;
  db.prepare(
    "UPDATE inventory_items SET group_name = ?, updated_by = ?, updated_at = ? WHERE id = ? AND household_id = ?",
  ).run(clean, userId ?? null, new Date().toISOString(), id, householdId);
  if (clean) rememberGroup(householdId, row.name, clean);
}

export function removeItem(householdId: number, id: number): void {
  getDb().prepare("DELETE FROM inventory_items WHERE id = ? AND household_id = ?").run(id, householdId);
}

// Inventar-Posten je Haushalt. Matching/Normalisierung wie in der Einkaufsliste über
// normalizeName (core/ingredient-parse.ts). Bereiche: 'pantry' (Vorratsschrank) und
// 'freezer' (Tiefkühlschrank).
import { getDb } from "../db.ts";
import { normalizeName } from "../../ingredient-parse.ts";
import { rememberGroup } from "./groups.ts";

export type InventoryLocation = "pantry" | "freezer";

export interface InventoryItem {
  id: number;
  name: string;
  normalized: string;
  quantity: string;
  location: InventoryLocation;
  group: string | null;
}

interface ItemRow {
  id: number;
  name: string;
  normalized: string;
  quantity: string | null;
  location: string;
  group_name: string | null;
}

function rowToItem(row: ItemRow): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    normalized: row.normalized,
    quantity: row.quantity ?? "",
    location: row.location === "freezer" ? "freezer" : "pantry",
    group: row.group_name,
  };
}

export function listItems(householdId: number): InventoryItem[] {
  return (
    getDb()
      .prepare(
        "SELECT id, name, normalized, quantity, location, group_name FROM inventory_items WHERE household_id = ? ORDER BY name COLLATE NOCASE",
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
  quantity?: string;
  location?: InventoryLocation;
  group?: string;
  userId?: number;
}

/**
 * Legt einen Posten an oder führt ihn mit einem bestehenden gleichen Namens im selben
 * Bereich zusammen (Menge wird überschrieben). Merkt sich die Gruppenzuordnung.
 */
export function addItem(householdId: number, input: AddItemInput): void {
  const name = input.name.trim();
  if (!name) return;
  const location: InventoryLocation = input.location === "freezer" ? "freezer" : "pantry";
  const group = input.group?.trim() || null;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO inventory_items
         (household_id, name, normalized, quantity, location, group_name, updated_by, created_at, updated_at)
       VALUES (@household_id, @name, @normalized, @quantity, @location, @group_name, @user_id, @now, @now)
       ON CONFLICT(household_id, location, normalized) DO UPDATE SET
         name = excluded.name, quantity = excluded.quantity, group_name = excluded.group_name,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    )
    .run({
      household_id: householdId,
      name,
      normalized: normalizeName(name),
      quantity: input.quantity?.trim() || null,
      location,
      group_name: group,
      user_id: input.userId ?? null,
      now,
    });
  if (group) rememberGroup(householdId, name, group);
}

export interface UpdateItemInput {
  quantity?: string;
  group?: string | null;
  userId?: number;
}

export function updateItem(householdId: number, id: number, input: UpdateItemInput): void {
  const db = getDb();
  const row = db
    .prepare("SELECT name FROM inventory_items WHERE id = ? AND household_id = ?")
    .get(id, householdId) as { name: string } | undefined;
  if (!row) return;
  const group = input.group === undefined ? undefined : input.group?.trim() || null;
  db.prepare(
    `UPDATE inventory_items SET
       quantity = COALESCE(@quantity, quantity),
       group_name = CASE WHEN @set_group = 1 THEN @group_name ELSE group_name END,
       updated_by = @user_id, updated_at = @now
     WHERE id = @id AND household_id = @household_id`,
  ).run({
    quantity: input.quantity === undefined ? null : input.quantity.trim(),
    set_group: group === undefined ? 0 : 1,
    group_name: group ?? null,
    user_id: input.userId ?? null,
    now: new Date().toISOString(),
    id,
    household_id: householdId,
  });
  if (group) rememberGroup(householdId, row.name, group);
}

export function removeItem(householdId: number, id: number): void {
  getDb().prepare("DELETE FROM inventory_items WHERE id = ? AND household_id = ?").run(id, householdId);
}

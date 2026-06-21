// Vorlagen ("Standardartikel") je Haushalt: wiederkehrende Artikel, die zum schnellen
// Anlegen ins Inventar per Klick angeboten werden.
import { getDb } from "../db.ts";
import { normalizeName } from "../../ingredient-parse.ts";
import type { InventoryLocation } from "./inventory.ts";

export interface InventoryTemplate {
  id: number;
  name: string;
  group: string | null;
  defaultLocation: InventoryLocation;
}

interface TemplateRow {
  id: number;
  name: string;
  group_name: string | null;
  default_location: string;
}

function rowToTemplate(row: TemplateRow): InventoryTemplate {
  return {
    id: row.id,
    name: row.name,
    group: row.group_name,
    defaultLocation: row.default_location === "freezer" ? "freezer" : "pantry",
  };
}

export function listTemplates(householdId: number): InventoryTemplate[] {
  return (
    getDb()
      .prepare(
        "SELECT id, name, group_name, default_location FROM inventory_templates WHERE household_id = ? ORDER BY name COLLATE NOCASE",
      )
      .all(householdId) as TemplateRow[]
  ).map(rowToTemplate);
}

export interface AddTemplateInput {
  name: string;
  group?: string | null;
  defaultLocation?: InventoryLocation;
}

export function addTemplate(householdId: number, input: AddTemplateInput): void {
  const name = input.name.trim();
  if (!name) return;
  getDb()
    .prepare(
      `INSERT INTO inventory_templates (household_id, name, normalized, group_name, default_location, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(household_id, normalized) DO UPDATE SET
         name = excluded.name, group_name = excluded.group_name, default_location = excluded.default_location`,
    )
    .run(
      householdId,
      name,
      normalizeName(name),
      input.group?.trim() || null,
      input.defaultLocation === "freezer" ? "freezer" : "pantry",
      new Date().toISOString(),
    );
}

export function removeTemplate(householdId: number, id: number): void {
  getDb()
    .prepare("DELETE FROM inventory_templates WHERE id = ? AND household_id = ?")
    .run(id, householdId);
}

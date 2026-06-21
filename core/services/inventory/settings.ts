// Pro-Nutzer-Schalter: Inventarfunktion an/aus. Deaktiviert → keine Inventar-Nav, und
// die Einkaufsliste am Rezept verhält sich wie ohne Inventar (kein Vorrats-Dialog).
import { getDb } from "../db.ts";

export function isInventoryEnabled(userId: number): boolean {
  const row = getDb().prepare("SELECT inventory_enabled FROM users WHERE id = ?").get(userId) as
    | { inventory_enabled: number }
    | undefined;
  return row ? row.inventory_enabled === 1 : true;
}

export function setInventoryEnabled(userId: number, enabled: boolean): void {
  getDb()
    .prepare("UPDATE users SET inventory_enabled = ? WHERE id = ?")
    .run(enabled ? 1 : 0, userId);
}

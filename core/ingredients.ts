import type { IngredientSection } from "./model.ts";

/**
 * Flache Zutatenliste in kanonischer Reihenfolge (Sektionen der Reihe nach, Items
 * der Reihe nach). Diese Reihenfolge definiert die Indizes für step_ingredients_json
 * und wird sowohl beim Mapping als auch im Kochmodus identisch verwendet.
 */
export function flattenIngredients(sections: IngredientSection[]): string[] {
  return sections.flatMap((s) => s.items);
}

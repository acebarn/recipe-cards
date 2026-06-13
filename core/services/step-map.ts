// Schritt→Zutat-Zuordnung (M3) im Hintergrund erzeugen und speichern.
import type { Recipe } from "../model.ts";
import { mapStepIngredients } from "./import-recipe.ts";
import { setStepIngredients } from "./library.ts";

/**
 * Mapping nicht-blockierend erzeugen (fire-and-forget). Ohne API-Key passiert
 * nichts → der Kochmodus nutzt dann weiter die Heuristik.
 */
export function queueStepMapping(recipe: Recipe, slug: string, apiKey?: string): void {
  if (!apiKey) return;
  mapStepIngredients(recipe, { apiKey })
    .then((mapping) => setStepIngredients(slug, mapping))
    .catch((e) => console.error(`Schritt-Zuordnung fehlgeschlagen (${slug}):`, (e as Error).message));
}

import type { IngredientSection } from "./model.ts";

/**
 * Flache Zutatenliste in kanonischer Reihenfolge (Sektionen der Reihe nach, Items
 * der Reihe nach). Diese Reihenfolge definiert die Indizes für step_ingredients_json
 * und wird sowohl beim Mapping als auch im Kochmodus identisch verwendet.
 */
export function flattenIngredients(sections: IngredientSection[]): string[] {
  return sections.flatMap((s) => s.items);
}

export const UNITS = new Set([
  "g", "kg", "mg", "l", "ml", "cl", "el", "tl", "msp", "prise", "prisen", "pck",
  "dose", "dosen", "bund", "stück", "stk", "zehe", "zehen", "tasse", "tassen",
  "blatt", "blätter", "scheibe", "scheiben", "becher", "glas", "päckchen",
]);

const STOPWORDS = new Set([
  "etwas", "frisch", "frische", "frischer", "gehackt", "gehackte", "fein",
  "nach", "geschmack", "optional", "stück", "große", "kleine", "mittlere",
]);

/** Aussagekräftige Schlagwörter einer Zutatenzeile (Menge/Einheit/Füllwörter entfernt). */
export function ingredientKeywords(line: string): string[] {
  let s = line.toLowerCase();
  // führende Mengenangabe entfernen (Zahl/Dezimal/Bruch)
  s = s.replace(/^[\s]*[\d.,/¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞–-]+\s*/u, "");
  return s
    .replace(/\([^)]*\)/g, " ") // Klammerzusätze raus
    .replace(/[^\p{L}\s-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4 && !UNITS.has(w) && !STOPWORDS.has(w));
}

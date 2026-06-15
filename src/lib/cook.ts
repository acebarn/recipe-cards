// Heuristik für den Kochmodus: welche Zutaten/Werkzeuge werden in einem Schritt
// erwähnt? Nutzt die Schlagwort-Extraktion aus core (gemeinsame Quelle mit den
// Statistiken) und sucht die Wörter als Teilstring im Schritttext.
import { ingredientKeywords } from "$core/ingredients.ts";

export { ingredientKeywords };

/** Wird die Zutat/das Werkzeug im Schritttext erwähnt? */
export function mentionedIn(stepText: string, line: string): boolean {
  const text = stepText.toLowerCase();
  return ingredientKeywords(line).some((kw) => text.includes(kw));
}

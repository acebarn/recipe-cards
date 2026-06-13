// Heuristik für den Kochmodus: welche Zutaten/Werkzeuge werden in einem Schritt
// erwähnt? Mengen/Einheiten werden entfernt, dann werden aussagekräftige Wörter
// als Teilstring im Schritttext gesucht. Bewusst einfach (MVP) – exakte Schritt→
// Zutat-Zuordnung kommt später optional über Gemini (M3).

const UNITS = new Set([
  "g", "kg", "mg", "l", "ml", "cl", "el", "tl", "msp", "prise", "prisen", "pck",
  "dose", "dosen", "bund", "stück", "stk", "zehe", "zehen", "tasse", "tassen",
  "blatt", "blätter", "scheibe", "scheiben", "becher", "glas", "päckchen",
]);

const STOPWORDS = new Set([
  "etwas", "frisch", "frische", "frischer", "gehackt", "gehackte", "fein",
  "nach", "geschmack", "optional", "stück", "große", "kleine", "mittlere",
]);

/** Aussagekräftige Schlagwörter einer Zutatenzeile (Menge/Einheit entfernt). */
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

/** Wird die Zutat/das Werkzeug im Schritttext erwähnt? */
export function mentionedIn(stepText: string, line: string): boolean {
  const text = stepText.toLowerCase();
  return ingredientKeywords(line).some((kw) => text.includes(kw));
}

// Zerlegt eine Zutatenzeile in Menge/Einheit/Name und normalisiert Namen fürs Matching.
// Reine Anzeige-/Listen-Logik (Einkaufsliste) – best effort, deutsche Komposita sind
// nicht exakt zerlegbar.
import { QUANTITY, parseQuantity } from "./scale.ts";
import { UNITS } from "./ingredients.ts";

export interface ParsedIngredient {
  qty: number | null;
  unit: string;
  name: string;
}

// Quantifizierende/qualifizierende Füllwörter ohne eigene Bedeutung als Zutat.
// Werden als FÜHRENDE Wörter entfernt, damit „etwas Salz" als „Salz" matcht.
const FUNCTION_WORDS = [
  "etwas", "etw", "bisschen", "evtl", "optional", "ggf", "ca", "circa", "etwa",
  "reichlich", "wenig", "ein", "eine", "einige", "paar", "je", "pro", "nach", "geschmack",
];
// Adjektiv-/Partizip-Stämme inkl. deutscher Flexionsendungen (frische/frischer/…).
const ADJ_STEMS = [
  "frisch", "fein", "grob", "gehackt", "gemahlen", "getrocknet", "gewürfelt",
  "gerieben", "gepresst", "geraspelt", "gerebelt", "geschält", "halbiert",
];
const ENDINGS = ["", "e", "er", "es", "em", "en"];
const QUALIFIERS = new Set([
  ...FUNCTION_WORDS,
  ...ADJ_STEMS.flatMap((s) => ENDINGS.map((e) => s + e)),
]);

const isNoise = (w: string) => {
  const x = w.toLowerCase();
  return QUALIFIERS.has(x) || UNITS.has(x);
};

/** Entfernt führende Füllwörter/Einheiten; mindestens ein Wort bleibt erhalten. */
function dropLeadingNoise(words: string[]): string[] {
  let i = 0;
  while (i < words.length - 1 && isNoise(words[i])) i++;
  return words.slice(i);
}

/**
 * Führende Menge (über das QUANTITY-Regex aus scale.ts), danach optionale Einheit aus
 * UNITS, Klammerzusätze entfernt; der Rest ist der Name. Ohne erkennbare Menge bleibt
 * `qty: null` und die ganze (bereinigte) Zeile ist der Name.
 */
export function parseIngredient(line: string): ParsedIngredient {
  const stripParens = (s: string) => s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  // Führende Füllwörter aus dem Anzeigenamen entfernen ("etwas Salz" → "Salz").
  const cleanName = (s: string) => {
    const w = s.split(" ").filter(Boolean);
    return w.length ? dropLeadingNoise(w).join(" ") : s;
  };

  const m = line.match(QUANTITY);
  if (!m) {
    return { qty: null, unit: "", name: cleanName(stripParens(line)) };
  }

  const [, , quantityToken, , rest] = m;
  const qty = parseQuantity(quantityToken);
  let remainder = stripParens(rest);

  let unit = "";
  const firstSpace = remainder.indexOf(" ");
  const head = firstSpace === -1 ? remainder : remainder.slice(0, firstSpace);
  if (head && UNITS.has(head.toLowerCase())) {
    unit = head.toLowerCase();
    remainder = firstSpace === -1 ? "" : remainder.slice(firstSpace + 1).trim();
  }

  return { qty, unit, name: cleanName(remainder) || stripParens(line) };
}

/**
 * Normalisiert einen Zutatennamen für Matching/Standard/Merge: lowercase, Umlaute
 * bleiben erhalten, simple deutsche Depluralisierung der häufigsten Endungen.
 */
export function normalizeName(name: string): string {
  let s = name.toLowerCase().trim();
  s = s.replace(/[^\p{L}\s-]/gu, " ").replace(/\s+/g, " ").trim();
  // Führende Füllwörter/Einheiten entfernen ("etwas salz" → "salz", "prise salz" → "salz").
  const words = dropLeadingNoise(s.split(" ").filter(Boolean));
  // Simple deutsche Depluralisierung des letzten Wortes: nur ein abschließendes
  // "n"/"s" entfernen. So matcht "Tomaten"→"tomate"="Tomate", "Zwiebeln"→"zwiebel".
  const last = words.length - 1;
  if (words[last] && words[last].length > 4) {
    words[last] = words[last].replace(/(n|s)$/u, "");
  }
  return words.join(" ").trim();
}

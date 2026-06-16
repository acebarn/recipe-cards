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

/**
 * Führende Menge (über das QUANTITY-Regex aus scale.ts), danach optionale Einheit aus
 * UNITS, Klammerzusätze entfernt; der Rest ist der Name. Ohne erkennbare Menge bleibt
 * `qty: null` und die ganze (bereinigte) Zeile ist der Name.
 */
export function parseIngredient(line: string): ParsedIngredient {
  const stripParens = (s: string) => s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();

  const m = line.match(QUANTITY);
  if (!m) {
    return { qty: null, unit: "", name: stripParens(line) };
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

  return { qty, unit, name: remainder || stripParens(line) };
}

/**
 * Normalisiert einen Zutatennamen für Matching/Standard/Merge: lowercase, Umlaute
 * bleiben erhalten, simple deutsche Depluralisierung der häufigsten Endungen.
 */
export function normalizeName(name: string): string {
  let s = name.toLowerCase().trim();
  s = s.replace(/[^\p{L}\s-]/gu, " ").replace(/\s+/g, " ").trim();
  // Simple deutsche Depluralisierung des letzten Wortes: nur ein abschließendes
  // "n"/"s" entfernen. So matcht "Tomaten"→"tomate"="Tomate", "Zwiebeln"→"zwiebel".
  const words = s.split(" ");
  const last = words.length - 1;
  if (words[last] && words[last].length > 4) {
    words[last] = words[last].replace(/(n|s)$/u, "");
  }
  return words.join(" ").trim();
}

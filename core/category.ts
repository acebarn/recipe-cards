// Anzeige-Helfer für Kategorie und Schwierigkeit (aus dem alten Site-Builder gehoben).

/** Entfernt das führende Sortier-Präfix eines Kategorie-Ordners: "3 backen" → "backen". */
export function prettyCategory(cat?: string): string {
  if (!cat) return "";
  return cat.replace(/^\d+\s+/, "").trim();
}

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "Einfach",
  simple: "Einfach",
  einfach: "Einfach",
  medium: "Mittel",
  mittel: "Mittel",
  hard: "Schwer",
  schwer: "Schwer",
};

/** Normalisiert difficulty (easy/medium/hard, dt. Synonyme) zu einem deutschen Label. */
export function prettyDifficulty(d?: string): string {
  if (!d) return "";
  return DIFFICULTY_LABELS[d.toLowerCase()] ?? d;
}

// Anzeige-Helfer für Kategorie und Schwierigkeit (aus dem alten Site-Builder gehoben).

// Gang-/kursbasiertes Kategorie-Schema. Key (kleingeschrieben) wird gespeichert
// (recipes.category + category_dir), Label wird angezeigt. Reihenfolge = Anzeige-/
// Sortierreihenfolge auf der Startseite.
export const CATEGORY_LABELS: Record<string, string> = {
  fruehstueck: "Frühstück & Brunch",
  vorspeisen: "Vorspeisen",
  snacks: "Snacks & Fingerfood",
  salate: "Salate",
  suppen: "Suppen",
  eintoepfe: "Eintöpfe",
  hauptgerichte: "Hauptgerichte",
  beilagen: "Beilagen",
  grundrezepte: "Grundrezepte",
  saucen: "Saucen & Dips",
  brot: "Brot & herzhafte Backwaren",
  kuchen: "Kuchen & süße Backwaren",
  desserts: "Desserts & Süßspeisen",
  getraenke: "Getränke",
};

export const CATEGORY_ORDER: string[] = Object.keys(CATEGORY_LABELS);

// Label → Key (für Rank-Lookup, wenn nur das Label vorliegt).
const LABEL_TO_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_LABELS).map(([k, v]) => [v.toLowerCase(), k]),
);

/** Kategorie-Key (oder Label) zu einem Anzeige-Label. Strippt Alt-Sortierpräfixe. */
export function prettyCategory(cat?: string): string {
  if (!cat) return "";
  const raw = cat.replace(/^\d+\s+/, "").trim();
  const key = raw.toLowerCase();
  if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];
  // Altwert/Unbekanntes: ersten Buchstaben groß.
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Sortier-Index in der Gangreihenfolge; akzeptiert Key ODER Label. Unbekannt → ans Ende. */
export function categoryRank(value?: string): number {
  if (!value) return 999;
  const v = value.replace(/^\d+\s+/, "").trim().toLowerCase();
  const key = CATEGORY_LABELS[v] ? v : (LABEL_TO_KEY[v] ?? v);
  const i = CATEGORY_ORDER.indexOf(key);
  return i === -1 ? 999 : i;
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

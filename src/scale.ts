const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 1 / 2,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 1 / 4,
  "¾": 3 / 4,
  "⅕": 1 / 5,
  "⅖": 2 / 5,
  "⅗": 3 / 5,
  "⅘": 4 / 5,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅛": 1 / 8,
  "⅜": 3 / 8,
  "⅝": 5 / 8,
  "⅞": 7 / 8,
};

const FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join("");

// Erkennt eine führende Menge: gemischte Zahl (1½), Unicode-Bruch (½),
// ASCII-Bruch (1/2), Dezimalzahl (1,5 / 1.5) oder ganze Zahl (250).
const QUANTITY = new RegExp(
  "^(\\s*)(" +
    `\\d+\\s*[${FRACTION_CHARS}]` + // 1½
    "|" +
    `[${FRACTION_CHARS}]` + // ½
    "|" +
    "\\d+\\s*/\\s*\\d+" + // 1/2
    "|" +
    "\\d+[.,]\\d+" + // 1,5
    "|" +
    "\\d+" + // 250
    ")(\\s*)(.*)$",
);

function parseQuantity(token: string): number | null {
  const t = token.trim();

  // gemischte Zahl mit Unicode-Bruch, z.B. "1½"
  const mixed = t.match(new RegExp(`^(\\d+)\\s*([${FRACTION_CHARS}])$`));
  if (mixed) return Number(mixed[1]) + UNICODE_FRACTIONS[mixed[2]];

  // reiner Unicode-Bruch
  if (t.length === 1 && t in UNICODE_FRACTIONS) return UNICODE_FRACTIONS[t];

  // ASCII-Bruch "1/2"
  const ascii = t.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (ascii) {
    const denom = Number(ascii[2]);
    return denom === 0 ? null : Number(ascii[1]) / denom;
  }

  // Dezimal- oder Ganzzahl (Komma als Dezimaltrenner zulassen)
  const num = Number(t.replace(",", "."));
  return Number.isFinite(num) ? num : null;
}

const NICE_FRACTIONS: Array<[number, string]> = [
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [3 / 8, "⅜"],
  [1 / 2, "½"],
  [5 / 8, "⅝"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
  [7 / 8, "⅞"],
];

const EPS = 1e-6;

/** Formatiert einen Zahlenwert hübsch als ganze Zahl, Unicode-Bruch oder gemischte Zahl. */
export function formatQuantity(value: number): string {
  if (value < 0) return String(value);

  const whole = Math.floor(value + EPS);
  const frac = value - whole;

  if (frac < EPS) return String(whole);

  for (const [f, char] of NICE_FRACTIONS) {
    if (Math.abs(frac - f) < 1e-3) {
      return whole === 0 ? char : `${whole}${char}`;
    }
  }

  // Kein sauberer Bruch: auf zwei Nachkommastellen runden, deutsches Dezimalkomma.
  const rounded = Math.round(value * 100) / 100;
  return String(rounded).replace(".", ",");
}

/** Skaliert die führende Mengenangabe einer Zutatenzeile. Posten ohne Zahl bleiben unverändert. */
export function scaleIngredient(line: string, factor: number): string {
  if (factor === 1) return line;

  const m = line.match(QUANTITY);
  if (!m) return line;

  const [, leadingWs, quantityToken, gapWs, rest] = m;
  const value = parseQuantity(quantityToken);
  if (value === null) return line;

  const scaled = formatQuantity(value * factor);
  const gap = gapWs.length > 0 ? gapWs : rest.length > 0 ? " " : "";
  return `${leadingWs}${scaled}${gap}${rest}`;
}

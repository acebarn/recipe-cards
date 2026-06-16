// Heuristische Einsortierung einer Zutat in eine "Ladengang"-Kategorie (Aisle), rein für
// die Gruppierung der Einkaufsliste. Stil analog zu core/diet.ts: Keyword-Regex je Gang,
// erste Übereinstimmung gewinnt. Best effort – deutsche Komposita sind nicht exakt.

export type Aisle =
  | "Obst & Gemüse"
  | "Milch & Eier"
  | "Fleisch & Fisch"
  | "Backen & Mehl"
  | "Gewürze & Öle"
  | "Konserven & Vorräte"
  | "Tiefkühl"
  | "Getränke"
  | "Sonstiges";

// Reihenfolge = Priorität. Tiefkühl/Getränke zuerst, da sie andere Stämme überlagern.
const RULES: [Aisle, RegExp][] = [
  ["Tiefkühl", /(tiefkühl|tiefgekühl|tk-|gefroren|eiswürfel)/],
  [
    "Getränke",
    /(wasser|saft|limo|cola|bier|wein|sekt|prosecco|kaffee|espresso|\btee\b|sirup|smoothie|milchshake|schorle)/,
  ],
  [
    "Obst & Gemüse",
    /(apfel|äpfel|banane|birne|orange|zitron|limette|beere|erdbeer|himbeer|heidelbeer|traube|melone|mango|ananas|pfirsich|aprikose|pflaume|kirsch|kiwi|feige|granatap|tomate|gurke|zwiebel|knoblauch|lauch|porree|karotte|möhre|sellerie|paprika|chili|aubergine|zucchini|kürbis|brokkoli|blumenkohl|kohl|spinat|salat|rucola|mangold|spargel|bohne|erbse|linse|kartoffel|süßkartoffel|pilz|champignon|ingwer|kräuter|petersilie|basilikum|schnittlauch|koriander|dill|minze|rosmarin|thymian|avocado|mais|rettich|radieschen|fenchel|rote bete|rhabarber)/,
  ],
  [
    "Fleisch & Fisch",
    /(fleisch|rind|schwein|kalb|lamm|hähnch|haehnch|hühn|huehn|pute|hack|mett|wurst|salami|schinken|speck|bacon|chorizo|gyros|fisch|lachs|thunfisch|forelle|garnele|shrimp|krabbe|muschel|kabeljau|dorsch|hering|sardell|sardine|makrele|tofu|tempeh|seitan)/,
  ],
  [
    "Milch & Eier",
    /(milch|sahne|rahm|butter|joghurt|jogurt|quark|käse|kaese|parmesan|mozzarella|feta|frischk|schmand|crème|creme fra|mascarpone|ricotta|\bei\b|eier|eigelb|eiweiß|eiweiss|margarine)/,
  ],
  [
    "Backen & Mehl",
    /(mehl|zucker|puderzucker|backpulver|natron|hefe|vanille|stärke|speisestärke|grieß|haferflocke|backkakao|schokolade|kuvertüre|marzipan|gelatine|nuss|mandel|walnuss|haselnuss|kokosraspel|rosinen)/,
  ],
  [
    "Gewürze & Öle",
    /(salz|pfeffer|paprikapulver|curry|kreuzkümmel|kümmel|muskat|zimt|nelke|kardamom|öl|olivenöl|essig|senf|sojasoße|sojasauce|sauce|soße|brühe|honig|sirup|gewürz|oregano|majoran|lorbeer|safran|kurkuma)/,
  ],
  [
    "Konserven & Vorräte",
    /(nudel|pasta|spaghetti|reis|couscous|bulgur|quinoa|polenta|gnocchi|konserve|dose|passierte|passata|tomatenmark|kokosmilch|kichererbse|brot|toast|zwieback|cracker|chips|müsli|cornflakes|marmelade|konfitüre|erdnussbutter)/,
  ],
];

export function foodCategory(name: string): Aisle {
  const n = name.toLowerCase();
  for (const [aisle, re] of RULES) {
    if (re.test(n)) return aisle;
  }
  return "Sonstiges";
}

/** Kanonische Reihenfolge der Gänge für die Anzeige. */
export const AISLE_ORDER: Aisle[] = [
  "Obst & Gemüse",
  "Milch & Eier",
  "Fleisch & Fisch",
  "Backen & Mehl",
  "Gewürze & Öle",
  "Konserven & Vorräte",
  "Tiefkühl",
  "Getränke",
  "Sonstiges",
];

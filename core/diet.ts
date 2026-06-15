// Heuristische Einordnung vegan / vegetarisch anhand der Zutaten (+ Tags/Titel).
// Bewusst best-effort: deutsche Komposita sind nicht exakt klassifizierbar.
// Pflanzliche Alternativen (Hafermilch, veganer Käse, Sojahack …) werden vor der
// Tier-Erkennung herausgefiltert; mehrdeutige Stämme sind wortanfang-gebunden,
// damit z.B. „Zitronenrinde" (rind), „Flammkuchen" (lamm), „gehackte" (hack),
// „Weizenkleber" (leber) keine Fehltreffer erzeugen.

// Fisch/Meeresfrüchte (kein vegetarischer Wort-Zwilling → reiner Teilstring ok).
const FISH_RE =
  /(fisch|lachs|thunfisch|tunfisch|forelle|garnele|shrimp|krabbe|hummer|muschel|tintenfisch|calamari|sardell|anchov|sardine|makrele|kabeljau|dorsch|hering|auster|jakobsmusch|surimi|scampi|pangasius|\bwels\b|zander|barsch)/;

// Fleisch: mehrdeutige Stämme wortanfang-gebunden, eindeutige als Teilstring.
const MEAT_RE = new RegExp(
  "(?<![a-zäöüß])(rind|lamm|leber|ente|gäns|gans|hack|mett|kalb)" +
    "|(schwein|hähnch|haehnch|hühn|huehn|pute|truthahn|speck|schinken|bacon|wurst|salami|chorizo|prosciutto|pancetta|guanciale|kassler|geflügel|gefluegel|gyros|döner|doener|kebab|sülze|fleisch)",
);

// Milchprodukte/Eier/Honig (nach Entfernen pflanzlicher Alternativen).
const DAIRY_RE =
  /(milch|sahne|rahm|butter|joghurt|jogurt|quark|käse|kaese|parmesan|mozzarella|feta|mascarpone|ricotta|schmand|crème|creme fra|honig|ghee|molke|gorgonzola|halloumi|burrata|pecorino|frischk|mayonnaise|mayo|remoulade|aioli)/;
const EGG_RE = /(?<![a-zäöüß])(ei|eier|eiern|eigelb|eiklar|eiweiß|eiweiss|eidotter)(?![a-zäöüß])/;

export interface DietFlags {
  vegan: boolean;
  vegetarian: boolean;
}

/** Zutatenzeilen + Meta → {vegan, vegetarian}. vegan impliziert vegetarian. */
export function classifyDiet(
  lines: string[],
  meta: { tags?: string[]; title?: string },
): DietFlags {
  const tags = (meta.tags ?? []).map((t) => t.trim().toLowerCase());
  const title = (meta.title ?? "").toLowerCase();
  const taggedVegan = tags.includes("vegan") || /\bvegan/.test(title);
  const taggedVeg =
    taggedVegan || tags.includes("vegetarisch") || tags.includes("vegetarian") || /\bvegetar/.test(title);

  let meatFish = false;
  let dairyEgg = false;

  for (const raw of lines) {
    let l = raw.toLowerCase();
    if (/vegan|pflanzlich|\bpflanzen/.test(l)) continue; // explizit pflanzliches Produkt

    // Pflanzliche Alternativen entfernen, bevor Tier-Stämme geprüft werden.
    l = l
      .replace(
        /(mandel|hafer|soja|kokos|reis|cashew|erbsen|dinkel|lupin\w*)\s?-?(milch|drink|sahne|joghurt|jogurt|quark|butter|frischk\w*|käse|kaese)/g,
        " ",
      )
      .replace(/(erdnuss|mandel|kakao|nuss|kokos|cashew|sonnenblumen)\s?-?butter/g, " ")
      .replace(/butternut\w*/g, " ")
      .replace(/honigmelone\w*/g, " ")
      .replace(/soja\s?-?(hack|granulat|schnetzel|geschnetzeltes)/g, " ")
      .replace(/(fleisch|hack)(ersatz|alternative)/g, " ")
      .replace(/weizenkleber|seitan|tofu|tempeh/g, " ");

    if (MEAT_RE.test(l) || FISH_RE.test(l)) meatFish = true;
    if (DAIRY_RE.test(l) || EGG_RE.test(l)) dairyEgg = true;
  }

  let vegetarian = !meatFish;
  let vegan = vegetarian && !dairyEgg;
  // Explizite Tags/Titel bestätigen „nach oben".
  if (taggedVegan) {
    vegan = true;
    vegetarian = true;
  } else if (taggedVeg) {
    vegetarian = true;
  }
  return { vegan, vegetarian };
}

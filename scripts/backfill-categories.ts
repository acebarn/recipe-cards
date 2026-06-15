// Einmaliger Backfill: ordnet bestehende Rezepte dem neuen gang-/kursbasierten
// Kategorie-Schema zu. Aktualisiert category + category_dir (= Key) und das
// markdown_body-Frontmatter (Drive-Mirror) und stößt den Drive-Sync an.
//
// Lauf: node scripts/backfill-categories.ts          (dry-run)
//       node scripts/backfill-categories.ts --write  (schreibt)
import { CATEGORY_LABELS } from "../core/category.ts";
import { rebuildMarkdown } from "../core/serialize.ts";
import { getRecipeBySlug, listRecipes, updateRecipe } from "../core/services/library.ts";
import { enqueueUpsert } from "../core/services/sync-queue.ts";

const MAP: Record<string, string> = {
  "allgaeuer-kaesespaetzle": "hauptgerichte",
  "brokkolini-mit-pilzketchup-und-nori": "hauptgerichte",
  "chinakohl-curry-mit-tofu": "hauptgerichte",
  "creamy-gurkensalat": "salate",
  "dampfnudeln-nach-omas-rezept": "desserts",
  "das-ultimative-rag-aus-dem-ofen": "saucen",
  "daenische-zimtschnecken-mit-kardamom": "kuchen",
  "focaccia-ohne-kneten": "brot",
  "gefuellte-artischocken-mit-erbsen-dill": "vorspeisen",
  "grundrezept-fuer-hummus": "grundrezepte",
  "kaiserschmarrn-tiroler-landgasthofrezept": "desserts",
  "klassisches-paprik-s-krumpli-ungarisches-kartoffelgulasch": "eintoepfe",
  "klassisches-tiramis": "desserts",
  "mango-ceviche": "vorspeisen",
  mutabbaq: "desserts",
  "rhabarberkuchen-mit-streusel": "kuchen",
  "rote-bete-pueree-mit-joghurt-und-za-atar": "beilagen",
  "schwaebischer-rahmkuchen": "kuchen",
  shakshuka: "fruehstueck",
  "sushi-reis": "grundrezepte",
  "suesskartoffelstampf-mit-joghurt-und-limette": "beilagen",
  tabbouleh: "salate",
  "teichners-24h-pizzateig": "brot",
  "vegane-karottenschnitte": "kuchen",
  "vegane-schwaebische-saure-linsen-mit-spaetzle": "eintoepfe",
  "veganer-lomo-saltado": "hauptgerichte",
  "veganer-pilz-spiess-im-pitabrot": "snacks",
  "veganes-chili-sin-carne": "eintoepfe",
  "veganes-himbeer-tiramisu": "desserts",
  "veganes-ruehrei-mit-tofu-kala-namak": "fruehstueck",
  "vegetarische-frikadellen": "hauptgerichte",
  "waldis-24-48h-pizzateig": "brot",
  "zitronensorbet-ohne-eiweiss": "desserts",
  zwiebelkuchen: "brot",
};

const write = process.argv.includes("--write");

// Sanity: Keys gültig? Slugs in DB vorhanden?
for (const [slug, key] of Object.entries(MAP)) {
  if (!CATEGORY_LABELS[key]) console.warn(`! Unbekannter Kategorie-Key: ${key} (${slug})`);
}
const known = new Set(listRecipes().map((r) => r.slug));
for (const slug of Object.keys(MAP)) {
  if (!known.has(slug)) console.warn(`! Slug nicht in DB: ${slug}`);
}
for (const slug of known) {
  if (!MAP[slug]) console.warn(`! Rezept ohne Zuordnung (bleibt unverändert): ${slug}`);
}

let changed = 0;
for (const [slug, key] of Object.entries(MAP)) {
  const r = getRecipeBySlug(slug);
  if (!r) continue;
  if (r.meta.category === key && r.categoryDir === key) continue;
  changed++;
  console.log(`${write ? "→" : "·"} ${slug}: ${r.meta.category ?? "-"} → ${key} (${CATEGORY_LABELS[key]})`);
  if (!write) continue;

  const meta = { ...r.meta, category: key };
  let md = rebuildMarkdown(r.markdownBody, meta);
  if (!md.endsWith("\n")) md += "\n";
  updateRecipe(slug, {
    recipe: { meta, ingredients: r.ingredients, steps: r.steps, notes: r.notes, sourceFile: slug },
    markdownBody: md,
    categoryDir: key,
    stepIngredients: r.stepIngredients, // erhalten (sonst würde das M3-Mapping gelöscht)
  });
  enqueueUpsert(slug);
}

console.log(`\n${changed} Rezept(e) ${write ? "aktualisiert + Drive-Sync angestoßen" : "würden geändert (dry-run; mit --write ausführen)"}.`);

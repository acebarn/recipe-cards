// Einmaliger Backfill: ergänzt bestehende Rezepte um `region` und füllt
// fehlende Zeitangaben. Aktualisiert die strukturierten Spalten UND das
// markdown_body-Frontmatter (Drive-Mirror) und stößt den Drive-Sync an.
//
// Lauf: node scripts/backfill-region-times.ts        (zeigt nur an / dry-run)
//       node scripts/backfill-region-times.ts --write (schreibt)
import { rebuildMarkdown } from "../core/serialize.ts";
import { getRecipeBySlug, listRecipes, updateRecipe } from "../core/services/library.ts";
import { enqueueUpsert } from "../core/services/sync-queue.ts";

interface Fill {
  region: string;
  prep?: string;
  cook?: string;
  rest?: string;
}

// region für alle; prep/cook/rest werden NUR gesetzt, wenn bislang leer.
const DATA: Record<string, Fill> = {
  "allgaeuer-kaesespaetzle": { region: "Deutschland", prep: "30", cook: "20" },
  "brokkolini-mit-pilzketchup-und-nori": { region: "Japan" },
  "chinakohl-curry-mit-tofu": { region: "Thailand" },
  "creamy-gurkensalat": { region: "Deutschland" },
  "dampfnudeln-nach-omas-rezept": { region: "Deutschland" },
  "das-ultimative-rag-aus-dem-ofen": { region: "Italien", prep: "20" },
  "daenische-zimtschnecken-mit-kardamom": { region: "Dänemark" },
  "focaccia-ohne-kneten": { region: "Italien" },
  "gefuellte-artischocken-mit-erbsen-dill": { region: "Italien", prep: "25" },
  "grundrezept-fuer-hummus": { region: "Levantinisch" },
  "kaiserschmarrn-tiroler-landgasthofrezept": { region: "Österreich" },
  "klassisches-paprik-s-krumpli-ungarisches-kartoffelgulasch": { region: "Ungarn" },
  "klassisches-tiramis": { region: "Italien" },
  "mango-ceviche": { region: "Peru" },
  mutabbaq: { region: "Levantinisch", prep: "25" },
  "rhabarberkuchen-mit-streusel": { region: "Deutschland" },
  "rote-bete-pueree-mit-joghurt-und-za-atar": { region: "Levantinisch", prep: "15" },
  "schwaebischer-rahmkuchen": { region: "Deutschland", prep: "20" },
  shakshuka: { region: "Nordafrikanisch" },
  "sushi-reis": { region: "Japan" },
  "suesskartoffelstampf-mit-joghurt-und-limette": { region: "International", prep: "15" },
  tabbouleh: { region: "Levantinisch", prep: "25", rest: "15" },
  "teichners-24h-pizzateig": { region: "Italien" },
  "vegane-karottenschnitte": { region: "Schweiz" },
  "vegane-schwaebische-saure-linsen-mit-spaetzle": { region: "Deutschland", prep: "20" },
  "veganer-lomo-saltado": { region: "Peru" },
  "veganer-pilz-spiess-im-pitabrot": { region: "Levantinisch" },
  "veganes-chili-sin-carne": { region: "Mexiko" },
  "veganes-himbeer-tiramisu": { region: "Italien" },
  "veganes-ruehrei-mit-tofu-kala-namak": { region: "International" },
  "vegetarische-frikadellen": { region: "Deutschland" },
  "waldis-24-48h-pizzateig": { region: "Italien" },
  "zitronensorbet-ohne-eiweiss": { region: "Italien" },
  zwiebelkuchen: { region: "Deutschland" },
};

const write = process.argv.includes("--write");

// Warnen, falls DB-Slugs nicht abgedeckt sind.
const known = new Set(listRecipes().map((r) => r.slug));
for (const slug of Object.keys(DATA)) {
  if (!known.has(slug)) console.warn(`! Slug nicht in DB: ${slug}`);
}

let changed = 0;
for (const [slug, fill] of Object.entries(DATA)) {
  const r = getRecipeBySlug(slug);
  if (!r) continue;
  const meta = { ...r.meta };
  const before = JSON.stringify([meta.region, meta.prep_time, meta.cook_time, meta.rest_time]);

  meta.region = fill.region;
  if (fill.prep && !meta.prep_time) meta.prep_time = fill.prep;
  if (fill.cook && !meta.cook_time) meta.cook_time = fill.cook;
  if (fill.rest && !meta.rest_time) meta.rest_time = fill.rest;

  const after = JSON.stringify([meta.region, meta.prep_time, meta.cook_time, meta.rest_time]);
  if (after === before) continue;
  changed++;
  console.log(`${write ? "→" : "·"} ${slug}: region=${meta.region} prep=${meta.prep_time ?? "-"} cook=${meta.cook_time ?? "-"} rest=${meta.rest_time ?? "-"}`);

  if (!write) continue;
  let md = rebuildMarkdown(r.markdownBody, meta);
  if (!md.endsWith("\n")) md += "\n";
  updateRecipe(slug, {
    recipe: { meta, ingredients: r.ingredients, steps: r.steps, notes: r.notes, sourceFile: slug },
    markdownBody: md,
    stepIngredients: r.stepIngredients, // erhalten (sonst würde das M3-Mapping gelöscht)
  });
  enqueueUpsert(slug);
}

console.log(`\n${changed} Rezept(e) ${write ? "aktualisiert + Drive-Sync angestoßen" : "würden geändert (dry-run; mit --write ausführen)"}.`);

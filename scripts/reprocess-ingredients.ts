// Einmaliges Re-Processing EINES Rezepts mit dem aktuellen Import-Prompt, um die
// Zutatenliste zu bereinigen (Zubereitung wandert in die Schritte). Ein Gemini-Aufruf.
// Kuratiertes Frontmatter (Region/Kategorie/Zeiten/Bild/…) bleibt erhalten; nur der
// Body (Zutaten/Schritte/Hinweise) wird ersetzt. Das M3-Schritt-Mapping wird geleert
// (Kochmodus nutzt dann die Heuristik), da sich die Schritte ändern.
//
// Lauf: node scripts/reprocess-ingredients.ts <slug>           (Vorschau, 1 Gemini-Aufruf)
//       node scripts/reprocess-ingredients.ts <slug> --write   (übernehmen, 1 Gemini-Aufruf)
import { parseRecipeFromString } from "../core/parse.ts";
import { rebuildMarkdown } from "../core/serialize.ts";
import { importRecipeMarkdown } from "../core/services/import-recipe.ts";
import { getRecipeBySlug, updateRecipe } from "../core/services/library.ts";
import { enqueueUpsert } from "../core/services/sync-queue.ts";

const slug = process.argv[2];
const write = process.argv.includes("--write");

async function main() {
  if (!slug || slug.startsWith("--")) {
    console.error("Usage: node scripts/reprocess-ingredients.ts <slug> [--write]");
    process.exit(1);
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY ist nicht gesetzt.");
    process.exit(1);
  }
  const r = getRecipeBySlug(slug);
  if (!r) {
    console.error("Rezept nicht gefunden:", slug);
    process.exit(1);
  }

  // Nur den Body (ohne YAML-Frontmatter) als Fließtext an Gemini geben.
  const body = r.markdownBody.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
  const rawMd = await importRecipeMarkdown({ mode: "text", text: body, label: slug }, { apiKey });
  const parsed = parseRecipeFromString(rawMd, slug);

  console.log("=== ZUTATEN (neu) ===");
  for (const s of parsed.ingredients) {
    if (s.name) console.log("## " + s.name);
    for (const it of s.items) console.log(" - " + it);
  }
  console.log("=== SCHRITTE (neu) ===");
  parsed.steps.forEach((s, i) => console.log(`${i + 1}. ${s}`));

  if (!write) {
    console.log("\n(Vorschau – mit --write übernehmen; Achtung: das wäre ein weiterer Gemini-Aufruf.)");
    return;
  }

  // Kuratiertes Frontmatter behalten, neuen (bereinigten) Body übernehmen.
  let md = rebuildMarkdown(rawMd, r.meta);
  if (!md.endsWith("\n")) md += "\n";
  updateRecipe(slug, {
    recipe: { meta: r.meta, ingredients: parsed.ingredients, steps: parsed.steps, notes: parsed.notes, sourceFile: slug },
    markdownBody: md,
    categoryDir: r.categoryDir,
  });
  enqueueUpsert(slug);
  console.log("\n✓ aktualisiert + Drive-Sync angestoßen.");
}

main().catch((e) => {
  console.error("FEHLER:", e instanceof Error ? e.message : e);
  process.exit(1);
});

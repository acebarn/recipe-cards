#!/usr/bin/env node
// Erzeugt die Schritt→Zutat-Zuordnung (M3) für Rezepte in der SQLite-Bibliothek
// via Gemini und speichert sie in step_ingredients_json.
// Aufruf (im Container):  docker compose run --rm web node scripts/map-steps-db.ts [--force]
import { loadDotEnv } from "../core/env.ts";
import { getProjectRoot } from "../core/paths.ts";
import { mapStepIngredients } from "../core/services/import-recipe.ts";
import { listRecipes, setStepIngredients, toRecipe } from "../core/services/library.ts";

loadDotEnv(getProjectRoot());
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY fehlt.");
  process.exit(1);
}
const force = process.argv.includes("--force");
// Verzögerung zwischen Calls, um das Gemini-RPM-Limit (Free-Tier) nicht zu reißen.
const delayMs = Number(process.env.MAP_DELAY_MS) || 5000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  const recipes = listRecipes();
  let done = 0;
  let skipped = 0;
  let failed = 0;
  let first = true;
  for (const r of recipes) {
    if ((r.stepIngredients && !force) || !r.steps.length || !r.ingredients.length) {
      skipped++;
      continue;
    }
    if (!first) await sleep(delayMs);
    first = false;
    try {
      const mapping = await mapStepIngredients(toRecipe(r), { apiKey });
      setStepIngredients(r.slug, mapping);
      const hits = mapping.reduce((a, m) => a + m.length, 0);
      console.log(`✓ ${r.meta.title} (${mapping.length} Schritte, ${hits} Zuordnungen)`);
      done++;
    } catch (e) {
      const msg = (e as Error).message.slice(0, 80);
      console.error(`✗ ${r.slug}: ${msg}`);
      failed++;
      if (msg.includes("429")) await sleep(30000); // bei Rate-Limit länger warten
    }
  }
  console.log(`\nFertig: ${done} zugeordnet, ${skipped} übersprungen, ${failed} fehlgeschlagen.`);
  if (failed > 0) process.exitCode = 1;
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

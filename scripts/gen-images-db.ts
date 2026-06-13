#!/usr/bin/env node
// Erzeugt fehlende Aquarell-Bilder für alle Rezepte in der SQLite-Bibliothek
// (Pixazo) und legt sie unter <projectRoot>/assets ab + verknüpft sie in der DB.
// Aufruf (im Container):  docker compose run --rm web node scripts/gen-images-db.ts [--force]
import { loadDotEnv } from "../core/env.ts";
import { getProjectRoot } from "../core/paths.ts";
import { generateAndStoreImage } from "../core/services/image-store.ts";
import { listRecipes, toRecipe } from "../core/services/library.ts";

const root = getProjectRoot();
loadDotEnv(root);
const apiKey = process.env.PIXAZO_API_KEY;
if (!apiKey) {
  console.error("PIXAZO_API_KEY fehlt.");
  process.exit(1);
}
const force = process.argv.includes("--force");

const run = async () => {
  const recipes = listRecipes();
  let created = 0;
  let skipped = 0;
  let failed = 0;
  for (const r of recipes) {
    if (r.imageFilename && !force) {
      skipped++;
      continue;
    }
    try {
      const filename = await generateAndStoreImage(toRecipe(r), r.slug, apiKey);
      console.log(`✓ ${r.meta.title} → ${filename}`);
      created++;
    } catch (e) {
      console.error(`✗ ${r.slug}: ${(e as Error).message}`);
      failed++;
    }
  }
  console.log(`\nFertig: ${created} erzeugt, ${skipped} übersprungen, ${failed} fehlgeschlagen.`);
  if (failed > 0) process.exitCode = 1;
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

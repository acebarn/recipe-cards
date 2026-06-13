#!/usr/bin/env node
// Seed: bestehende Rezepte (lokal aus recipes/ oder per rclone aus Google Drive)
// idempotent in die SQLite-Bibliothek laden. Schreibt NICHT zurück nach Drive
// (die Rezepte liegen dort bereits) – kein Sync-Enqueue.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { prettyCategory } from "../core/category.ts";
import { loadDotEnv } from "../core/env.ts";
import { getProjectRoot } from "../core/paths.ts";
import { parseRecipe } from "../core/parse.ts";
import { slugify } from "../core/render.ts";
import { findRecipeFiles } from "../core/scan.ts";

const PROJECT_ROOT = getProjectRoot(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const DEFAULT_OWNER = "alessio.bisgen@gmail.com";
const IMG_EXT = ["jpg", "jpeg", "png", "webp"];

function printHelp(): void {
  console.log(`seed-from-drive — bestehende Rezepte in die SQLite-Bibliothek laden

Verwendung:
  node scripts/seed-from-drive.ts [optionen]

Optionen:
  --from-local <dir>   lokalen Ordner seeden (Standard: ./recipes)
  --from-drive         Markdown + Assets per rclone aus Drive holen und seeden
  --drive-remote <r>   rclone-Remote (Standard: $DRIVE_REMOTE oder "drive")
  --drive-folder <f>   Drive-Wurzelordner (Standard: $DRIVE_FOLDER oder "Rezepte")
  --owner <email>      Owner-E-Mail als created_by (Standard: ${DEFAULT_OWNER})
  --db <pfad>          DB-Pfad (sonst $RECIPE_DB_PATH bzw. <projectRoot>/data/library.db)
  -h, --help           diese Hilfe

Idempotent: erneute Läufe aktualisieren bestehende Rezepte (Schlüssel = slug).`);
}

/** Erstes Pfadsegment unterhalb der Wurzel = Kategorie-Ordner (z.B. "3 backen"). */
function categoryDirOf(recipesRoot: string, file: string): string | undefined {
  const rel = relative(recipesRoot, file);
  const parts = rel.split(sep);
  return parts.length > 1 ? parts[0] : undefined;
}

function rcloneCopy(src: string, dest: string): void {
  const r = spawnSync("rclone", ["copy", src, dest], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`rclone copy ${src} → ${dest} fehlgeschlagen (Code ${r.status}).`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "from-local": { type: "string" },
      "from-drive": { type: "boolean" },
      "drive-remote": { type: "string" },
      "drive-folder": { type: "string" },
      owner: { type: "string" },
      db: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    printHelp();
    return;
  }

  loadDotEnv(PROJECT_ROOT);
  // DB-Pfad VOR dem ersten getDb()-Aufruf festlegen (db.ts liest die ENV lazy).
  if (values.db) process.env.RECIPE_DB_PATH = resolve(values.db);

  const assetsDir = join(PROJECT_ROOT, "assets");
  let recipesRoot: string;

  if (values["from-drive"]) {
    const remote = values["drive-remote"] ?? process.env.DRIVE_REMOTE ?? "drive";
    const folder = values["drive-folder"] ?? process.env.DRIVE_FOLDER ?? "Rezepte";
    const tmp = mkdtempSync(join(tmpdir(), "recipe-seed-"));
    recipesRoot = join(tmp, "md");
    console.error(`Hole ${remote}:${folder}/md → ${recipesRoot} …`);
    rcloneCopy(`${remote}:${folder}/md`, recipesRoot);
    // Assets direkt in den Bild-Ordner spiegeln (damit die App sie ausliefern kann).
    console.error(`Hole ${remote}:${folder}/assets → ${assetsDir} …`);
    try {
      rcloneCopy(`${remote}:${folder}/assets`, assetsDir);
    } catch (e) {
      console.error(`  (Assets übersprungen: ${(e as Error).message})`);
    }
  } else {
    recipesRoot = resolve(values["from-local"] ?? join(PROJECT_ROOT, "recipes"));
  }

  // Erst nach gesetztem RECIPE_DB_PATH importieren/aufrufen.
  const lib = await import("../core/services/library.ts");
  const { ensureOwner } = await import("../core/services/users.ts");
  const owner = ensureOwner(values.owner ?? DEFAULT_OWNER);

  const files = findRecipeFiles(recipesRoot);
  const seen = new Map<string, number>();
  let seeded = 0;
  let withImage = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const categoryDir = categoryDirOf(recipesRoot, file);
    // Scratch-/Entwurfsordner nicht in die Bibliothek übernehmen.
    if (categoryDir === "_import") {
      skipped++;
      continue;
    }

    let recipe;
    try {
      recipe = parseRecipe(file);
    } catch (err) {
      console.error(`✗ ${relative(recipesRoot, file)}: ${(err as Error).message}`);
      failed++;
      continue;
    }

    // Kategorie normalisieren: Frontmatter bevorzugt, sonst aus dem Ordnernamen.
    const category = recipe.meta.category || prettyCategory(categoryDir) || undefined;
    recipe.meta.category = category;

    // Slug stabil + innerhalb des Laufs eindeutig (deterministisch über sortierte Reihenfolge).
    const base = slugify(recipe);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const slug = n === 1 ? base : `${base}-${n}`;

    const markdownBody = readFileSync(file, "utf8");
    lib.upsertRecipeBySlug({ recipe, markdownBody, slug, categoryDir, createdBy: owner.id });
    seeded++;

    // Vorhandenes Aquarell-Bild per Slug zuordnen.
    const imgExt = IMG_EXT.find((e) => existsSync(join(assetsDir, `${slug}.${e}`)));
    if (imgExt) {
      lib.setRecipeImage(slug, `${slug}.${imgExt}`, { source: "imported", mime: `image/${imgExt === "jpg" ? "jpeg" : imgExt}` });
      withImage++;
    }
  }

  console.error(
    `\nFertig: ${seeded} Rezepte geseedet (${withImage} mit Bild), ${skipped} übersprungen, ${failed} fehlgeschlagen.`,
  );
  console.error(`Bibliothek enthält jetzt ${lib.listRecipes().length} Rezepte.`);
  if (failed > 0) process.exitCode = 1;
}

main();

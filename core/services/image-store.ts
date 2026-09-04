// Aquarell-Bild generieren, im Assets-Ordner (unter projectRoot, damit Typst es
// findet) ablegen und in der DB verknüpfen.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Recipe } from "../model.ts";
import { getProjectRoot } from "../paths.ts";
import { generateRecipeImage } from "./gen-image.ts";
import { setRecipeImage } from "./library.ts";
import { enqueueUpsert } from "./sync-queue.ts";

const IMG_EXT = ["jpg", "jpeg", "png", "webp"];

/** Generiert das Bild synchron (für Aufrufer, die warten wollen). */
export async function generateAndStoreImage(
  recipe: Recipe,
  slug: string,
  apiKey: string,
  opts: { seed?: number } = {},
): Promise<string> {
  const { buffer, ext } = await generateRecipeImage(recipe, slug, { apiKey, seed: opts.seed });
  const dir = join(getProjectRoot(), "assets");
  mkdirSync(dir, { recursive: true });
  for (const e of IMG_EXT) {
    const p = join(dir, `${slug}.${e}`);
    if (existsSync(p)) rmSync(p);
  }
  const filename = `${slug}.${ext}`;
  writeFileSync(join(dir, filename), buffer);
  setRecipeImage(slug, filename, { source: "pixazo", mime: `image/${ext === "jpg" ? "jpeg" : ext}` });
  // Drive-Spiegel nachziehen: Beim Import wird der Upsert eingereiht, bevor das
  // Bild fertig ist – ohne diesen zweiten Upsert fehlten in Drive das Bild und
  // ein bebildertes PDF (21 von 64 Rezepten waren davon betroffen).
  enqueueUpsert(slug);
  return filename;
}

/**
 * Bildgenerierung anstoßen, ohne zu blockieren (fire-and-forget). Ohne API-Key
 * passiert nichts (Rezept zeigt dann den Initial-Platzhalter).
 */
export function queueImageGeneration(recipe: Recipe, slug: string, apiKey?: string): void {
  if (!apiKey) return;
  generateAndStoreImage(recipe, slug, apiKey).catch((e) =>
    console.error(`Bildgenerierung fehlgeschlagen (${slug}):`, (e as Error).message),
  );
}

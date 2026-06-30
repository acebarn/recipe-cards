import { env } from "$env/dynamic/private";
import { parseRecipeFromString } from "$core/parse.ts";
import { slugify } from "$core/render.ts";
import {
  categoryDirForCategory,
  insertRecipe,
  uniqueSlug,
} from "$core/services/library.ts";
import {
  fetchUrlText,
  importRecipeMarkdown,
  type Input,
} from "$core/services/import-recipe.ts";
import { queueImageGeneration } from "$core/services/image-store.ts";
import { fetchReelCaption, isInstagramUrl } from "$core/services/reel.ts";
import { queueStepMapping } from "$core/services/step-map.ts";
import { enqueueUpsert } from "$core/services/sync-queue.ts";
import { fail, redirect } from "@sveltejs/kit";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Actions } from "./$types";

/** Eingabe → Gemini → Rezept in der DB anlegen; gibt den neuen Slug zurück. */
async function createFromInput(input: Input, userId?: number): Promise<string> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY ist nicht gesetzt – Import nicht möglich.");
  const markdown = await importRecipeMarkdown(input, { apiKey });
  const recipe = parseRecipeFromString(markdown, input.label);
  const slug = uniqueSlug(slugify(recipe));
  insertRecipe({
    recipe,
    markdownBody: markdown.endsWith("\n") ? markdown : markdown + "\n",
    slug,
    categoryDir: categoryDirForCategory(recipe.meta.category),
    createdBy: userId,
  });
  enqueueUpsert(slug);
  // Aquarell-Bild + Schritt→Zutat-Zuordnung asynchron erzeugen (blockiert nicht).
  queueImageGeneration(recipe, slug, env.PIXAZO_API_KEY);
  queueStepMapping(recipe, slug, env.GEMINI_API_KEY);
  return slug;
}

export const actions: Actions = {
  link: async ({ request, locals }) => {
    const url = String((await request.formData()).get("url") ?? "").trim();
    if (!url) return fail(400, { tab: "link", error: "Bitte eine URL eingeben." });
    let slug: string;
    try {
      const text = await fetchUrlText(url);
      slug = await createFromInput({ mode: "text", text, sourceUrl: url, label: url }, locals.user?.id);
    } catch (e) {
      return fail(400, { tab: "link", error: (e as Error).message });
    }
    throw redirect(303, `/recipe/${slug}`);
  },

  reel: async ({ request, locals }) => {
    const url = String((await request.formData()).get("url") ?? "").trim();
    if (!isInstagramUrl(url)) return fail(400, { tab: "reel", error: "Bitte einen Instagram-Reel-Link eingeben." });
    let slug: string;
    try {
      const caption = await fetchReelCaption(url);
      slug = await createFromInput({ mode: "text", text: caption, sourceUrl: url, label: `Reel ${url}` }, locals.user?.id);
    } catch (e) {
      return fail(400, { tab: "reel", error: (e as Error).message });
    }
    throw redirect(303, `/recipe/${slug}`);
  },

  text: async ({ request, locals }) => {
    const text = String((await request.formData()).get("text") ?? "").trim();
    if (!text) return fail(400, { tab: "text", error: "Bitte Rezepttext eingeben." });
    let slug: string;
    try {
      slug = await createFromInput({ mode: "text", text, label: "Text" }, locals.user?.id);
    } catch (e) {
      return fail(400, { tab: "text", error: (e as Error).message });
    }
    throw redirect(303, `/recipe/${slug}`);
  },

  photo: async ({ request, locals }) => {
    let files: File[];
    try {
      files = (await request.formData())
        .getAll("photos")
        .filter((f): f is File => f instanceof File && f.size > 0);
    } catch (e) {
      // Body-Stream zu groß (BODY_SIZE_LIMIT) o.Ä. – sonst würde der Fehler als 500 durchschlagen.
      const tooLarge = (e as { status?: number }).status === 413;
      return fail(tooLarge ? 413 : 400, {
        tab: "photo",
        error: tooLarge
          ? "Die Fotos sind zu groß. Bitte kleinere Bilder wählen oder weniger Seiten auf einmal hochladen."
          : `Upload fehlgeschlagen: ${(e as Error).message}`,
      });
    }
    if (!files.length) return fail(400, { tab: "photo", error: "Bitte mindestens ein Foto wählen." });

    const dir = mkdtempSync(join(tmpdir(), "recipe-add-"));
    let slug: string;
    try {
      const paths: string[] = [];
      for (const f of files) {
        const p = join(dir, f.name || `bild-${paths.length}.jpg`);
        writeFileSync(p, Buffer.from(await f.arrayBuffer()));
        paths.push(p);
      }
      slug = await createFromInput(
        { mode: "images", images: paths, label: `${paths.length} Foto(s)` },
        locals.user?.id,
      );
    } catch (e) {
      rmSync(dir, { recursive: true, force: true });
      return fail(400, { tab: "photo", error: (e as Error).message });
    }
    rmSync(dir, { recursive: true, force: true });
    throw redirect(303, `/recipe/${slug}`);
  },
};

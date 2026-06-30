import { fetchUrlText, isRetryableError, type Input } from "$core/services/import-recipe.ts";
import {
  createRecipeFromInput,
  enqueueImportJob,
  isImportRetryEnabled,
} from "$core/services/import-queue.ts";
import { fetchReelCaption, isInstagramUrl } from "$core/services/reel.ts";
import { fail, redirect } from "@sveltejs/kit";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Actions } from "./$types";

type Tab = "link" | "reel" | "text" | "photo";

/**
 * Erst synchron versuchen (Erfolg → direkt zum Rezept). Schlägt der Import mit
 * einem vorübergehenden Fehler fehl (Gemini-Überlastung) und hat der Nutzer
 * Auto-Retry aktiv, wird die Eingabe eingereiht und im Hintergrund weiterversucht.
 */
async function handleImport(tab: Tab, input: Input, locals: App.Locals) {
  let slug: string;
  try {
    slug = await createRecipeFromInput(input, locals.user?.id);
  } catch (e) {
    const err = e as Error;
    if (isRetryableError(err) && locals.user && isImportRetryEnabled(locals.user.id)) {
      enqueueImportJob(tab, input, locals.user.id);
      return { tab, queued: true };
    }
    return fail(503, { tab, error: err.message });
  }
  throw redirect(303, `/recipe/${slug}`);
}

export const actions: Actions = {
  link: async ({ request, locals }) => {
    const url = String((await request.formData()).get("url") ?? "").trim();
    if (!url) return fail(400, { tab: "link", error: "Bitte eine URL eingeben." });
    let text: string;
    try {
      text = await fetchUrlText(url);
    } catch (e) {
      return fail(400, { tab: "link", error: (e as Error).message });
    }
    return handleImport("link", { mode: "text", text, sourceUrl: url, label: url }, locals);
  },

  reel: async ({ request, locals }) => {
    const url = String((await request.formData()).get("url") ?? "").trim();
    if (!isInstagramUrl(url)) return fail(400, { tab: "reel", error: "Bitte einen Instagram-Reel-Link eingeben." });
    let caption: string;
    try {
      caption = await fetchReelCaption(url);
    } catch (e) {
      return fail(400, { tab: "reel", error: (e as Error).message });
    }
    return handleImport("reel", { mode: "text", text: caption, sourceUrl: url, label: `Reel ${url}` }, locals);
  },

  text: async ({ request, locals }) => {
    const text = String((await request.formData()).get("text") ?? "").trim();
    if (!text) return fail(400, { tab: "text", error: "Bitte Rezepttext eingeben." });
    return handleImport("text", { mode: "text", text, label: "Text" }, locals);
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

    // Temp-Dateien werden in handleImport (Erstversuch + ggf. Einreihen als base64)
    // gelesen, danach aufgeräumt.
    const dir = mkdtempSync(join(tmpdir(), "recipe-add-"));
    try {
      const paths: string[] = [];
      for (const f of files) {
        const p = join(dir, f.name || `bild-${paths.length}.jpg`);
        writeFileSync(p, Buffer.from(await f.arrayBuffer()));
        paths.push(p);
      }
      return await handleImport("photo", { mode: "images", images: paths, label: `${paths.length} Foto(s)` }, locals);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
};

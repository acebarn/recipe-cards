import { getProjectRoot } from "$core/paths.ts";
import { renderCard } from "$core/render.ts";
import { getRecipeBySlug, toRecipe } from "$core/services/library.ts";
import { error } from "@sveltejs/kit";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RequestHandler } from "./$types";

function parseScale(raw: string | null): number {
  if (!raw) return 1;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// Hinweis: renderCard ruft Typst synchron (execFileSync) auf – das blockiert
// den Event-Loop für die Dauer des Compiles. Da der Aufruf atomar bzgl. des
// Loops ist, können sich gleichzeitige Renders desselben Slugs nicht ins
// Gehege kommen; eine separate Render-Queue ist daher nicht nötig.
export const GET: RequestHandler = ({ params, url }) => {
  const stored = getRecipeBySlug(params.slug);
  if (!stored) throw error(404, "Rezept nicht gefunden");

  const scale = parseScale(url.searchParams.get("scale"));
  const outDir = join(tmpdir(), "recipe-pdf");
  let result;
  try {
    result = renderCard(toRecipe(stored), {
      projectRoot: getProjectRoot(),
      outDir,
      scale,
      slug: stored.slug,
    });
  } catch (e) {
    const detail = (e as { stderr?: Buffer }).stderr?.toString() ?? (e as Error).message;
    throw error(500, `PDF-Erzeugung fehlgeschlagen: ${detail}`);
  }

  const pdf = readFileSync(result.pdfPath);
  rmSync(result.pdfPath, { force: true });

  const suffix = scale !== 1 ? `-x${String(scale).replace(".", ",")}` : "";
  return new Response(pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${stored.slug}${suffix}.pdf"`,
    },
  });
};

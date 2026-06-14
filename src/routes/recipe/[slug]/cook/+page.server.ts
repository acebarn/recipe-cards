import { getProjectRoot } from "$core/paths.ts";
import { themeFor } from "$core/theme.ts";
import { getRecipeBySlug } from "$core/services/library.ts";
import { error } from "@sveltejs/kit";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ params, url }) => {
  const r = getRecipeBySlug(params.slug);
  if (!r) throw error(404, "Rezept nicht gefunden");
  const s = Number((url.searchParams.get("scale") ?? "1").replace(",", "."));
  const imgPath = r.imageFilename ? join(getProjectRoot(), "assets", r.imageFilename) : undefined;
  const theme = themeFor({
    title: r.meta.title,
    themeColor: r.meta.theme_color,
    imagePath: imgPath && existsSync(imgPath) ? imgPath : undefined,
  });
  return {
    accent: theme.accent,
    noteBg: theme.noteBg,
    slug: r.slug,
    title: r.meta.title,
    servings: r.meta.servings ?? null,
    ingredients: r.ingredients,
    equipment: r.meta.equipment ?? [],
    steps: r.steps,
    stepIngredients: r.stepIngredients ?? null, // exakte Zuordnung (M3) oder null → Heuristik
    initialScale: Number.isFinite(s) && s > 0 ? s : 1,
  };
};

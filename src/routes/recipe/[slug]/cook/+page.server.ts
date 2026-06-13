import { getRecipeBySlug } from "$core/services/library.ts";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ params, url }) => {
  const r = getRecipeBySlug(params.slug);
  if (!r) throw error(404, "Rezept nicht gefunden");
  const s = Number((url.searchParams.get("scale") ?? "1").replace(",", "."));
  return {
    slug: r.slug,
    title: r.meta.title,
    servings: r.meta.servings ?? null,
    ingredients: r.ingredients,
    equipment: r.meta.equipment ?? [],
    steps: r.steps,
    initialScale: Number.isFinite(s) && s > 0 ? s : 1,
  };
};

import { prettyCategory } from "$core/category.ts";
import { listRecipes } from "$core/services/library.ts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = () => {
  const recipes = listRecipes().map((r) => ({
    slug: r.slug,
    title: r.meta.title,
    category: prettyCategory(r.meta.category),
    image: r.imageFilename ?? null,
  }));
  return { recipes };
};

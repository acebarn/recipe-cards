import { prettyCategory } from "$core/category.ts";
import { listRecipes, searchRecipes } from "$core/services/library.ts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ url }) => {
  const q = (url.searchParams.get("q") ?? "").trim();
  const results = q ? searchRecipes(q) : listRecipes();
  const recipes = results.map((r) => ({
    slug: r.slug,
    title: r.meta.title,
    category: prettyCategory(r.meta.category),
    image: r.imageFilename ?? null,
  }));
  return { q, recipes };
};

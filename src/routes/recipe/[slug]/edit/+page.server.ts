import { parseRecipeFromString } from "$core/parse.ts";
import {
  categoryDirForCategory,
  getRecipeBySlug,
  updateRecipe,
} from "$core/services/library.ts";
import { enqueueUpsert } from "$core/services/sync-queue.ts";
import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ params }) => {
  const r = getRecipeBySlug(params.slug);
  if (!r) throw error(404, "Rezept nicht gefunden");
  return { slug: r.slug, title: r.meta.title, markdown: r.markdownBody };
};

export const actions: Actions = {
  default: async ({ request, params, locals }) => {
    const markdown = String((await request.formData()).get("markdown") ?? "");
    let recipe;
    try {
      recipe = parseRecipeFromString(markdown, params.slug);
    } catch (e) {
      return fail(400, { error: (e as Error).message, markdown });
    }
    const updated = updateRecipe(params.slug, {
      recipe,
      markdownBody: markdown.endsWith("\n") ? markdown : markdown + "\n",
      categoryDir: categoryDirForCategory(recipe.meta.category),
      updatedBy: locals.user?.id,
    });
    if (!updated) return fail(404, { error: "Rezept nicht gefunden.", markdown });
    enqueueUpsert(params.slug);
    throw redirect(303, `/recipe/${params.slug}`);
  },
};

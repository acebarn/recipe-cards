import { recipeIndex } from "$core/services/library.ts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => ({
  recipes: recipeIndex(),
  meId: locals.user?.id ?? null,
});

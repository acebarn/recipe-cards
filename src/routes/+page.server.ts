import { recipeIndex } from "$core/services/library.ts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = () => ({ recipes: recipeIndex() });

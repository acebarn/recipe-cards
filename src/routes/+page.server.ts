import { recipeIndex } from "$core/services/library.ts";
import { dismissImportJob, listActiveImportJobs } from "$core/services/import-queue.ts";
import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => ({
  recipes: recipeIndex(),
  meId: locals.user?.id ?? null,
  imports: locals.user ? listActiveImportJobs(locals.user.id) : [],
});

export const actions: Actions = {
  dismissImport: async ({ request, locals }) => {
    if (!locals.user) return fail(401);
    const id = Number((await request.formData()).get("id"));
    if (Number.isInteger(id)) dismissImportJob(id, locals.user.id);
    return { ok: true };
  },
};

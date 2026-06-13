import { prettyCategory, prettyDifficulty } from "$core/category.ts";
import { getRecipeBySlug, softDeleteRecipe } from "$core/services/library.ts";
import { enqueueDelete } from "$core/services/sync-queue.ts";
import { error, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

/** "H:MM" oder reine Minuten → "1 Std. 30 Min." / "20 Min." */
function formatTime(raw?: string): string | null {
  if (!raw) return null;
  let mins: number;
  if (raw.includes(":")) {
    const [h, m] = raw.split(":");
    mins = Number(h) * 60 + Number(m || 0);
  } else {
    mins = Number(raw);
  }
  if (!Number.isFinite(mins) || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h} Std. ${m} Min.`;
  if (h) return `${h} Std.`;
  return `${m} Min.`;
}

export const load: PageServerLoad = ({ params }) => {
  const r = getRecipeBySlug(params.slug);
  if (!r) throw error(404, "Rezept nicht gefunden");
  const m = r.meta;
  return {
    recipe: {
      slug: r.slug,
      title: m.title,
      image: r.imageFilename ?? null,
      category: prettyCategory(m.category),
      difficulty: prettyDifficulty(m.difficulty),
      servings: m.servings ?? null,
      times: {
        prep: formatTime(m.prep_time),
        cook: formatTime(m.cook_time),
        rest: formatTime(m.rest_time),
      },
      tags: m.tags ?? [],
      equipment: m.equipment ?? [],
      sourceUrls: m.source_url ?? [],
      ingredients: r.ingredients,
      steps: r.steps,
      notes: r.notes,
    },
  };
};

export const actions: Actions = {
  delete: ({ params }) => {
    const ref = softDeleteRecipe(params.slug);
    if (ref) enqueueDelete(ref);
    throw redirect(303, "/");
  },
};

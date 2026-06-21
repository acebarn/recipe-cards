import { env } from "$env/dynamic/private";
import { prettyCategory, prettyDifficulty } from "$core/category.ts";
import { regionLabel } from "$core/region.ts";
import { getProjectRoot } from "$core/paths.ts";
import { rebuildMarkdown } from "$core/serialize.ts";
import { themeFor } from "$core/theme.ts";
import { getRecipeBySlug, softDeleteRecipe, updateRecipe } from "$core/services/library.ts";
import { generateAndStoreImage } from "$core/services/image-store.ts";
import { enqueueDelete, enqueueUpsert } from "$core/services/sync-queue.ts";
import { getBringProvider } from "$core/services/shopping/account.ts";
import { addRecipeIngredients } from "$core/services/shopping/add-recipe.ts";
import { isStandard } from "$core/services/shopping/standard.ts";
import { isInventoryEnabled } from "$core/services/inventory/settings.ts";
import { getHouseholdId } from "$core/services/inventory/household.ts";
import { inventoryMap } from "$core/services/inventory/inventory.ts";
import { flattenIngredients } from "$core/ingredients.ts";
import { normalizeName, parseIngredient } from "$core/ingredient-parse.ts";
import { hasCalendarAccess, MEALS, type Meal } from "$core/services/calendar/settings.ts";
import { planMeal, type Recurrence } from "$core/services/calendar/plan.ts";
import { canManageRecipe, getUserById, isAdmin } from "$core/services/users.ts";
import { error, fail, redirect } from "@sveltejs/kit";
import { existsSync } from "node:fs";
import { join } from "node:path";
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

export const load: PageServerLoad = ({ params, locals }) => {
  const r = getRecipeBySlug(params.slug);
  if (!r) throw error(404, "Rezept nicht gefunden");
  const m = r.meta;
  // Pro-Rezept-Farbthema – gleiche Logik wie die Karte (theme_color → Bild → Titel).
  const imgPath = r.imageFilename ? join(getProjectRoot(), "assets", r.imageFilename) : undefined;
  const theme = themeFor({
    title: m.title,
    themeColor: m.theme_color,
    imagePath: imgPath && existsSync(imgPath) ? imgPath : undefined,
  });
  // Inventar-Abgleich: welche (Nicht-Standard-)Zutaten liegen bereits im Vorrat?
  // Dient dem "noch vorrätig?"-Dialog beim Auf-die-Einkaufsliste-Setzen.
  const inventoryEnabled = locals.user ? isInventoryEnabled(locals.user.id) : false;
  let inventoryMatches: {
    label: string;
    normalized: string;
    qty: string;
    low: boolean;
    location: string;
  }[] = [];
  if (locals.user && inventoryEnabled) {
    const map = inventoryMap(getHouseholdId(locals.user.id));
    const seen = new Set<string>();
    for (const line of flattenIngredients(r.ingredients)) {
      const { name } = parseIngredient(line);
      if (!name || isStandard(locals.user.id, name)) continue;
      const hit = map.get(normalizeName(name));
      if (hit && !seen.has(hit.normalized)) {
        seen.add(hit.normalized);
        inventoryMatches.push({
          label: hit.name,
          normalized: hit.normalized,
          qty: `${hit.amount}×`,
          low: hit.low,
          location: hit.location === "freezer" ? "🧊 Tiefkühl" : "🗄️ Vorrat",
        });
      }
    }
  }

  return {
    theme: {
      accent: theme.accent,
      accentSoft: theme.accentSoft,
      panelBg: theme.panelBg,
      panelHeading: theme.panelHeading,
      chipBg: theme.chipBg,
      noteBg: theme.noteBg,
    },
    inventoryEnabled,
    inventoryMatches,
    canAdmin: isAdmin(locals.user),
    canManage: canManageRecipe(locals.user, r.createdBy),
    canPlan: locals.user ? hasCalendarAccess(locals.user.id) : false,
    createdByName: r.createdBy ? (getUserById(r.createdBy)?.name ?? null) : null,
    imageSubject: m.image_subject ?? "",
    imageVersion: r.lastModified,
    recipe: {
      slug: r.slug,
      title: m.title,
      image: r.imageFilename ?? null,
      category: prettyCategory(m.category),
      difficulty: prettyDifficulty(m.difficulty),
      region: regionLabel(m.region) || null,
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
  delete: ({ params, locals }) => {
    const r = getRecipeBySlug(params.slug);
    if (!r) throw error(404, "Rezept nicht gefunden");
    if (!canManageRecipe(locals.user, r.createdBy)) {
      throw error(403, "Keine Berechtigung, dieses Rezept zu löschen.");
    }
    const ref = softDeleteRecipe(params.slug);
    if (ref) enqueueDelete(ref);
    throw redirect(303, "/");
  },

  // Admin: Bild mit (optional angepasstem) image_subject neu generieren.
  regenerateImage: async ({ request, params, locals }) => {
    if (!isAdmin(locals.user)) throw error(403, "Nur Admins dürfen Bilder neu generieren.");
    const r = getRecipeBySlug(params.slug);
    if (!r) throw error(404, "Rezept nicht gefunden");
    const apiKey = env.PIXAZO_API_KEY;
    if (!apiKey) return fail(500, { imgError: "Kein PIXAZO_API_KEY konfiguriert." });

    const subject = String((await request.formData()).get("image_subject") ?? "").trim();
    // image_subject übernehmen; image_prompt leeren, damit der Subject maßgeblich ist.
    const meta = { ...r.meta, image_subject: subject || undefined, image_prompt: undefined };
    let md = rebuildMarkdown(r.markdownBody, meta);
    if (!md.endsWith("\n")) md += "\n";
    const recipe = { meta, ingredients: r.ingredients, steps: r.steps, notes: r.notes, sourceFile: params.slug };
    updateRecipe(params.slug, {
      recipe,
      markdownBody: md,
      stepIngredients: r.stepIngredients,
      updatedBy: locals.user?.id,
    });

    try {
      // Zufalls-Seed → frisches Bild auch bei unverändertem Subject.
      await generateAndStoreImage(recipe, params.slug, apiKey, {
        seed: Math.floor(Math.random() * 2147483647),
      });
    } catch (e) {
      return fail(502, { imgError: `Bildgenerierung fehlgeschlagen: ${(e as Error).message}` });
    }
    enqueueUpsert(params.slug);
    return { imgOk: "Neues Bild generiert." };
  },

  // Zutaten (skaliert) auf die persönliche Bring-Einkaufsliste schieben.
  addToList: async ({ request, params, locals }) => {
    if (!locals.user) throw error(401, "Nicht angemeldet.");
    const r = getRecipeBySlug(params.slug);
    if (!r) throw error(404, "Rezept nicht gefunden");

    const provider = getBringProvider(locals.user.id);
    if (!provider) {
      return fail(400, {
        listError: "Erst ein Bring-Konto unter „🛒 Einkaufsliste“ verknüpfen.",
      });
    }

    const data = await request.formData();
    const raw = Number(String(data.get("scale") ?? "1").replace(",", "."));
    const scale = Number.isFinite(raw) && raw > 0 ? raw : 1;
    // Vom "noch vorrätig?"-Dialog bestätigte Posten → nicht auf die Liste.
    const excludeNormalized = new Set(data.getAll("inStock").map((v) => String(v)));

    try {
      const { added, merged, skipped, inStock } = await addRecipeIngredients(
        provider,
        locals.user.id,
        r.ingredients,
        scale,
        { excludeNormalized },
      );
      const parts = [`${added} hinzugefügt`, `${merged} zusammengeführt`];
      if (inStock) parts.push(`${inStock} vorrätig übersprungen`);
      if (skipped) parts.push(`${skipped} Standardzutaten übersprungen`);
      return { listOk: parts.join(", ") + "." };
    } catch (e) {
      return fail(502, { listError: `Bring-Fehler: ${(e as Error).message}` });
    }
  },

  // Rezept als Mahlzeit in den Google-Kalender einplanen.
  planMeal: async ({ request, params, locals }) => {
    if (!locals.user) throw error(401, "Nicht angemeldet.");
    const r = getRecipeBySlug(params.slug);
    if (!r) throw error(404, "Rezept nicht gefunden");
    if (!hasCalendarAccess(locals.user.id)) {
      return fail(400, { planError: "Kalender ist nicht verbunden – unter „📅 Kalender“ einrichten." });
    }

    const data = await request.formData();
    const date = String(data.get("date") ?? "");
    const meal = String(data.get("meal") ?? "") as Meal;
    const recurrence = String(data.get("recurrence") ?? "none") as Recurrence;
    const until = String(data.get("until") ?? "").trim() || undefined;
    if (!date) return fail(400, { planError: "Bitte ein Datum wählen." });
    if (!MEALS.includes(meal)) return fail(400, { planError: "Bitte eine Mahlzeit wählen." });

    try {
      const res = await planMeal({
        userId: locals.user.id,
        slug: params.slug,
        title: r.meta.title,
        date,
        meal,
        recurrence,
        until,
      });
      const when = new Date(res.date).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
      return { planOk: `${res.meal} am ${when} eingeplant${res.recurring ? " (wiederkehrend)" : ""}.` };
    } catch (e) {
      return fail(502, { planError: (e as Error).message });
    }
  },
};

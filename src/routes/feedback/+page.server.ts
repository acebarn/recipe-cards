import { CATEGORIES, isCategory, submitFeedback } from "$core/services/feedback.ts";
import { listTargets } from "$core/services/notify/targets.ts";
import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => {
  if (!locals.user) throw error(401, "Nicht angemeldet.");
  return { categories: CATEGORIES, name: locals.user.name ?? locals.user.email };
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const user = locals.user;
    if (!user) throw error(401, "Nicht angemeldet.");

    const data = await request.formData();
    const category = String(data.get("category") ?? "");
    const message = String(data.get("message") ?? "").trim();
    const page = String(data.get("page") ?? "").trim() || null;

    if (!isCategory(category)) return fail(400, { error: "Bitte eine Kategorie wählen.", message });
    if (message.length < 5) {
      return fail(400, { error: "Bitte schreib ein paar Worte mehr.", category, message });
    }
    if (message.length > 2000) {
      return fail(400, { error: "Bitte fasse dich etwas kürzer (max. 2000 Zeichen).", category });
    }

    const { notified } = await submitFeedback({
      userId: user.id,
      authorName: user.name ?? user.email,
      category,
      message,
      page,
    });

    // Ehrlich bleiben: gespeichert ist es immer, zugestellt nicht unbedingt.
    // Die drei Fälle auseinanderhalten, sonst steht da etwas Falsches.
    const empfaenger = listTargets().length;
    const hinweis =
      notified > 0
        ? "Danke! Deine Rückmeldung ist angekommen."
        : empfaenger === 0
          ? "Danke! Gespeichert — es ist allerdings niemand für Benachrichtigungen eingetragen."
          : "Danke! Gespeichert — die Benachrichtigung kam gerade nicht durch, gelesen wird sie trotzdem.";
    return { ok: true, hinweis };
  },
};

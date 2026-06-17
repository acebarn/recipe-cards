import { recipeIndex } from "$core/services/library.ts";
import { getRecipeBySlug } from "$core/services/library.ts";
import { deleteEvent, listEvents } from "$core/services/calendar/google.ts";
import { getSettings, hasCalendarAccess, MEALS, MEAL_LABELS, type Meal } from "$core/services/calendar/settings.ts";
import { planMeal, type Recurrence } from "$core/services/calendar/plan.ts";
import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

const iso = (d: Date) => d.toISOString().slice(0, 10);

function mondayOf(d: Date): Date {
  const x = new Date(d);
  const back = (x.getDay() + 6) % 7; // Mo=0 … So=6
  x.setDate(x.getDate() - back);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Zeit "HH:MM" → passende Mahlzeit (über die konfigurierten Zeiten), sonst null. */
function mealFromTime(time: string, times: Record<Meal, string>): Meal | null {
  for (const m of MEALS) if (times[m] === time) return m;
  return null;
}

export const load: PageServerLoad = async ({ locals, url }) => {
  const user = locals.user;
  if (!user) throw error(401, "Nicht angemeldet.");
  if (!hasCalendarAccess(user.id)) return { connected: false as const };

  const settings = getSettings(user.id);
  if (!settings.calendarId) return { connected: true as const, hasCalendar: false as const };

  // Wochenstart aus ?start=YYYY-MM-DD, sonst aktuelle Woche.
  const startParam = url.searchParams.get("start");
  const start = startParam && /^\d{4}-\d{2}-\d{2}$/.test(startParam) ? mondayOf(new Date(startParam)) : mondayOf(new Date());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  const startDate = iso(days[0]);
  const endDate = iso(days[6]);
  const prevStart = iso(new Date(start.getTime() - 7 * 864e5));
  const nextStart = iso(new Date(start.getTime() + 7 * 864e5));

  let eventsByDay: Record<string, { id: string; title: string; time: string; meal: string }[]> = {};
  let evError: string | undefined;
  try {
    const events = await listEvents(user.id, {
      calendarId: settings.calendarId,
      timeMin: `${startDate}T00:00:00Z`,
      timeMax: `${endDate}T23:59:59Z`,
    });
    for (const e of events) {
      const date = e.start.slice(0, 10);
      const time = e.start.length > 10 ? e.start.slice(11, 16) : "";
      const meal = time ? mealFromTime(time, settings.times) : null;
      (eventsByDay[date] ??= []).push({ id: e.id, title: e.summary, time, meal: meal ? MEAL_LABELS[meal] : "" });
    }
  } catch (e) {
    evError = (e as Error).message;
  }

  return {
    connected: true as const,
    hasCalendar: true as const,
    calendarName: settings.calendarName,
    days: days.map((d) => ({
      date: iso(d),
      label: d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "numeric" }),
      events: eventsByDay[iso(d)] ?? [],
    })),
    weekLabel: `${days[0].toLocaleDateString("de-DE", { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString("de-DE", { day: "numeric", month: "short" })}`,
    prevStart,
    nextStart,
    thisStart: iso(mondayOf(new Date())),
    meals: MEALS.map((m) => ({ value: m, label: MEAL_LABELS[m] })),
    recipes: recipeIndex().map((r) => ({ slug: r.slug, title: r.title, category: r.category })),
    evError,
  };
};

function requireUser(locals: App.Locals): number {
  if (!locals.user) throw error(401, "Nicht angemeldet.");
  return locals.user.id;
}

export const actions: Actions = {
  addEvent: async ({ request, locals }) => {
    const userId = requireUser(locals);
    const data = await request.formData();
    const slug = String(data.get("slug") ?? "");
    const date = String(data.get("date") ?? "");
    const meal = String(data.get("meal") ?? "") as Meal;
    const recurrence = (String(data.get("recurrence") ?? "none") || "none") as Recurrence;
    const r = slug ? getRecipeBySlug(slug) : null;
    if (!r) return fail(400, { error: "Rezept nicht gefunden." });
    if (!MEALS.includes(meal)) return fail(400, { error: "Mahlzeit wählen." });
    try {
      const res = await planMeal({ userId, slug, title: r.meta.title, date, meal, recurrence });
      return { ok: `„${r.meta.title}" → ${res.meal} am ${date} eingeplant.` };
    } catch (e) {
      return fail(502, { error: (e as Error).message });
    }
  },

  removeEvent: async ({ request, locals }) => {
    const userId = requireUser(locals);
    const eventId = String((await request.formData()).get("eventId") ?? "");
    const settings = getSettings(userId);
    if (!settings.calendarId || !eventId) return fail(400, { error: "Kein Eintrag gewählt." });
    try {
      await deleteEvent(userId, settings.calendarId, eventId);
      return { ok: "Eintrag entfernt." };
    } catch (e) {
      return fail(502, { error: (e as Error).message });
    }
  },
};

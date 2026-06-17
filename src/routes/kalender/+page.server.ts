import { listCalendars } from "$core/services/calendar/google.ts";
import {
  getSettings,
  hasCalendarAccess,
  MEALS,
  setCalendar,
  setMealTimes,
  type Meal,
} from "$core/services/calendar/settings.ts";
import { deleteGoogleToken } from "$core/services/calendar/tokens.ts";
import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const user = locals.user;
  if (!user) throw error(401, "Nicht angemeldet.");

  if (!hasCalendarAccess(user.id)) return { connected: false as const };

  const settings = getSettings(user.id);
  try {
    const calendars = await listCalendars(user.id);
    return { connected: true as const, settings, calendars };
  } catch (e) {
    return { connected: true as const, settings, calendars: [], error: (e as Error).message };
  }
};

function requireUser(locals: App.Locals): number {
  if (!locals.user) throw error(401, "Nicht angemeldet.");
  return locals.user.id;
}

export const actions: Actions = {
  setCalendar: async ({ request, locals }) => {
    const userId = requireUser(locals);
    const data = await request.formData();
    const calendarId = String(data.get("calendarId") ?? "");
    const calendarName = String(data.get("calendarName") ?? "");
    if (!calendarId) return fail(400, { error: "Bitte einen Kalender wählen." });
    setCalendar(userId, calendarId, calendarName);
    return { ok: `Kalender „${calendarName}" aktiviert.` };
  },

  setTimes: async ({ request, locals }) => {
    const userId = requireUser(locals);
    const data = await request.formData();
    const times: Partial<Record<Meal, string>> = {};
    for (const m of MEALS) times[m] = String(data.get(m) ?? "");
    const marker = Number(data.get("marker") ?? 15);
    setMealTimes(userId, times, marker);
    return { ok: "Zeiten gespeichert." };
  },

  disconnect: async ({ locals }) => {
    deleteGoogleToken(requireUser(locals));
    return { ok: "Kalender getrennt. Zum erneuten Verbinden neu anmelden." };
  },
};

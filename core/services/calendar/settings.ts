// Kalender-Einstellungen je Nutzer: gewählter Kalender + übliche Mahlzeit-Zeiten.
import { getDb } from "../db.ts";
import { hasGoogleToken } from "./tokens.ts";

export type Meal = "breakfast" | "lunch" | "dinner" | "snack";

export const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];
export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: "Frühstück",
  lunch: "Mittagessen",
  dinner: "Abendessen",
  snack: "Zwischendurch",
};

export interface CalendarSettings {
  calendarId: string | null;
  calendarName: string | null;
  tz: string;
  times: Record<Meal, string>;
  markerMinutes: number;
}

interface SettingsRow {
  calendar_id: string | null;
  calendar_name: string | null;
  tz: string;
  breakfast_time: string;
  lunch_time: string;
  dinner_time: string;
  snack_time: string;
  marker_minutes: number;
}

const DEFAULTS: CalendarSettings = {
  calendarId: null,
  calendarName: null,
  tz: "Europe/Berlin",
  times: { breakfast: "08:00", lunch: "12:30", dinner: "18:30", snack: "15:30" },
  markerMinutes: 15,
};

/** Einstellungen des Nutzers (oder Defaults, falls noch nichts gespeichert). */
export function getSettings(userId: number): CalendarSettings {
  const row = getDb()
    .prepare(
      `SELECT calendar_id, calendar_name, tz, breakfast_time, lunch_time, dinner_time, snack_time, marker_minutes
       FROM calendar_settings WHERE user_id = ?`,
    )
    .get(userId) as SettingsRow | undefined;
  if (!row) return { ...DEFAULTS, times: { ...DEFAULTS.times } };
  return {
    calendarId: row.calendar_id,
    calendarName: row.calendar_name,
    tz: row.tz,
    times: {
      breakfast: row.breakfast_time,
      lunch: row.lunch_time,
      dinner: row.dinner_time,
      snack: row.snack_time,
    },
    markerMinutes: row.marker_minutes,
  };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function upsert(userId: number, s: CalendarSettings): void {
  getDb()
    .prepare(
      `INSERT INTO calendar_settings
         (user_id, calendar_id, calendar_name, tz, breakfast_time, lunch_time, dinner_time, snack_time, marker_minutes, updated_at)
       VALUES (@user_id, @calendar_id, @calendar_name, @tz, @breakfast, @lunch, @dinner, @snack, @marker, @now)
       ON CONFLICT(user_id) DO UPDATE SET
         calendar_id=@calendar_id, calendar_name=@calendar_name, tz=@tz,
         breakfast_time=@breakfast, lunch_time=@lunch, dinner_time=@dinner, snack_time=@snack,
         marker_minutes=@marker, updated_at=@now`,
    )
    .run({
      user_id: userId,
      calendar_id: s.calendarId,
      calendar_name: s.calendarName,
      tz: s.tz,
      breakfast: s.times.breakfast,
      lunch: s.times.lunch,
      dinner: s.times.dinner,
      snack: s.times.snack,
      marker: s.markerMinutes,
      now: new Date().toISOString(),
    });
}

export function setCalendar(userId: number, calendarId: string, calendarName: string): void {
  upsert(userId, { ...getSettings(userId), calendarId, calendarName });
}

/** Mahlzeit-Zeiten + Marker-Dauer setzen (ungültige Zeiten werden auf die Defaults gehalten). */
export function setMealTimes(
  userId: number,
  times: Partial<Record<Meal, string>>,
  markerMinutes: number,
): void {
  const cur = getSettings(userId);
  const next = { ...cur.times };
  for (const m of MEALS) {
    const v = times[m];
    if (v && HHMM.test(v)) next[m] = v;
  }
  const marker = Number.isFinite(markerMinutes) && markerMinutes > 0 && markerMinutes <= 240
    ? Math.round(markerMinutes)
    : cur.markerMinutes;
  upsert(userId, { ...cur, times: next, markerMinutes: marker });
}

export function hasCalendarAccess(userId: number): boolean {
  return hasGoogleToken(userId);
}

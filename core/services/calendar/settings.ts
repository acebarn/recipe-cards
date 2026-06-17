// Kalender-Einstellungen je Nutzer: gewählter Kalender + übliche Mahlzeit-Zeiten
// (je Mahlzeit optional „ganztägig" → ohne Uhrzeit).
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
  allDay: Record<Meal, boolean>;
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
  breakfast_allday: number;
  lunch_allday: number;
  dinner_allday: number;
  snack_allday: number;
  marker_minutes: number;
}

const DEFAULTS: CalendarSettings = {
  calendarId: null,
  calendarName: null,
  tz: "Europe/Berlin",
  times: { breakfast: "08:00", lunch: "12:30", dinner: "18:30", snack: "15:30" },
  allDay: { breakfast: false, lunch: false, dinner: false, snack: false },
  markerMinutes: 15,
};

/** Einstellungen des Nutzers (oder Defaults, falls noch nichts gespeichert). */
export function getSettings(userId: number): CalendarSettings {
  const row = getDb()
    .prepare(
      `SELECT calendar_id, calendar_name, tz, breakfast_time, lunch_time, dinner_time, snack_time,
              breakfast_allday, lunch_allday, dinner_allday, snack_allday, marker_minutes
       FROM calendar_settings WHERE user_id = ?`,
    )
    .get(userId) as SettingsRow | undefined;
  if (!row) return { ...DEFAULTS, times: { ...DEFAULTS.times }, allDay: { ...DEFAULTS.allDay } };
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
    allDay: {
      breakfast: !!row.breakfast_allday,
      lunch: !!row.lunch_allday,
      dinner: !!row.dinner_allday,
      snack: !!row.snack_allday,
    },
    markerMinutes: row.marker_minutes,
  };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function upsert(userId: number, s: CalendarSettings): void {
  getDb()
    .prepare(
      `INSERT INTO calendar_settings
         (user_id, calendar_id, calendar_name, tz, breakfast_time, lunch_time, dinner_time, snack_time,
          breakfast_allday, lunch_allday, dinner_allday, snack_allday, marker_minutes, updated_at)
       VALUES (@user_id, @calendar_id, @calendar_name, @tz, @breakfast, @lunch, @dinner, @snack,
          @b_all, @l_all, @d_all, @s_all, @marker, @now)
       ON CONFLICT(user_id) DO UPDATE SET
         calendar_id=@calendar_id, calendar_name=@calendar_name, tz=@tz,
         breakfast_time=@breakfast, lunch_time=@lunch, dinner_time=@dinner, snack_time=@snack,
         breakfast_allday=@b_all, lunch_allday=@l_all, dinner_allday=@d_all, snack_allday=@s_all,
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
      b_all: s.allDay.breakfast ? 1 : 0,
      l_all: s.allDay.lunch ? 1 : 0,
      d_all: s.allDay.dinner ? 1 : 0,
      s_all: s.allDay.snack ? 1 : 0,
      marker: s.markerMinutes,
      now: new Date().toISOString(),
    });
}

export function setCalendar(userId: number, calendarId: string, calendarName: string): void {
  upsert(userId, { ...getSettings(userId), calendarId, calendarName });
}

/** Mahlzeit-Zeiten, Ganztags-Flags + Marker-Dauer setzen. */
export function setMealTimes(
  userId: number,
  times: Partial<Record<Meal, string>>,
  allDay: Partial<Record<Meal, boolean>>,
  markerMinutes: number,
): void {
  const cur = getSettings(userId);
  const nextTimes = { ...cur.times };
  const nextAll = { ...cur.allDay };
  for (const m of MEALS) {
    const v = times[m];
    if (v && HHMM.test(v)) nextTimes[m] = v;
    nextAll[m] = !!allDay[m];
  }
  const marker = Number.isFinite(markerMinutes) && markerMinutes > 0 && markerMinutes <= 240
    ? Math.round(markerMinutes)
    : cur.markerMinutes;
  upsert(userId, { ...cur, times: nextTimes, allDay: nextAll, markerMinutes: marker });
}

export function hasCalendarAccess(userId: number): boolean {
  return hasGoogleToken(userId);
}

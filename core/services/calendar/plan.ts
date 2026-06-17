// Plant ein Rezept als Mahlzeit in den Google-Kalender des Nutzers.
import { insertEvent } from "./google.ts";
import { getSettings, MEAL_LABELS, type Meal } from "./settings.ts";

export type Recurrence = "none" | "weekly" | "biweekly" | "monthly";

const RRULE: Record<Exclude<Recurrence, "none">, string> = {
  weekly: "FREQ=WEEKLY",
  biweekly: "FREQ=WEEKLY;INTERVAL=2",
  monthly: "FREQ=MONTHLY",
};

/** Baut die RRULE-Liste (Wochentag ergibt sich aus dem Startdatum). */
export function buildRecurrence(kind: Recurrence, until?: string): string[] {
  if (kind === "none") return [];
  let rule = RRULE[kind];
  if (until && /^\d{4}-\d{2}-\d{2}$/.test(until)) {
    rule += `;UNTIL=${until.replace(/-/g, "")}T235959Z`;
  }
  return [`RRULE:${rule}`];
}

/** "18:30" + 15 → "18:45" (Tagesüberlauf wird gekappt). */
function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(h * 60 + m + mins, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export interface PlanInput {
  userId: number;
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  meal: Meal;
  recurrence?: Recurrence;
  until?: string;
}

export interface PlanResult {
  meal: string;
  date: string;
  recurring: boolean;
}

/** Legt den Mahlzeiten-Marker (Titel = Gericht, Beschreibung = Rezept-Link) im Kalender an. */
export async function planMeal(input: PlanInput): Promise<PlanResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Ungültiges Datum.");
  const s = getSettings(input.userId);
  if (!s.calendarId) throw new Error("Bitte zuerst unter „Kalender“ einen Kalender wählen.");

  const origin = (process.env.ORIGIN || "").replace(/\/$/, "");
  const allDay = s.allDay[input.meal];
  const start = s.times[input.meal];

  await insertEvent(input.userId, {
    calendarId: s.calendarId,
    summary: input.title,
    description: origin ? `${origin}/recipe/${input.slug}` : `Rezept: ${input.title}`,
    tz: s.tz,
    recurrence: buildRecurrence(input.recurrence ?? "none", input.until),
    allDay,
    date: input.date,
    startTime: start,
    endTime: addMinutes(start, s.markerMinutes),
  });

  return {
    meal: MEAL_LABELS[input.meal],
    date: input.date,
    recurring: (input.recurrence ?? "none") !== "none",
  };
}

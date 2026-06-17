// Google-Calendar-Zugriff je Nutzer via REST (raw fetch, Muster wie Gemini/Bring).
// Access-Token wird bei Ablauf per Refresh-Grant erneuert.
import { getGoogleToken, updateAccessToken } from "./tokens.ts";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";

export interface CalendarRef {
  id: string;
  summary: string;
  primary: boolean;
}
export interface CalendarEvent {
  id: string;
  summary: string;
  description: string;
  start: string; // ISO oder Datum
  end: string;
}
export interface EventInput {
  calendarId: string;
  summary: string;
  description: string;
  startISO: string;
  endISO: string;
  tz: string;
  recurrence?: string[]; // z.B. ["RRULE:FREQ=WEEKLY;INTERVAL=2"]
}

export class CalendarError extends Error {}

/** Gültiges Access-Token holen oder per Refresh-Grant erneuern. */
async function getAccessToken(userId: number): Promise<string> {
  const tok = getGoogleToken(userId);
  if (!tok) throw new CalendarError("Kein Kalender verbunden.");

  const buffer = 60_000; // 1 min Puffer
  if (tok.accessToken && tok.expiresAt && new Date(tok.expiresAt).getTime() - buffer > Date.now()) {
    return tok.accessToken;
  }

  const id = process.env.AUTH_GOOGLE_ID;
  const secret = process.env.AUTH_GOOGLE_SECRET;
  if (!id || !secret) throw new CalendarError("AUTH_GOOGLE_ID/SECRET nicht gesetzt.");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: tok.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new CalendarError("Kalender-Zugriff abgelaufen – bitte unter „Kalender“ neu verbinden.");
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new CalendarError("Kein Access-Token erhalten.");
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
  updateAccessToken(userId, data.access_token, expiresAt);
  return data.access_token;
}

async function api<T>(userId: number, method: string, path: string, body?: unknown): Promise<T> {
  const token = await getAccessToken(userId);
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = (await res.text()).slice(0, 300);
    throw new CalendarError(`Google-Calendar-Fehler (HTTP ${res.status}): ${txt}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Beschreibbare Kalender des Nutzers (owner/writer), primärer zuerst. */
export async function listCalendars(userId: number): Promise<CalendarRef[]> {
  const data = await api<{ items?: Array<{ id: string; summary: string; primary?: boolean; accessRole?: string }> }>(
    userId,
    "GET",
    "/users/me/calendarList",
  );
  return (data.items ?? [])
    .filter((c) => c.accessRole === "owner" || c.accessRole === "writer")
    .map((c) => ({ id: c.id, summary: c.summary, primary: !!c.primary }))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.summary.localeCompare(b.summary, "de"));
}

export async function insertEvent(userId: number, ev: EventInput): Promise<{ id: string }> {
  const body: Record<string, unknown> = {
    summary: ev.summary,
    description: ev.description,
    start: { dateTime: ev.startISO, timeZone: ev.tz },
    end: { dateTime: ev.endISO, timeZone: ev.tz },
  };
  if (ev.recurrence?.length) body.recurrence = ev.recurrence;
  return api<{ id: string }>(userId, "POST", `/calendars/${encodeURIComponent(ev.calendarId)}/events`, body);
}

export async function listEvents(
  userId: number,
  opts: { calendarId: string; timeMin: string; timeMax: string },
): Promise<CalendarEvent[]> {
  const q = new URLSearchParams({
    timeMin: opts.timeMin,
    timeMax: opts.timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const data = await api<{ items?: Array<{ id: string; summary?: string; description?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }> }>(
    userId,
    "GET",
    `/calendars/${encodeURIComponent(opts.calendarId)}/events?${q}`,
  );
  return (data.items ?? []).map((e) => ({
    id: e.id,
    summary: e.summary ?? "",
    description: e.description ?? "",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
  }));
}

export async function deleteEvent(userId: number, calendarId: string, eventId: string): Promise<void> {
  await api<void>(
    userId,
    "DELETE",
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
  );
}

import { normalizeQuery, recordEvent } from "$core/services/events.ts";
import { json, type RequestHandler } from "@sveltejs/kit";

/**
 * Beacon für Events, die nur im Browser entstehen. Die Suche filtert clientseitig
 * über den kompletten Index — der Server sieht sie sonst nie, dabei sind gerade
 * Suchen ohne Treffer die interessanteste Kennzahl (fehlende Rezepte).
 *
 * Bewusst eng: nur "search", nur angemeldete Nutzer, nur normalisierter Begriff
 * und Trefferzahl. Alles andere wird serverseitig direkt verbucht.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ ok: false }, { status: 401 });

  let body: { action?: string; q?: string; hits?: number };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false }, { status: 400 });
  }

  if (body.action !== "search") return json({ ok: false }, { status: 400 });

  const q = normalizeQuery(String(body.q ?? ""));
  if (q.length < 3) return json({ ok: true }); // Tippfragmente nicht sammeln

  recordEvent("search", {
    userId: locals.user.id,
    detail: { q, hits: Number.isFinite(body.hits) ? Number(body.hits) : 0 },
  });
  return json({ ok: true });
};

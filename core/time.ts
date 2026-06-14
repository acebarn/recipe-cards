// Zeit-Parsing für Rezept-Metadaten ("H:MM" oder reine Minutenzahl).

/** "1:30" oder "20" → Minuten (0, wenn leer/ungültig). */
export function parseMinutes(raw?: string): number {
  if (!raw) return 0;
  const s = raw.trim();
  if (!s) return 0;
  let mins: number;
  if (s.includes(":")) {
    const [h, m] = s.split(":");
    mins = Number(h) * 60 + Number(m || 0);
  } else {
    mins = Number(s.replace(",", "."));
  }
  return Number.isFinite(mins) && mins > 0 ? Math.round(mins) : 0;
}

/** Summe aus Vorbereitung + Koch + Ruhe; null, wenn keine Zeit angegeben. */
export function totalMinutes(prep?: string, cook?: string, rest?: string): number | null {
  const sum = parseMinutes(prep) + parseMinutes(cook) + parseMinutes(rest);
  return sum > 0 ? sum : null;
}

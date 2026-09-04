// Nutzungs-Events: was in der App tatsächlich getan wird (Kochmodus, Druck,
// Suche, Import, Einkaufsliste, Wochenplan). Landet in audit_log — die Tabelle
// gibt es seit Migration 001, gefüllt wird sie erst seit 009.
//
// Datenschutz: In einem Haushalt mit drei namentlich bekannten Nutzern ist jedes
// Event faktisch personenbezogen. Deshalb bewusst ohne IP, User-Agent und
// Referrer; Suchbegriffe werden gekürzt und normalisiert; alte Events fallen
// nach RETENTION_MONTHS raus. Die Auswertung auf /statistik zeigt Summen, keine
// Personenprofile.
//
// Grundsatz: Messen darf nie einen Request kaputtmachen. recordEvent() schluckt
// jeden Fehler.
import { getDb } from "./db.ts";

export type EventAction =
  | "recipe_view"
  | "cook_start"
  | "pdf_export"
  | "import"
  | "shopping_add"
  | "plan_meal"
  | "search";

/** Erlaubte Aktionen — begrenzt, was über den Beacon-Endpunkt hereinkommen kann. */
export const EVENT_ACTIONS: EventAction[] = [
  "recipe_view",
  "cook_start",
  "pdf_export",
  "import",
  "shopping_add",
  "plan_meal",
  "search",
];

export const RETENTION_MONTHS = 12;

interface EventInput {
  userId?: number | null;
  slug?: string | null;
  detail?: Record<string, string | number | boolean | null>;
}

/** Ein Event verbuchen. Wirft nie — Messfehler dürfen keinen Request kosten. */
export function recordEvent(action: EventAction, input: EventInput = {}): void {
  try {
    getDb()
      .prepare("INSERT INTO audit_log (user_id, action, recipe_slug, detail, at) VALUES (?, ?, ?, ?, ?)")
      .run(
        input.userId ?? null,
        action,
        input.slug ?? null,
        input.detail ? JSON.stringify(input.detail) : null,
        new Date().toISOString(),
      );
  } catch (e) {
    console.error("Event nicht verbucht:", (e as Error).message);
  }
}

/** Suchbegriff für die Ablage entschärfen: klein, getrimmt, gekappt. */
export function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase().slice(0, 60);
}

// ---------------- Auswertung ----------------

const seit = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString();

export interface ActionCount {
  action: EventAction;
  count: number;
}
export interface RecipeCount {
  slug: string;
  title: string;
  count: number;
  /** Wie viele verschiedene Personen — entzerrt Ranglisten, die sonst eine
   *  vielklickende Person allein bestimmt. */
  users: number;
}
export interface QueryCount {
  query: string;
  count: number;
  hits: number;
  users: number;
}
export interface DayCount {
  day: string;
  count: number;
}

export interface UsageStats {
  days: number;
  total: number;
  /** Personen mit mindestens einer Aktion im Zeitraum. */
  activeUsers: number;
  firstEventAt: string | null;
  perAction: ActionCount[];
  topCooked: RecipeCount[];
  topViewed: RecipeCount[];
  topPrinted: RecipeCount[];
  topShopped: RecipeCount[];
  emptySearches: QueryCount[];
  topSearches: QueryCount[];
  importSources: ActionCount[];
  perDay: DayCount[];
  neglected: { slug: string; title: string; lastAt: string | null }[];
}

/** Meistgenutzte Rezepte für eine Aktion (mit Titel aus der Bibliothek). */
function topRecipes(action: EventAction, since: string, limit = 8): RecipeCount[] {
  return getDb()
    .prepare(
      `SELECT a.recipe_slug AS slug,
              r.title       AS title,
              COUNT(*)      AS count,
              COUNT(DISTINCT a.user_id) AS users
         FROM audit_log a
         JOIN recipes r ON r.slug = a.recipe_slug AND r.deleted_at IS NULL
        WHERE a.action = ? AND a.at >= ? AND a.recipe_slug IS NOT NULL
        GROUP BY a.recipe_slug
        ORDER BY users DESC, count DESC, r.title
        LIMIT ?`,
    )
    .all(action, since, limit) as RecipeCount[];
}

/** Suchanfragen im Zeitraum, wahlweise nur die ohne Treffer. */
function searches(since: string, nurLeer: boolean, limit = 10): QueryCount[] {
  const rows = getDb()
    .prepare(
      `SELECT detail, COUNT(*) AS count, COUNT(DISTINCT user_id) AS users
         FROM audit_log
        WHERE action = 'search' AND at >= ? AND detail IS NOT NULL
        GROUP BY detail
        ORDER BY count DESC
        LIMIT 400`,
    )
    .all(since) as { detail: string; count: number; users: number }[];

  // Gleiche Suchbegriffe mit unterschiedlicher Trefferzahl zusammenfassen.
  const zusammen = new Map<string, QueryCount>();
  for (const row of rows) {
    let parsed: { q?: string; hits?: number };
    try {
      parsed = JSON.parse(row.detail) as { q?: string; hits?: number };
    } catch {
      continue;
    }
    if (!parsed.q) continue;
    const hits = typeof parsed.hits === "number" ? parsed.hits : 0;
    const vorhanden = zusammen.get(parsed.q);
    if (vorhanden) {
      vorhanden.count += row.count;
      vorhanden.hits = Math.max(vorhanden.hits, hits);
      // Obergrenze: dieselbe Person kann in mehreren detail-Gruppen stecken,
      // deshalb nicht addieren, sondern das Maximum nehmen.
      vorhanden.users = Math.max(vorhanden.users, row.users);
    } else {
      zusammen.set(parsed.q, { query: parsed.q, count: row.count, hits, users: row.users });
    }
  }
  return [...zusammen.values()]
    .filter((q) => (nurLeer ? q.hits === 0 : true))
    .sort((a, b) => b.users - a.users || b.count - a.count)
    .slice(0, limit);
}

/** Rezepte, die im Zeitraum niemand angefasst hat — Kandidaten zum Aussortieren. */
function neglectedRecipes(since: string, limit = 8) {
  return getDb()
    .prepare(
      `SELECT r.slug, r.title, MAX(a.at) AS lastAt
         FROM recipes r
         LEFT JOIN audit_log a ON a.recipe_slug = r.slug
        WHERE r.deleted_at IS NULL
        GROUP BY r.slug
       HAVING lastAt IS NULL OR lastAt < ?
        ORDER BY lastAt IS NOT NULL, lastAt, r.title
        LIMIT ?`,
    )
    .all(since, limit) as { slug: string; title: string; lastAt: string | null }[];
}

/** Alle Nutzungskennzahlen für /statistik. `days` begrenzt den Zeitraum. */
export function computeUsage(days = 90): UsageStats {
  const db = getDb();
  const since = seit(days);

  const perAction = db
    .prepare(
      `SELECT action, COUNT(*) AS count FROM audit_log
        WHERE at >= ? GROUP BY action ORDER BY count DESC`,
    )
    .all(since) as ActionCount[];

  const importSources = db
    .prepare(
      `SELECT json_extract(detail, '$.source') AS action, COUNT(*) AS count
         FROM audit_log
        WHERE action = 'import' AND at >= ? AND detail IS NOT NULL
        GROUP BY action ORDER BY count DESC`,
    )
    .all(since) as ActionCount[];

  const perDay = db
    .prepare(
      `SELECT substr(at, 1, 10) AS day, COUNT(*) AS count
         FROM audit_log WHERE at >= ?
        GROUP BY day ORDER BY day`,
    )
    .all(since) as DayCount[];

  return {
    days,
    total: (db.prepare("SELECT COUNT(*) c FROM audit_log WHERE at >= ?").get(since) as { c: number }).c,
    activeUsers: (
      db
        .prepare("SELECT COUNT(DISTINCT user_id) c FROM audit_log WHERE at >= ? AND user_id IS NOT NULL")
        .get(since) as { c: number }
    ).c,
    firstEventAt:
      (db.prepare("SELECT MIN(at) a FROM audit_log").get() as { a: string | null }).a ?? null,
    perAction,
    topCooked: topRecipes("cook_start", since),
    topViewed: topRecipes("recipe_view", since),
    topPrinted: topRecipes("pdf_export", since),
    topShopped: topRecipes("shopping_add", since),
    emptySearches: searches(since, true),
    topSearches: searches(since, false),
    importSources: importSources.filter((s) => s.action),
    perDay,
    neglected: neglectedRecipes(since),
  };
}

// ---------------- Aufbewahrung ----------------

/** Events älter als RETENTION_MONTHS entfernen. Gibt die Anzahl zurück. */
export function purgeOldEvents(): number {
  const grenze = new Date();
  grenze.setMonth(grenze.getMonth() - RETENTION_MONTHS);
  return getDb()
    .prepare("DELETE FROM audit_log WHERE at < ?")
    .run(grenze.toISOString()).changes;
}

let started = false;

/** Täglicher Aufräumlauf für die Aufbewahrungsfrist. */
export function startEventRetention(): void {
  if (started) return;
  started = true;
  const lauf = () => {
    try {
      const weg = purgeOldEvents();
      if (weg) console.error(`Events außerhalb der Aufbewahrungsfrist entfernt: ${weg}`);
    } catch (e) {
      console.error("Event-Aufräumlauf fehlgeschlagen:", (e as Error).message);
    }
  };
  setInterval(lauf, 24 * 60 * 60 * 1000);
  lauf();
}

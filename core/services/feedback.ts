// Rückmeldungen aus der App: Fehler, Wünsche, Lob.
//
// Wird immer erst in der DB gespeichert und danach benachrichtigt. Wenn Telegram
// klemmt, ist die Rückmeldung trotzdem da und taucht in der Admin-Liste auf —
// niemand verliert seinen Hinweis, weil ein Bot gerade nicht erreichbar war.
import { getDb } from "./db.ts";
import { escapeHtml, notifyAll } from "./notify/targets.ts";

export type FeedbackCategory = "bug" | "wunsch" | "lob";

export const CATEGORIES: { key: FeedbackCategory; icon: string; label: string; hint: string }[] = [
  { key: "bug", icon: "🐞", label: "Fehler", hint: "Etwas funktioniert nicht wie erwartet" },
  { key: "wunsch", icon: "💡", label: "Wunsch", hint: "Eine Idee oder eine fehlende Funktion" },
  { key: "lob", icon: "💬", label: "Rückmeldung", hint: "Lob, Kritik oder eine Frage" },
];

const LABEL: Record<FeedbackCategory, string> = {
  bug: "🐞 Fehler",
  wunsch: "💡 Wunsch",
  lob: "💬 Rückmeldung",
};

export const isCategory = (v: string): v is FeedbackCategory =>
  CATEGORIES.some((c) => c.key === v);

export interface FeedbackEntry {
  id: number;
  category: FeedbackCategory;
  message: string;
  page: string | null;
  status: "neu" | "erledigt";
  createdAt: string;
  author: string | null;
}

/** Rückmeldung speichern und die Empfänger benachrichtigen. */
export async function submitFeedback(input: {
  userId?: number | null;
  authorName: string;
  category: FeedbackCategory;
  message: string;
  page?: string | null;
}): Promise<{ id: number; notified: number }> {
  const db = getDb();
  const info = db
    .prepare(
      "INSERT INTO feedback (user_id, category, message, page, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      input.userId ?? null,
      input.category,
      input.message,
      input.page ?? null,
      new Date().toISOString(),
    );
  const id = Number(info.lastInsertRowid);

  const notified = await notifyAll(
    `${LABEL[input.category]} <b>von ${escapeHtml(input.authorName)}</b>\n\n` +
      `${escapeHtml(input.message)}` +
      (input.page ? `\n\n<i>Seite: ${escapeHtml(input.page)}</i>` : ""),
  );
  if (notified > 0) db.prepare("UPDATE feedback SET notified = 1 WHERE id = ?").run(id);
  return { id, notified };
}

/** Rückmeldungen für die Admin-Ansicht, neueste zuerst. */
export function listFeedback(limit = 50): FeedbackEntry[] {
  return getDb()
    .prepare(
      `SELECT f.id, f.category, f.message, f.page, f.status, f.created_at AS createdAt,
              COALESCE(u.name, u.email) AS author
         FROM feedback f
         LEFT JOIN users u ON u.id = f.user_id
        ORDER BY f.status = 'erledigt', f.id DESC
        LIMIT ?`,
    )
    .all(limit) as FeedbackEntry[];
}

export function countOpenFeedback(): number {
  return (
    getDb().prepare("SELECT COUNT(*) c FROM feedback WHERE status = 'neu'").get() as { c: number }
  ).c;
}

export function setFeedbackStatus(id: number, status: "neu" | "erledigt"): void {
  getDb().prepare("UPDATE feedback SET status = ? WHERE id = ?").run(status, id);
}

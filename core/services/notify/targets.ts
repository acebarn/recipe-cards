// Wer wird benachrichtigt? Ein Telegram-Bot darf nur Leute anschreiben, die ihn
// selbst gestartet haben. Deshalb trägt niemand Chat-IDs von Hand ein: Die
// Person öffnet aus den Einstellungen einen Deeplink mit Einmal-Code, drückt in
// Telegram auf „Start", und der Webhook verknüpft Code → Chat.
import { randomUUID } from "node:crypto";
import { getDb } from "../db.ts";
import { escapeHtml, sendTelegram } from "./telegram.ts";

export interface NotifyTarget {
  id: number;
  userId: number | null;
  chatId: string;
  label: string | null;
  createdAt: string;
}

interface TargetRow {
  id: number;
  user_id: number | null;
  chat_id: string;
  label: string | null;
  created_at: string;
}

const toTarget = (r: TargetRow): NotifyTarget => ({
  id: r.id,
  userId: r.user_id,
  chatId: r.chat_id,
  label: r.label,
  createdAt: r.created_at,
});

export function listTargets(): NotifyTarget[] {
  return (getDb().prepare("SELECT * FROM notify_targets ORDER BY id").all() as TargetRow[]).map(
    toTarget,
  );
}

export function targetForUser(userId: number): NotifyTarget | null {
  const row = getDb()
    .prepare("SELECT * FROM notify_targets WHERE user_id = ?")
    .get(userId) as TargetRow | undefined;
  return row ? toTarget(row) : null;
}

export function removeTarget(id: number): void {
  getDb().prepare("DELETE FROM notify_targets WHERE id = ?").run(id);
}

// ---------------- Verknüpfung ----------------

/** Einmal-Code für den /start-Deeplink erzeugen (alte Codes des Nutzers verfallen). */
export function createLinkCode(userId: number): string {
  const db = getDb();
  db.prepare("DELETE FROM notify_links WHERE user_id = ?").run(userId);
  const code = randomUUID().replace(/-/g, "").slice(0, 16);
  db.prepare("INSERT INTO notify_links (code, user_id, created_at) VALUES (?, ?, ?)").run(
    code,
    userId,
    new Date().toISOString(),
  );
  return code;
}

/**
 * Code einlösen: Chat als Empfänger eintragen. Gibt den Nutzer zurück, zu dem
 * der Code gehörte, oder null bei unbekanntem/abgelaufenem Code.
 */
export function consumeLinkCode(code: string, chatId: string, label?: string): number | null {
  const db = getDb();
  const row = db.prepare("SELECT user_id FROM notify_links WHERE code = ?").get(code) as
    | { user_id: number }
    | undefined;
  if (!row) return null;
  db.prepare("DELETE FROM notify_links WHERE code = ?").run(code);
  // Pro Person nur ein Chat, und ein Chat gehört nur einer Person.
  db.prepare("DELETE FROM notify_targets WHERE user_id = ? OR chat_id = ?").run(row.user_id, chatId);
  db.prepare(
    "INSERT INTO notify_targets (user_id, chat_id, label, created_at) VALUES (?, ?, ?, ?)",
  ).run(row.user_id, chatId, label ?? null, new Date().toISOString());
  return row.user_id;
}

/** Codes, die niemand eingelöst hat, nach 24 h wegräumen. */
export function purgeStaleLinks(): number {
  const grenze = new Date(Date.now() - 24 * 3600_000).toISOString();
  return getDb().prepare("DELETE FROM notify_links WHERE created_at < ?").run(grenze).changes;
}

// ---------------- Versand ----------------

/**
 * Alle eingetragenen Empfänger benachrichtigen. Wirft nie und wartet nicht auf
 * den Erfolg des Aufrufers — gibt zurück, an wie viele Chats es rausging.
 */
export async function notifyAll(html: string): Promise<number> {
  const targets = listTargets();
  if (!targets.length) return 0;
  const results = await Promise.all(targets.map((t) => sendTelegram(t.chatId, html)));
  return results.filter(Boolean).length;
}

/** Fire-and-forget-Variante für Codepfade, die nicht warten dürfen (z.B. Login). */
export function notifyAllDetached(html: string): void {
  void notifyAll(html).catch((e) =>
    console.error("Benachrichtigung fehlgeschlagen:", (e as Error).message),
  );
}

export { escapeHtml };

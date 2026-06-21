// Haushalte = geteilter Geltungsbereich des Inventars. Jeder Nutzer hat genau einen
// Haushalt: anfangs persönlich (lazy angelegt), gemeinsam sobald weitere Mitglieder
// zugeordnet werden. Beitritt erfolgt direkt (ohne Bestätigung); der Altbestand des
// Beitretenden wird in den Ziel-Haushalt übernommen (gemerged, nicht umkehrbar).
import { getDb } from "../db.ts";
import { getUserByEmail, getUserById } from "../users.ts";

export interface Household {
  id: number;
  name: string;
  createdBy?: number;
}

export interface Member {
  id: number;
  name: string;
  email: string;
}

interface HouseholdRow {
  id: number;
  name: string;
  created_by: number | null;
}

function rowToHousehold(row: HouseholdRow): Household {
  return { id: row.id, name: row.name, createdBy: row.created_by ?? undefined };
}

/**
 * Liefert die Haushalts-id des Nutzers; legt beim ersten Aufruf einen persönlichen
 * Haushalt an und verknüpft ihn. Basis aller anderen Inventar-Operationen.
 */
export function getHouseholdId(userId: number): number {
  const db = getDb();
  const row = db.prepare("SELECT household_id FROM users WHERE id = ?").get(userId) as
    | { household_id: number | null }
    | undefined;
  if (row?.household_id) return row.household_id;

  const user = getUserById(userId);
  const name = user?.name ? `Haushalt ${user.name}` : "Mein Haushalt";
  const info = db
    .prepare("INSERT INTO households (name, created_by, created_at) VALUES (?, ?, ?)")
    .run(name, userId, new Date().toISOString());
  const householdId = Number(info.lastInsertRowid);
  db.prepare("UPDATE users SET household_id = ? WHERE id = ?").run(householdId, userId);
  return householdId;
}

export function getHousehold(userId: number): Household {
  const id = getHouseholdId(userId);
  const row = getDb().prepare("SELECT * FROM households WHERE id = ?").get(id) as HouseholdRow;
  return rowToHousehold(row);
}

export function listMembers(householdId: number): Member[] {
  return getDb()
    .prepare(
      "SELECT id, name, email FROM users WHERE household_id = ? ORDER BY name COLLATE NOCASE, email",
    )
    .all(householdId)
    .map((r) => {
      const row = r as { id: number; name: string | null; email: string };
      return { id: row.id, name: row.name ?? row.email, email: row.email };
    });
}

/**
 * Registrierte, freigegebene Nutzer, die dem Haushalt hinzugefügt werden können
 * (nicht bereits Mitglied, nicht der Aufrufer, keine Bot-/Telegram-Konten).
 */
export function listAddableUsers(actorId: number): Member[] {
  const householdId = getHouseholdId(actorId);
  return getDb()
    .prepare(
      `SELECT id, name, email FROM users
        WHERE status = 'approved'
          AND id != ?
          AND (household_id IS NULL OR household_id != ?)
          AND email NOT LIKE '%@bot.local'
        ORDER BY name COLLATE NOCASE, email`,
    )
    .all(actorId, householdId)
    .map((r) => {
      const row = r as { id: number; name: string | null; email: string };
      return { id: row.id, name: row.name ?? row.email, email: row.email };
    });
}

export function renameHousehold(userId: number, name: string): void {
  const clean = name.trim();
  if (!clean) return;
  getDb().prepare("UPDATE households SET name = ? WHERE id = ?").run(clean, getHouseholdId(userId));
}

/** Übernimmt alle Inventardaten von `fromId` in `toId` (Dubletten via UNIQUE übersprungen). */
function mergeHouseholds(db: ReturnType<typeof getDb>, fromId: number, toId: number): void {
  db.prepare(
    `INSERT INTO inventory_items
       (household_id, name, normalized, quantity, location, group_name, updated_by, created_at, updated_at)
     SELECT ?, name, normalized, quantity, location, group_name, updated_by, created_at, updated_at
       FROM inventory_items WHERE household_id = ?
     ON CONFLICT(household_id, location, normalized) DO NOTHING`,
  ).run(toId, fromId);
  db.prepare(
    `INSERT INTO inventory_templates
       (household_id, name, normalized, group_name, default_location, created_at)
     SELECT ?, name, normalized, group_name, default_location, created_at
       FROM inventory_templates WHERE household_id = ?
     ON CONFLICT(household_id, normalized) DO NOTHING`,
  ).run(toId, fromId);
  db.prepare(
    `INSERT INTO inventory_groups (household_id, name, sort, created_at)
     SELECT ?, name, sort, created_at FROM inventory_groups WHERE household_id = ?
     ON CONFLICT(household_id, name) DO NOTHING`,
  ).run(toId, fromId);
  db.prepare(
    `INSERT INTO inventory_group_memory (household_id, normalized, group_name, updated_at)
     SELECT ?, normalized, group_name, updated_at FROM inventory_group_memory WHERE household_id = ?
     ON CONFLICT(household_id, normalized) DO NOTHING`,
  ).run(toId, fromId);
}

/** Löscht alle Inventardaten eines Haushalts (für Merge-Quelle / letztes Mitglied). */
function purgeHouseholdData(db: ReturnType<typeof getDb>, householdId: number): void {
  db.prepare("DELETE FROM inventory_items WHERE household_id = ?").run(householdId);
  db.prepare("DELETE FROM inventory_templates WHERE household_id = ?").run(householdId);
  db.prepare("DELETE FROM inventory_groups WHERE household_id = ?").run(householdId);
  db.prepare("DELETE FROM inventory_group_memory WHERE household_id = ?").run(householdId);
  db.prepare("DELETE FROM households WHERE id = ?").run(householdId);
}

/**
 * Ordnet den Nutzer mit `email` dem Haushalt von `actorId` zu (direkt, ohne Bestätigung).
 * Der bisherige (persönliche) Bestand des Beitretenden wird übernommen. Wirft mit klarer
 * Meldung, wenn die E-Mail unbekannt/nicht freigegeben ist.
 */
export function addMember(actorId: number, email: string): Member {
  const db = getDb();
  const targetHousehold = getHouseholdId(actorId);
  const invitee = getUserByEmail(email.trim());
  if (!invitee) throw new Error("Kein registrierter Nutzer mit dieser E-Mail gefunden.");
  if (invitee.status !== "approved") {
    throw new Error("Dieser Nutzer ist noch nicht freigegeben.");
  }
  if (invitee.id === actorId) throw new Error("Du bist bereits Mitglied dieses Haushalts.");

  const sourceHousehold = getHouseholdId(invitee.id); // lazy: stellt sicher, dass einer existiert
  if (sourceHousehold === targetHousehold) {
    throw new Error("Dieser Nutzer ist bereits in deinem Haushalt.");
  }

  const tx = db.transaction(() => {
    mergeHouseholds(db, sourceHousehold, targetHousehold);
    db.prepare("UPDATE users SET household_id = ? WHERE id = ?").run(targetHousehold, invitee.id);
    // War der Quell-Haushalt nur persönlich (keine weiteren Mitglieder) → aufräumen.
    const remaining = db
      .prepare("SELECT COUNT(*) AS n FROM users WHERE household_id = ?")
      .get(sourceHousehold) as { n: number };
    if (remaining.n === 0) purgeHouseholdData(db, sourceHousehold);
  });
  tx();
  return { id: invitee.id, name: invitee.name ?? invitee.email, email: invitee.email };
}

/** Löst die Mitgliedschaft eines Nutzers (household_id = NULL); räumt leeren Haushalt ab. */
export function leaveHousehold(userId: number): void {
  const db = getDb();
  const row = db.prepare("SELECT household_id FROM users WHERE id = ?").get(userId) as
    | { household_id: number | null }
    | undefined;
  const householdId = row?.household_id;
  if (!householdId) return;
  const tx = db.transaction(() => {
    db.prepare("UPDATE users SET household_id = NULL WHERE id = ?").run(userId);
    const remaining = db
      .prepare("SELECT COUNT(*) AS n FROM users WHERE household_id = ?")
      .get(householdId) as { n: number };
    if (remaining.n === 0) purgeHouseholdData(db, householdId);
  });
  tx();
}

/**
 * Entfernt ein anderes Mitglied aus dem Haushalt. Nur der Ersteller (created_by) darf das;
 * sich selbst verlassen geht über leaveHousehold.
 */
export function removeMember(actorId: number, userId: number): void {
  if (actorId === userId) {
    leaveHousehold(userId);
    return;
  }
  const household = getHousehold(actorId);
  if (household.createdBy !== actorId) {
    throw new Error("Nur die Person, die den Haushalt erstellt hat, darf Mitglieder entfernen.");
  }
  if (!getUserById(userId)) throw new Error("Nutzer nicht gefunden.");
  const db = getDb();
  const row = db.prepare("SELECT household_id FROM users WHERE id = ?").get(userId) as
    | { household_id: number | null }
    | undefined;
  if (row?.household_id !== household.id) throw new Error("Nutzer ist nicht in deinem Haushalt.");
  leaveHousehold(userId);
}

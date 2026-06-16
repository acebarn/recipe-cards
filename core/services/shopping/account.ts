// Pro-Nutzer verknüpftes Bring!-Konto: Verknüpfen (mit Probe-Login), Liste wählen, lösen.
// Das Bring-Passwort liegt nur verschlüsselt in SQLite (siehe crypto.ts).
import { getDb } from "../db.ts";
import { decryptSecret, encryptSecret } from "./crypto.ts";
import { BringProvider, loadBringLists, type ShoppingList } from "./bring.ts";

export interface BringAccount {
  userId: number;
  email: string;
  listUuid?: string;
  listName?: string;
}

interface AccountRow {
  user_id: number;
  email: string;
  secret: string;
  list_uuid: string | null;
  list_name: string | null;
}

function rowToAccount(row: AccountRow): BringAccount {
  return {
    userId: row.user_id,
    email: row.email,
    listUuid: row.list_uuid ?? undefined,
    listName: row.list_name ?? undefined,
  };
}

function getRow(userId: number): AccountRow | undefined {
  return getDb().prepare("SELECT * FROM bring_accounts WHERE user_id = ?").get(userId) as
    | AccountRow
    | undefined;
}

/** Konto-Metadaten (ohne Geheimnis) oder null, wenn nicht verknüpft. */
export function getBringAccount(userId: number): BringAccount | null {
  const row = getRow(userId);
  return row ? rowToAccount(row) : null;
}

/**
 * Verknüpft ein Bring-Konto: validiert die Credentials per Probe-Login (loadBringLists),
 * speichert das verschlüsselte Passwort und liefert die wählbaren Listen zurück.
 * Wirft mit klarer Meldung, wenn der Login fehlschlägt.
 */
export async function linkBringAccount(
  userId: number,
  email: string,
  password: string,
): Promise<ShoppingList[]> {
  let lists: ShoppingList[];
  try {
    lists = await loadBringLists(email, password);
  } catch (e) {
    const msg = (e as Error).message;
    // Nur auf Credentials hinweisen, wenn Bring erreichbar war (sonst Netzwerk/Server).
    throw new Error(
      msg.includes("nicht erreichbar")
        ? msg
        : `Bring-Login fehlgeschlagen – E-Mail/Passwort prüfen. (${msg})`,
    );
  }

  const now = new Date().toISOString();
  const secret = encryptSecret(password);
  // Bei Re-Link bestehende Listenwahl beibehalten, sofern sie noch existiert.
  const existing = getRow(userId);
  const keepUuid = existing?.list_uuid && lists.some((l) => l.listUuid === existing.list_uuid)
    ? existing.list_uuid
    : null;
  const keepName = keepUuid ? (existing?.list_name ?? null) : null;

  getDb()
    .prepare(
      `INSERT INTO bring_accounts (user_id, email, secret, list_uuid, list_name, created_at, updated_at)
       VALUES (@user_id, @email, @secret, @list_uuid, @list_name, @now, @now)
       ON CONFLICT(user_id) DO UPDATE SET
         email = @email, secret = @secret, list_uuid = @list_uuid,
         list_name = @list_name, updated_at = @now`,
    )
    .run({
      user_id: userId,
      email,
      secret,
      list_uuid: keepUuid,
      list_name: keepName,
      now,
    });

  return lists;
}

/** Setzt die aktive Bring-Liste des Nutzers. */
export function setBringList(userId: number, listUuid: string, listName: string): void {
  getDb()
    .prepare(
      "UPDATE bring_accounts SET list_uuid = ?, list_name = ?, updated_at = ? WHERE user_id = ?",
    )
    .run(listUuid, listName, new Date().toISOString(), userId);
}

/** Löst die Verknüpfung (Credentials werden gelöscht). */
export function unlinkBringAccount(userId: number): void {
  getDb().prepare("DELETE FROM bring_accounts WHERE user_id = ?").run(userId);
}

/** Verfügbare Listen erneut von Bring laden (für die Auswahl). */
export async function listBringLists(userId: number): Promise<ShoppingList[]> {
  const row = getRow(userId);
  if (!row) throw new Error("Kein Bring-Konto verknüpft.");
  return loadBringLists(row.email, decryptSecret(row.secret));
}

/**
 * Liefert einen an die gewählte Liste gebundenen Provider – oder null, wenn das Konto
 * nicht verknüpft ist oder noch keine Liste gewählt wurde.
 */
export function getBringProvider(userId: number): BringProvider | null {
  const row = getRow(userId);
  if (!row || !row.list_uuid) return null;
  return new BringProvider(row.email, decryptSecret(row.secret), row.list_uuid);
}

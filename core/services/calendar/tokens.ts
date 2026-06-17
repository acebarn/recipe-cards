// Google-OAuth-Tokens je Nutzer. Refresh-Token liegt verschlüsselt at rest
// (AES-256-GCM, siehe shopping/crypto.ts); access_token wird gecacht.
import { getDb } from "../db.ts";
import { decryptSecret, encryptSecret } from "../shopping/crypto.ts";

export interface GoogleToken {
  refreshToken: string;
  accessToken: string | null;
  expiresAt: string | null; // ISO
  scope: string | null;
}

interface TokenRow {
  refresh_token: string;
  access_token: string | null;
  expires_at: string | null;
  scope: string | null;
}

/** Entschlüsseltes Token-Bündel oder null, wenn der Nutzer (noch) keinen Kalender verbunden hat. */
export function getGoogleToken(userId: number): GoogleToken | null {
  const row = getDb()
    .prepare("SELECT refresh_token, access_token, expires_at, scope FROM google_tokens WHERE user_id = ?")
    .get(userId) as TokenRow | undefined;
  if (!row) return null;
  return {
    refreshToken: decryptSecret(row.refresh_token),
    accessToken: row.access_token,
    expiresAt: row.expires_at,
    scope: row.scope,
  };
}

export function hasGoogleToken(userId: number): boolean {
  return !!getDb().prepare("SELECT 1 FROM google_tokens WHERE user_id = ?").get(userId);
}

/**
 * Speichert die Tokens aus dem OAuth-Login. Ein leeres refreshToken (Google liefert es
 * nur beim ersten Consent bzw. mit prompt=consent) überschreibt ein vorhandenes NICHT.
 */
export function saveGoogleToken(
  userId: number,
  t: { refreshToken?: string | null; accessToken?: string | null; expiresAt?: string | null; scope?: string | null },
): void {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT refresh_token FROM google_tokens WHERE user_id = ?").get(userId) as
    | { refresh_token: string }
    | undefined;

  const encRefresh = t.refreshToken ? encryptSecret(t.refreshToken) : existing?.refresh_token;
  if (!encRefresh) return; // kein Refresh-Token vorhanden und keins gespeichert → nichts zu tun

  db.prepare(
    `INSERT INTO google_tokens (user_id, refresh_token, access_token, expires_at, scope, updated_at)
     VALUES (@user_id, @refresh_token, @access_token, @expires_at, @scope, @now)
     ON CONFLICT(user_id) DO UPDATE SET
       refresh_token = @refresh_token, access_token = @access_token,
       expires_at = @expires_at, scope = @scope, updated_at = @now`,
  ).run({
    user_id: userId,
    refresh_token: encRefresh,
    access_token: t.accessToken ?? null,
    expires_at: t.expiresAt ?? null,
    scope: t.scope ?? null,
    now,
  });
}

/** Aktualisiert nur access_token + Ablauf (nach einem Refresh-Grant). */
export function updateAccessToken(userId: number, accessToken: string, expiresAt: string): void {
  getDb()
    .prepare("UPDATE google_tokens SET access_token = ?, expires_at = ?, updated_at = ? WHERE user_id = ?")
    .run(accessToken, expiresAt, new Date().toISOString(), userId);
}

export function deleteGoogleToken(userId: number): void {
  getDb().prepare("DELETE FROM google_tokens WHERE user_id = ?").run(userId);
}

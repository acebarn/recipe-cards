// Verschlüsselung der Bring!-Passwörter at rest (AES-256-GCM).
// Der Schlüssel wird per scrypt aus AUTH_SECRET abgeleitet – derselbe Secret, mit dem
// Auth.js die Sessions signiert. Hinweis: Rotiert AUTH_SECRET, sind bereits gespeicherte
// Bring-Passwörter nicht mehr entschlüsselbar → die Nutzer müssen ihr Konto neu verknüpfen.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const SALT = "schmackofatz.bring";
let _key: Buffer | null = null;

function key(): Buffer {
  if (_key) return _key;
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("AUTH_SECRET ist nicht gesetzt – Bring-Verknüpfung nicht möglich.");
  }
  _key = scryptSync(secret, SALT, 32);
  return _key;
}

/** Verschlüsselt Klartext → "base64(iv).base64(tag).base64(ciphertext)". */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

/** Entschlüsselt einen mit encryptSecret erzeugten String. Wirft bei falschem Key/Format. */
export function decryptSecret(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Ungültiges Secret-Format.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

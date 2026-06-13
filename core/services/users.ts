// Nutzerverwaltung (Google-OAuth-Allowlist + Owner/Mitglieder).
// Basis-Operationen; die UI/Approval-Flows folgen mit dem Auth-Layer (M1).
import { getDb } from "./db.ts";

export type UserRole = "owner" | "member";
export type UserStatus = "invited" | "approved" | "blocked";

export interface User {
  id: number;
  googleSub?: string;
  email: string;
  name?: string;
  picture?: string;
  role: UserRole;
  status: UserStatus;
  telegramId?: string;
  invitedBy?: number;
  createdAt: string;
  lastLoginAt?: string;
}

interface UserRow {
  id: number;
  google_sub: string | null;
  email: string;
  name: string | null;
  picture: string | null;
  role: string;
  status: string;
  telegram_id: string | null;
  invited_by: number | null;
  created_at: string;
  last_login_at: string | null;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    googleSub: row.google_sub ?? undefined,
    email: row.email,
    name: row.name ?? undefined,
    picture: row.picture ?? undefined,
    role: row.role as UserRole,
    status: row.status as UserStatus,
    telegramId: row.telegram_id ?? undefined,
    invitedBy: row.invited_by ?? undefined,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? undefined,
  };
}

export interface CreateUserInput {
  email: string;
  name?: string;
  picture?: string;
  role?: UserRole;
  status?: UserStatus;
  googleSub?: string;
  telegramId?: string;
  invitedBy?: number;
}

export function createUser(input: CreateUserInput): User {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO users (google_sub, email, name, picture, role, status, telegram_id, invited_by, created_at)
       VALUES (@google_sub, @email, @name, @picture, @role, @status, @telegram_id, @invited_by, @created_at)`,
    )
    .run({
      google_sub: input.googleSub ?? null,
      email: input.email.toLowerCase(),
      name: input.name ?? null,
      picture: input.picture ?? null,
      role: input.role ?? "member",
      status: input.status ?? "invited",
      telegram_id: input.telegramId ?? null,
      invited_by: input.invitedBy ?? null,
      created_at: new Date().toISOString(),
    });
  return getUserById(Number(info.lastInsertRowid))!;
}

export function getUserById(id: number): User | null {
  const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  return row ? rowToUser(row) : null;
}

export function getUserByEmail(email: string): User | null {
  const row = getDb()
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.toLowerCase()) as UserRow | undefined;
  return row ? rowToUser(row) : null;
}

export function getUserByGoogleSub(sub: string): User | null {
  const row = getDb().prepare("SELECT * FROM users WHERE google_sub = ?").get(sub) as
    | UserRow
    | undefined;
  return row ? rowToUser(row) : null;
}

/** Stellt den Owner sicher (anlegen, falls nicht vorhanden) – für Seed/Bootstrap. */
export function ensureOwner(email: string, name?: string): User {
  const existing = getUserByEmail(email);
  if (existing) return existing;
  return createUser({ email, name, role: "owner", status: "approved" });
}

export interface LoginProfile {
  email: string;
  googleSub?: string;
  name?: string;
  picture?: string;
}

/**
 * Verbucht einen Google-Login: legt unbekannte E-Mails als `invited` an,
 * verknüpft beim ersten Mal die google_sub, aktualisiert Name/Bild + last_login.
 * Owner muss vorab via ensureOwner/Seed existieren (wird dann nur aktualisiert).
 */
export function recordLogin(profile: LoginProfile): User {
  const db = getDb();
  const email = profile.email.toLowerCase();
  let user = getUserByEmail(email);
  if (!user) {
    user = createUser({
      email,
      name: profile.name,
      picture: profile.picture,
      googleSub: profile.googleSub,
      status: "invited",
    });
  }
  db.prepare(
    `UPDATE users SET
       google_sub = COALESCE(google_sub, @google_sub),
       name = COALESCE(@name, name),
       picture = COALESCE(@picture, picture),
       last_login_at = @now
     WHERE id = @id`,
  ).run({
    google_sub: profile.googleSub ?? null,
    name: profile.name ?? null,
    picture: profile.picture ?? null,
    now: new Date().toISOString(),
    id: user.id,
  });
  return getUserById(user.id)!;
}

export function listUsers(): User[] {
  const rows = getDb()
    .prepare("SELECT * FROM users ORDER BY role = 'owner' DESC, created_at")
    .all() as UserRow[];
  return rows.map(rowToUser);
}

export function setUserStatus(id: number, status: UserStatus): void {
  getDb().prepare("UPDATE users SET status = ? WHERE id = ?").run(status, id);
}

export function setUserRole(id: number, role: UserRole): void {
  getDb().prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
}

/** Owner lädt eine E-Mail ein = Vorabfreigabe (status approved, google_sub folgt beim Login). */
export function inviteUser(email: string, invitedBy?: number): User {
  const existing = getUserByEmail(email);
  if (existing) {
    if (existing.status !== "approved") setUserStatus(existing.id, "approved");
    return getUserById(existing.id)!;
  }
  return createUser({ email, role: "member", status: "approved", invitedBy });
}

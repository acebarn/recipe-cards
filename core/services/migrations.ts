// Schema-Migrationen als eingebettete SQL-Strings.
// Bewusst KEIN Dateisystem-Lesen: db.ts wird sowohl im gebündelten SvelteKit-
// Server (Vite kopiert keine losen .sql-Dateien) als auch in der plain-Node-CLI
// genutzt. Eingebettete Strings funktionieren in beiden Umgebungen.
//
// Neue Migration: Eintrag mit nächster id (002_..., 003_...) am Ende anhängen.
// Bereits angewandte ids werden in schema_migrations vermerkt und übersprungen.

export interface Migration {
  id: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    id: "001_init",
    sql: `
-- Nutzer / Auth
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  google_sub    TEXT UNIQUE,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  picture       TEXT,
  role          TEXT NOT NULL DEFAULT 'member',    -- 'owner' | 'member'
  status        TEXT NOT NULL DEFAULT 'invited',   -- 'invited' | 'approved' | 'blocked'
  telegram_id   TEXT UNIQUE,
  invited_by    INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL,
  last_login_at TEXT
);

-- Bilder
CREATE TABLE images (
  id           INTEGER PRIMARY KEY,
  recipe_slug  TEXT NOT NULL,
  filename     TEXT NOT NULL,
  mime         TEXT,
  source       TEXT,
  drive_synced INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_images_slug ON images(recipe_slug);

-- Rezepte (ingredients/steps/notes als JSON; markdown_body für Drive-Round-Trip)
CREATE TABLE recipes (
  id                    INTEGER PRIMARY KEY,
  slug                  TEXT NOT NULL,
  title                 TEXT NOT NULL,
  category              TEXT,
  category_dir          TEXT,
  grouping              TEXT,
  difficulty            TEXT,
  servings              REAL,
  prep_time             TEXT,
  cook_time             TEXT,
  rest_time             TEXT,
  theme_color           TEXT,
  image_subject         TEXT,
  image_prompt          TEXT,
  tags_json             TEXT NOT NULL DEFAULT '[]',
  equipment_json        TEXT NOT NULL DEFAULT '[]',
  source_url_json       TEXT NOT NULL DEFAULT '[]',
  ingredients_json      TEXT NOT NULL DEFAULT '[]',
  steps_json            TEXT NOT NULL DEFAULT '[]',
  step_ingredients_json TEXT,
  notes_json            TEXT NOT NULL DEFAULT '[]',
  markdown_body         TEXT NOT NULL,
  image_id              INTEGER REFERENCES images(id),
  search_blob           TEXT NOT NULL DEFAULT '',
  created_by            INTEGER REFERENCES users(id),
  updated_by            INTEGER REFERENCES users(id),
  created_at            TEXT NOT NULL,
  last_modified         TEXT NOT NULL,
  deleted_at            TEXT
);
CREATE UNIQUE INDEX idx_recipes_slug ON recipes(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_recipes_category ON recipes(category) WHERE deleted_at IS NULL;
CREATE INDEX idx_recipes_deleted ON recipes(deleted_at);

-- Volltextsuche (FTS5), aus library.ts synchron gehalten (rowid == recipes.id)
CREATE VIRTUAL TABLE recipes_fts USING fts5(search, tokenize = 'unicode61');

-- Sessions
CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- Drive-Sync-Queue (Pfade festgehalten, damit Delete nach Row-Purge möglich ist)
CREATE TABLE sync_queue (
  id           INTEGER PRIMARY KEY,
  recipe_slug  TEXT NOT NULL,
  op           TEXT NOT NULL,                       -- 'upsert' | 'delete'
  category_dir TEXT,
  payload_md   TEXT,
  pdf_path     TEXT,
  image_path   TEXT,
  attempts     INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending',     -- 'pending' | 'done' | 'error'
  created_at   TEXT NOT NULL,
  processed_at TEXT
);
CREATE INDEX idx_sync_pending ON sync_queue(status);

-- Audit
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER,
  action      TEXT,
  recipe_slug TEXT,
  at          TEXT NOT NULL
);
`,
  },
  {
    id: "002_recipe_region",
    sql: `ALTER TABLE recipes ADD COLUMN region TEXT;`,
  },
  {
    id: "003_shopping",
    sql: `
-- Pro-Nutzer verknüpftes Bring!-Konto (Passwort verschlüsselt, nie im Klartext).
CREATE TABLE bring_accounts (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id),
  email      TEXT NOT NULL,            -- Bring-Login-E-Mail
  secret     TEXT NOT NULL,            -- verschlüsseltes Passwort (AES-256-GCM)
  list_uuid  TEXT,                     -- gewählte Bring-Liste
  list_name  TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Standardzutaten je Nutzer (z. B. Salz) – werden beim "Auf die Liste" weggelassen.
CREATE TABLE standard_ingredients (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  name       TEXT NOT NULL,
  normalized TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, normalized)
);
CREATE INDEX idx_standard_user ON standard_ingredients(user_id);
`,
  },
  {
    id: "004_calendar",
    sql: `
-- Google-OAuth-Tokens je Nutzer (Refresh-Token verschlüsselt, nie im Klartext).
CREATE TABLE google_tokens (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id),
  refresh_token TEXT NOT NULL,           -- verschlüsselt (AES-256-GCM)
  access_token  TEXT,                     -- gecacht
  expires_at    TEXT,                     -- ISO, Ablauf des access_token
  scope         TEXT,
  updated_at    TEXT NOT NULL
);

-- Kalender-Einstellungen je Nutzer (gewählter Kalender + übliche Mahlzeit-Zeiten).
CREATE TABLE calendar_settings (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id),
  calendar_id    TEXT,
  calendar_name  TEXT,
  tz             TEXT NOT NULL DEFAULT 'Europe/Berlin',
  breakfast_time TEXT NOT NULL DEFAULT '08:00',
  lunch_time     TEXT NOT NULL DEFAULT '12:30',
  dinner_time    TEXT NOT NULL DEFAULT '18:30',
  snack_time     TEXT NOT NULL DEFAULT '15:30',
  marker_minutes INTEGER NOT NULL DEFAULT 15,
  updated_at     TEXT NOT NULL
);
`,
  },
  {
    id: "005_calendar_allday",
    sql: `
ALTER TABLE calendar_settings ADD COLUMN breakfast_allday INTEGER NOT NULL DEFAULT 0;
ALTER TABLE calendar_settings ADD COLUMN lunch_allday     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE calendar_settings ADD COLUMN dinner_allday    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE calendar_settings ADD COLUMN snack_allday     INTEGER NOT NULL DEFAULT 0;
`,
  },
  {
    id: "006_inventory",
    sql: `
-- Geteilter Geltungsbereich fürs Inventar. Jeder Nutzer hat genau einen Haushalt
-- (persönlich, lazy angelegt); ein gemeinsamer Haushalt entsteht durch Zuordnung
-- weiterer Mitglieder.
CREATE TABLE households (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
ALTER TABLE users ADD COLUMN household_id INTEGER REFERENCES households(id);
ALTER TABLE users ADD COLUMN inventory_enabled INTEGER NOT NULL DEFAULT 1;

-- Inventar-Posten je Haushalt (Bereich: Tiefkühl/Vorrat; Menge frei als Text).
CREATE TABLE inventory_items (
  id           INTEGER PRIMARY KEY,
  household_id INTEGER NOT NULL REFERENCES households(id),
  name         TEXT NOT NULL,
  normalized   TEXT NOT NULL,
  quantity     TEXT,
  location     TEXT NOT NULL DEFAULT 'pantry',   -- 'pantry' | 'freezer'
  group_name   TEXT,
  updated_by   INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE(household_id, location, normalized)
);
CREATE INDEX idx_inventory_household ON inventory_items(household_id);

-- Vorlagen ("Standardartikel") zum schnellen Anlegen wiederkehrender Posten.
CREATE TABLE inventory_templates (
  id               INTEGER PRIMARY KEY,
  household_id     INTEGER NOT NULL REFERENCES households(id),
  name             TEXT NOT NULL,
  normalized       TEXT NOT NULL,
  group_name       TEXT,
  default_location TEXT NOT NULL DEFAULT 'pantry',
  created_at       TEXT NOT NULL,
  UNIQUE(household_id, normalized)
);

-- Gruppen je Haushalt (Vorschläge + eigene).
CREATE TABLE inventory_groups (
  id           INTEGER PRIMARY KEY,
  household_id INTEGER NOT NULL REFERENCES households(id),
  name         TEXT NOT NULL,
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  UNIQUE(household_id, name)
);

-- Gemerkte Gruppenzuordnung je Artikelname (normalisiert), je Haushalt.
CREATE TABLE inventory_group_memory (
  household_id INTEGER NOT NULL REFERENCES households(id),
  normalized   TEXT NOT NULL,
  group_name   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (household_id, normalized)
);
`,
  },
  {
    id: "007_inventory_amount",
    sql: `
-- Numerische Menge (für +/- Spinner) + "wenig"-Markierung je Posten.
ALTER TABLE inventory_items ADD COLUMN amount INTEGER NOT NULL DEFAULT 1;
ALTER TABLE inventory_items ADD COLUMN low INTEGER NOT NULL DEFAULT 0;
-- Bestehende Textmengen, die mit einer Zahl beginnen, best effort übernehmen.
UPDATE inventory_items SET amount = CAST(quantity AS INTEGER)
  WHERE quantity GLOB '[0-9]*' AND CAST(quantity AS INTEGER) > 0;
`,
  },
];

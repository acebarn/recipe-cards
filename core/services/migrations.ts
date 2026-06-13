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
];

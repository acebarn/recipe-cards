-- Initiales Schema der Rezeptbibliothek.
-- SQLite = Quelle der Wahrheit; Google Drive ist nur Backup-Mirror.

-- ---------------- Nutzer / Auth ----------------
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  google_sub    TEXT UNIQUE,                       -- null bis zum ersten Google-Login
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  picture       TEXT,
  role          TEXT NOT NULL DEFAULT 'member',    -- 'owner' | 'member'
  status        TEXT NOT NULL DEFAULT 'invited',   -- 'invited' | 'approved' | 'blocked'
  telegram_id   TEXT UNIQUE,                       -- Mapping für den Telegram-Bot
  invited_by    INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL,
  last_login_at TEXT
);

-- ---------------- Bilder ----------------
CREATE TABLE images (
  id           INTEGER PRIMARY KEY,
  recipe_slug  TEXT NOT NULL,
  filename     TEXT NOT NULL,                      -- <slug>.<ext> auf dem Bild-Volume
  mime         TEXT,
  source       TEXT,                               -- 'pixazo' | 'upload' | 'imported'
  drive_synced INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_images_slug ON images(recipe_slug);

-- ---------------- Rezepte ----------------
-- ingredients/steps/notes als JSON-Spalten (Dokument-Charakter); markdown_body
-- für verlustfreien Drive-Round-Trip; search_blob denormalisiert für FTS/LIKE.
CREATE TABLE recipes (
  id                    INTEGER PRIMARY KEY,
  slug                  TEXT NOT NULL,
  title                 TEXT NOT NULL,
  category              TEXT,                       -- normalisiertes Schlagwort, z.B. "backen"
  category_dir          TEXT,                       -- Original-Ordner, z.B. "3 backen" (Drive-Pfad)
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
  ingredients_json      TEXT NOT NULL DEFAULT '[]', -- IngredientSection[]
  steps_json            TEXT NOT NULL DEFAULT '[]', -- string[]
  step_ingredients_json TEXT,                       -- nullable: Schritt->Zutat-Indizes (M3)
  notes_json            TEXT NOT NULL DEFAULT '[]', -- string[]
  markdown_body         TEXT NOT NULL,              -- verbatim md (Frontmatter + Body)
  image_id              INTEGER REFERENCES images(id),
  search_blob           TEXT NOT NULL DEFAULT '',
  created_by            INTEGER REFERENCES users(id),
  updated_by            INTEGER REFERENCES users(id),
  created_at            TEXT NOT NULL,
  last_modified         TEXT NOT NULL,
  deleted_at            TEXT                        -- Soft-Delete; Sync-Worker löscht in Drive, dann Purge
);
CREATE UNIQUE INDEX idx_recipes_slug ON recipes(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_recipes_category ON recipes(category) WHERE deleted_at IS NULL;
CREATE INDEX idx_recipes_deleted ON recipes(deleted_at);

-- Volltextsuche (FTS5). Wird aus library.ts heraus synchron gehalten
-- (rowid == recipes.id). unicode61-Tokenizer ist deutschfreundlich.
CREATE VIRTUAL TABLE recipes_fts USING fts5(search, tokenize = 'unicode61');

-- ---------------- Sessions ----------------
CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- ---------------- Drive-Sync-Queue ----------------
-- Hält Pfade fest (category_dir/slug), damit Deletes auch nach Row-Purge möglich sind.
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

-- ---------------- Audit ----------------
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER,
  action      TEXT,
  recipe_slug TEXT,
  at          TEXT NOT NULL
);

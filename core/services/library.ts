// Bibliotheks-CRUD über das Recipe-Modell auf SQLite.
// Hält die FTS5-Tabelle (recipes_fts) synchron und denormalisiert search_blob.
import { prettyCategory, prettyDifficulty } from "../category.ts";
import { flattenIngredients } from "../ingredients.ts";
import type { IngredientSection, Recipe, RecipeMeta } from "../model.ts";
import { totalMinutes } from "../time.ts";
import { getDb } from "./db.ts";

export interface StoredRecipe {
  id: number;
  slug: string;
  categoryDir?: string;
  meta: RecipeMeta;
  ingredients: IngredientSection[];
  steps: string[];
  notes: string[];
  /** Optionale Schritt→Zutat-Index-Zuordnung (M3); sonst undefined. */
  stepIngredients?: number[][];
  markdownBody: string;
  imageFilename?: string;
  createdBy?: number;
  updatedBy?: number;
  createdAt: string;
  lastModified: string;
}

export interface RecipeInput {
  recipe: Recipe;
  markdownBody: string;
  slug: string;
  categoryDir?: string;
  createdBy?: number;
  stepIngredients?: number[][];
}

/** Denormalisierter, kleingeschriebener Suchtext über alle relevanten Felder. */
export function buildSearchBlob(
  meta: RecipeMeta,
  ingredients: IngredientSection[],
  steps: string[],
  notes: string[],
): string {
  const parts: string[] = [
    meta.title,
    prettyCategory(meta.category),
    ...(meta.tags ?? []),
    ...(meta.equipment ?? []),
    ...ingredients.flatMap((s) => [s.name ?? "", ...s.items]),
    ...steps,
    ...notes,
  ];
  return parts.join(" ").toLowerCase().trim();
}

// ---------------- Mapping Row <-> StoredRecipe ----------------

const SELECT_COLS = `
  r.id, r.slug, r.category_dir, r.title, r.category, r.grouping, r.difficulty, r.region,
  r.servings, r.prep_time, r.cook_time, r.rest_time, r.theme_color,
  r.image_subject, r.image_prompt, r.tags_json, r.equipment_json, r.source_url_json,
  r.ingredients_json, r.steps_json, r.step_ingredients_json, r.notes_json,
  r.markdown_body, r.created_by, r.updated_by, r.created_at, r.last_modified,
  (SELECT filename FROM images WHERE recipe_slug = r.slug ORDER BY id DESC LIMIT 1) AS image_filename`;

interface Row {
  id: number;
  slug: string;
  category_dir: string | null;
  title: string;
  category: string | null;
  grouping: string | null;
  difficulty: string | null;
  region: string | null;
  servings: number | null;
  prep_time: string | null;
  cook_time: string | null;
  rest_time: string | null;
  theme_color: string | null;
  image_subject: string | null;
  image_prompt: string | null;
  tags_json: string;
  equipment_json: string;
  source_url_json: string;
  ingredients_json: string;
  steps_json: string;
  step_ingredients_json: string | null;
  notes_json: string;
  markdown_body: string;
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  last_modified: string;
  image_filename: string | null;
}

function rowToStored(row: Row): StoredRecipe {
  const meta: RecipeMeta = {
    title: row.title,
    tags: JSON.parse(row.tags_json),
    category: row.category ?? undefined,
    grouping: row.grouping ?? undefined,
    prep_time: row.prep_time ?? undefined,
    cook_time: row.cook_time ?? undefined,
    rest_time: row.rest_time ?? undefined,
    servings: row.servings ?? undefined,
    equipment: JSON.parse(row.equipment_json),
    difficulty: row.difficulty ?? undefined,
    region: row.region ?? undefined,
    source_url: JSON.parse(row.source_url_json),
    last_modified: row.last_modified,
    theme_color: row.theme_color ?? undefined,
    image_subject: row.image_subject ?? undefined,
    image_prompt: row.image_prompt ?? undefined,
  };
  return {
    id: row.id,
    slug: row.slug,
    categoryDir: row.category_dir ?? undefined,
    meta,
    ingredients: JSON.parse(row.ingredients_json),
    steps: JSON.parse(row.steps_json),
    notes: JSON.parse(row.notes_json),
    stepIngredients: row.step_ingredients_json ? JSON.parse(row.step_ingredients_json) : undefined,
    markdownBody: row.markdown_body,
    imageFilename: row.image_filename ?? undefined,
    createdBy: row.created_by ?? undefined,
    updatedBy: row.updated_by ?? undefined,
    createdAt: row.created_at,
    lastModified: row.last_modified,
  };
}

/** StoredRecipe → Recipe (für Render/Export). */
export function toRecipe(s: StoredRecipe): Recipe {
  return {
    meta: s.meta,
    ingredients: s.ingredients,
    steps: s.steps,
    notes: s.notes,
    sourceFile: s.slug,
  };
}

// ---------------- FTS-Synchronisation ----------------

function syncFts(id: number, searchBlob: string): void {
  const db = getDb();
  db.prepare("DELETE FROM recipes_fts WHERE rowid = ?").run(id);
  db.prepare("INSERT INTO recipes_fts (rowid, search) VALUES (?, ?)").run(id, searchBlob);
}

// ---------------- Schreiben ----------------

function metaColumns(input: RecipeInput, searchBlob: string, now: string) {
  const m = input.recipe.meta;
  return {
    slug: input.slug,
    title: m.title,
    category: m.category ?? null,
    category_dir: input.categoryDir ?? null,
    grouping: m.grouping ?? null,
    difficulty: m.difficulty ?? null,
    region: m.region ?? null,
    servings: m.servings ?? null,
    prep_time: m.prep_time ?? null,
    cook_time: m.cook_time ?? null,
    rest_time: m.rest_time ?? null,
    theme_color: m.theme_color ?? null,
    image_subject: m.image_subject ?? null,
    image_prompt: m.image_prompt ?? null,
    tags_json: JSON.stringify(m.tags ?? []),
    equipment_json: JSON.stringify(m.equipment ?? []),
    source_url_json: JSON.stringify(m.source_url ?? []),
    ingredients_json: JSON.stringify(input.recipe.ingredients),
    steps_json: JSON.stringify(input.recipe.steps),
    step_ingredients_json: input.stepIngredients ? JSON.stringify(input.stepIngredients) : null,
    notes_json: JSON.stringify(input.recipe.notes),
    markdown_body: input.markdownBody,
    search_blob: searchBlob,
    last_modified: m.last_modified || now,
  };
}

/** Neues Rezept anlegen. Slug muss eindeutig sein (siehe uniqueSlug). */
export function insertRecipe(input: RecipeInput): StoredRecipe {
  const db = getDb();
  const now = new Date().toISOString();
  const blob = buildSearchBlob(
    input.recipe.meta,
    input.recipe.ingredients,
    input.recipe.steps,
    input.recipe.notes,
  );
  const cols = metaColumns(input, blob, now);
  const info = db
    .prepare(
      `INSERT INTO recipes (
        slug, title, category, category_dir, grouping, difficulty, region, servings,
        prep_time, cook_time, rest_time, theme_color, image_subject, image_prompt,
        tags_json, equipment_json, source_url_json, ingredients_json, steps_json,
        step_ingredients_json, notes_json, markdown_body, search_blob,
        created_by, updated_by, created_at, last_modified
      ) VALUES (
        @slug, @title, @category, @category_dir, @grouping, @difficulty, @region, @servings,
        @prep_time, @cook_time, @rest_time, @theme_color, @image_subject, @image_prompt,
        @tags_json, @equipment_json, @source_url_json, @ingredients_json, @steps_json,
        @step_ingredients_json, @notes_json, @markdown_body, @search_blob,
        @created_by, @created_by, @created_at, @last_modified
      )`,
    )
    .run({ ...cols, created_by: input.createdBy ?? null, created_at: now });
  const id = Number(info.lastInsertRowid);
  syncFts(id, blob);
  return getRecipeById(id)!;
}

/** Bestehendes Rezept (per slug) aktualisieren. */
export function updateRecipe(
  slug: string,
  input: Omit<RecipeInput, "slug" | "createdBy"> & { updatedBy?: number },
): StoredRecipe | null {
  const db = getDb();
  const existing = getRecipeBySlug(slug);
  if (!existing) return null;
  const now = new Date().toISOString();
  const blob = buildSearchBlob(
    input.recipe.meta,
    input.recipe.ingredients,
    input.recipe.steps,
    input.recipe.notes,
  );
  // categoryDir erhalten, wenn der Aufrufer keinen neuen angibt (sonst ginge der Drive-Pfad verloren).
  const categoryDir = input.categoryDir ?? existing.categoryDir;
  const cols = metaColumns({ ...input, slug, categoryDir }, blob, now);
  db.prepare(
    `UPDATE recipes SET
       title=@title, category=@category, category_dir=@category_dir, grouping=@grouping,
       difficulty=@difficulty, region=@region, servings=@servings, prep_time=@prep_time, cook_time=@cook_time,
       rest_time=@rest_time, theme_color=@theme_color, image_subject=@image_subject,
       image_prompt=@image_prompt, tags_json=@tags_json, equipment_json=@equipment_json,
       source_url_json=@source_url_json, ingredients_json=@ingredients_json, steps_json=@steps_json,
       step_ingredients_json=@step_ingredients_json, notes_json=@notes_json,
       markdown_body=@markdown_body, search_blob=@search_blob, updated_by=@updated_by,
       last_modified=@last_modified
     WHERE id=@id AND deleted_at IS NULL`,
  ).run({ ...cols, updated_by: input.updatedBy ?? null, id: existing.id });
  syncFts(existing.id, blob);
  return getRecipeById(existing.id);
}

/**
 * Idempotentes Anlegen/Aktualisieren per slug (für den Seed-Import). Existiert
 * ein aktives Rezept mit dem slug, wird es aktualisiert, sonst neu angelegt.
 */
export function upsertRecipeBySlug(input: RecipeInput): StoredRecipe {
  const existing = getRecipeBySlug(input.slug);
  if (existing) {
    return updateRecipe(input.slug, {
      recipe: input.recipe,
      markdownBody: input.markdownBody,
      categoryDir: input.categoryDir,
      stepIngredients: input.stepIngredients,
      updatedBy: input.createdBy,
    })!;
  }
  return insertRecipe(input);
}

export interface DeletedRecipeRef {
  slug: string;
  categoryDir?: string;
  imageFilename?: string;
}

/** Soft-Delete; gibt die für den Drive-Delete nötigen Pfade zurück. */
export function softDeleteRecipe(slug: string): DeletedRecipeRef | null {
  const db = getDb();
  const existing = getRecipeBySlug(slug);
  if (!existing) return null;
  db.prepare("UPDATE recipes SET deleted_at = ? WHERE id = ?").run(new Date().toISOString(), existing.id);
  db.prepare("DELETE FROM recipes_fts WHERE rowid = ?").run(existing.id);
  return { slug: existing.slug, categoryDir: existing.categoryDir, imageFilename: existing.imageFilename };
}

/** Endgültiges Entfernen einer soft-gelöschten Zeile (nach erfolgreichem Drive-Delete). */
export function purgeRecipe(slug: string): void {
  getDb().prepare("DELETE FROM recipes WHERE slug = ? AND deleted_at IS NOT NULL").run(slug);
}

/** Exakte Schritt→Zutat-Zuordnung setzen (M3); überschreibt die bisherige. */
export function setStepIngredients(slug: string, mapping: number[][]): void {
  getDb()
    .prepare("UPDATE recipes SET step_ingredients_json = ? WHERE slug = ? AND deleted_at IS NULL")
    .run(JSON.stringify(mapping), slug);
}

// ---------------- Bilder ----------------

/** Setzt das Bild eines Rezepts (ersetzt eine evtl. vorhandene Zuordnung – idempotent). */
export function setRecipeImage(
  slug: string,
  filename: string,
  opts: { mime?: string; source?: string } = {},
): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM images WHERE recipe_slug = ?").run(slug);
    db.prepare(
      "INSERT INTO images (recipe_slug, filename, mime, source, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(slug, filename, opts.mime ?? null, opts.source ?? null, new Date().toISOString());
  });
  tx();
}

// ---------------- Lesen / Suche ----------------

export function getRecipeById(id: number): StoredRecipe | null {
  const row = getDb()
    .prepare(`SELECT ${SELECT_COLS} FROM recipes r WHERE r.id = ? AND r.deleted_at IS NULL`)
    .get(id) as Row | undefined;
  return row ? rowToStored(row) : null;
}

export function getRecipeBySlug(slug: string): StoredRecipe | null {
  const row = getDb()
    .prepare(`SELECT ${SELECT_COLS} FROM recipes r WHERE r.slug = ? AND r.deleted_at IS NULL`)
    .get(slug) as Row | undefined;
  return row ? rowToStored(row) : null;
}

export function listRecipes(): StoredRecipe[] {
  const rows = getDb()
    .prepare(
      `SELECT ${SELECT_COLS} FROM recipes r WHERE r.deleted_at IS NULL
       ORDER BY COALESCE(r.category, ''), r.title COLLATE NOCASE`,
    )
    .all() as Row[];
  return rows.map(rowToStored);
}

/**
 * Passenden Drive-Ordner (category_dir) für eine Kategorie ableiten: bevorzugt den
 * eines bestehenden Rezepts derselben Kategorie (z.B. "3 backen"), sonst die
 * Kategorie selbst. Für neu angelegte Rezepte.
 */
export function categoryDirForCategory(category?: string): string | undefined {
  if (!category) return undefined;
  const row = getDb()
    .prepare(
      `SELECT category_dir FROM recipes
       WHERE category = ? AND category_dir IS NOT NULL AND deleted_at IS NULL
       ORDER BY id LIMIT 1`,
    )
    .get(category) as { category_dir: string } | undefined;
  return row?.category_dir ?? category;
}

/** Eindeutigen Slug finden (base, base-2, base-3, …) – nur aktive Rezepte zählen. */
export function uniqueSlug(base: string): string {
  const db = getDb();
  const taken = db.prepare("SELECT 1 FROM recipes WHERE slug = ? AND deleted_at IS NULL");
  if (!taken.get(base)) return base;
  let i = 2;
  while (taken.get(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

export interface RecipeIndexEntry {
  slug: string;
  title: string;
  category: string;
  difficulty: string;
  region: string | null;
  totalMinutes: number | null;
  servings: number | null;
  tags: string[];
  image: string | null;
  createdAt: string;
  /** Zutaten als kleingeschriebener Text (für Restefest-Matching). */
  ingredients: string;
  /** Denormalisierter Suchtext (Titel/Kategorie/Tags/Zutaten/Schritte/Hinweise). */
  search: string;
}

/** Kompakter Client-Index aller aktiven Rezepte (für Startseite + Restefest). */
export function recipeIndex(): RecipeIndexEntry[] {
  return listRecipes().map((r) => ({
    slug: r.slug,
    title: r.meta.title,
    category: prettyCategory(r.meta.category),
    difficulty: prettyDifficulty(r.meta.difficulty),
    region: r.meta.region ?? null,
    totalMinutes: totalMinutes(r.meta.prep_time, r.meta.cook_time, r.meta.rest_time),
    servings: r.meta.servings ?? null,
    tags: r.meta.tags ?? [],
    image: r.imageFilename ?? null,
    createdAt: r.createdAt,
    ingredients: flattenIngredients(r.ingredients).join("\n").toLowerCase(),
    search: buildSearchBlob(r.meta, r.ingredients, r.steps, r.notes),
  }));
}

/** Volltextsuche über FTS5. Leere Anfrage → alle (wie listRecipes). */
export function searchRecipes(query: string): StoredRecipe[] {
  const q = query.trim();
  if (!q) return listRecipes();
  // Tokens als Präfix-Match (term*), implizit UND-verknüpft; Sonderzeichen entfernen.
  const match = q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/["*()]/g, ""))
    .filter(Boolean)
    .map((t) => `${t}*`)
    .join(" ");
  if (!match) return listRecipes();
  const rows = getDb()
    .prepare(
      `SELECT ${SELECT_COLS} FROM recipes_fts f
       JOIN recipes r ON r.id = f.rowid
       WHERE recipes_fts MATCH ? AND r.deleted_at IS NULL
       ORDER BY rank`,
    )
    .all(match) as Row[];
  return rows.map(rowToStored);
}

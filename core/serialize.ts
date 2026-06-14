// Recipe-Meta → YAML-Frontmatter. Wird beim Backfill genutzt, um den
// Markdown-Body (der nach Drive gespiegelt wird) an geänderte Metadaten
// anzugleichen, ohne den eigentlichen Rezept-Text neu zu erzeugen.
import { stringify } from "yaml";
import type { RecipeMeta } from "./model.ts";

/** Frontmatter-Block (ohne die ---) in Template-Feldreihenfolge. Leere Felder entfallen. */
export function frontmatterFor(meta: RecipeMeta): string {
  const o: Record<string, unknown> = { title: meta.title };
  if (meta.tags?.length) o.tags = meta.tags;
  if (meta.category) o.category = meta.category;
  if (meta.grouping) o.grouping = meta.grouping;
  if (meta.prep_time) o.prep_time = meta.prep_time;
  if (meta.cook_time) o.cook_time = meta.cook_time;
  if (meta.rest_time) o.rest_time = meta.rest_time;
  if (meta.servings != null) o.servings = meta.servings;
  if (meta.equipment?.length) o.equipment = meta.equipment;
  if (meta.difficulty) o.difficulty = meta.difficulty;
  if (meta.region) o.region = meta.region;
  if (meta.source_url?.length) o.source_url = meta.source_url;
  if (meta.theme_color) o.theme_color = meta.theme_color;
  if (meta.image_subject) o.image_subject = meta.image_subject;
  if (meta.image_prompt) o.image_prompt = meta.image_prompt;
  if (meta.last_modified) o.last_modified = meta.last_modified;
  return stringify(o).trimEnd();
}

/**
 * Ersetzt das Frontmatter eines vorhandenen Markdown-Dokuments durch ein frisch
 * aus `meta` erzeugtes; der Body (alles nach dem ersten ---…---) bleibt unverändert.
 */
export function rebuildMarkdown(originalMd: string, meta: RecipeMeta): string {
  const body = originalMd.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").replace(/^\n+/, "");
  return `---\n${frontmatterFor(meta)}\n---\n\n${body}`;
}

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parse as parseYaml } from "yaml";
import type { IngredientSection, Recipe, RecipeMeta } from "./model.ts";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Macht aus beliebig verschachtelten YAML-Werten eine flache String-Liste. */
function flattenStrings(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  return [String(value).trim()].filter((s) => s.length > 0);
}

function toStringArray(value: unknown): string[] {
  if (value == null) return [];
  return Array.isArray(value) ? value.map((v) => String(v)) : [String(value)];
}

function parseMeta(raw: Record<string, unknown>): RecipeMeta {
  return {
    title: raw.title != null ? String(raw.title) : "Unbenanntes Rezept",
    tags: toStringArray(raw.tags),
    category: raw.category != null ? String(raw.category) : undefined,
    grouping: raw.grouping != null ? String(raw.grouping) : undefined,
    prep_time: raw.prep_time != null ? String(raw.prep_time) : undefined,
    cook_time: raw.cook_time != null ? String(raw.cook_time) : undefined,
    rest_time: raw.rest_time != null ? String(raw.rest_time) : undefined,
    servings:
      raw.servings != null && raw.servings !== ""
        ? Number(raw.servings)
        : undefined,
    equipment: toStringArray(raw.equipment),
    difficulty: raw.difficulty != null ? String(raw.difficulty) : undefined,
    region:
      raw.region != null && String(raw.region).trim() !== ""
        ? String(raw.region).trim()
        : undefined,
    source_url: flattenStrings(raw.source_url),
    last_modified:
      raw.last_modified != null ? String(raw.last_modified) : undefined,
    theme_color:
      raw.theme_color != null && String(raw.theme_color).trim() !== ""
        ? String(raw.theme_color)
        : undefined,
    image_subject:
      raw.image_subject != null && String(raw.image_subject).trim() !== ""
        ? String(raw.image_subject)
        : undefined,
    image_prompt:
      raw.image_prompt != null && String(raw.image_prompt).trim() !== ""
        ? String(raw.image_prompt)
        : undefined,
  };
}

type Section = "none" | "ingredients" | "steps" | "notes";

function classifyHeading(line: string): Section | null {
  const m = line.match(/^##\s+(.*)$/);
  if (!m) return null;
  const title = m[1].trim().toLowerCase();
  if (title.startsWith("zutat")) return "ingredients";
  if (title.startsWith("schritt") || title.startsWith("zubereitung"))
    return "steps";
  if (title.startsWith("hinweis") || title.startsWith("tipp")) return "notes";
  return "none";
}

function parseBody(body: string): {
  ingredients: IngredientSection[];
  steps: string[];
  notes: string[];
} {
  const ingredients: IngredientSection[] = [];
  const steps: string[] = [];
  const notes: string[] = [];

  let section: Section = "none";
  let current: IngredientSection | null = null;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trimEnd();

    const heading = classifyHeading(line);
    if (heading !== null) {
      section = heading;
      current = null;
      continue;
    }

    if (section === "ingredients") {
      const sub = line.match(/^###\s+(.*)$/);
      if (sub) {
        current = { name: sub[1].trim(), items: [] };
        ingredients.push(current);
        continue;
      }
      const item = line.match(/^[-*]\s+(.*)$/);
      if (item && item[1].trim()) {
        if (!current) {
          current = { items: [] };
          ingredients.push(current);
        }
        current.items.push(item[1].trim());
      }
    } else if (section === "steps") {
      const step = line.match(/^\d+[.)]\s+(.*)$/);
      if (step && step[1].trim()) steps.push(step[1].trim());
    } else if (section === "notes") {
      if (line.startsWith("<!--")) continue;
      const item = line.match(/^[-*]\s+(.*)$/);
      if (item && item[1].trim()) notes.push(item[1].trim());
    }
  }

  return {
    ingredients: ingredients.filter((s) => s.items.length > 0),
    steps,
    notes,
  };
}

/**
 * Parst Rezept-Markdown (YAML-Frontmatter + Body) aus einem String.
 * `sourceLabel` landet als `sourceFile` (Dateipfad bei parseRecipe, sonst
 * z.B. eine URL/„telegram"-Quelle beim Web-/Bot-Import).
 */
export function parseRecipeFromString(text: string, sourceLabel = ""): Recipe {
  const fm = text.match(FRONTMATTER);
  if (!fm) {
    const where = sourceLabel ? ` in ${basename(sourceLabel)}` : "";
    throw new Error(`Kein YAML-Frontmatter${where} gefunden.`);
  }
  const meta = parseMeta((parseYaml(fm[1]) ?? {}) as Record<string, unknown>);
  const body = text.slice(fm[0].length);
  const { ingredients, steps, notes } = parseBody(body);
  return { meta, ingredients, steps, notes, sourceFile: sourceLabel };
}

export function parseRecipe(filePath: string): Recipe {
  return parseRecipeFromString(readFileSync(filePath, "utf8"), filePath);
}

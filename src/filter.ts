import type { Recipe } from "./model.ts";

export interface FilterOptions {
  category?: string;
  tag?: string;
  grouping?: string;
}

const eq = (a: string | undefined, b: string) =>
  (a ?? "").toLowerCase() === b.toLowerCase();

export function matchesFilter(recipe: Recipe, opts: FilterOptions): boolean {
  const { meta } = recipe;
  if (opts.category && !eq(meta.category, opts.category)) return false;
  if (opts.grouping && !eq(meta.grouping, opts.grouping)) return false;
  if (opts.tag && !meta.tags.some((t) => eq(t, opts.tag!))) return false;
  return true;
}

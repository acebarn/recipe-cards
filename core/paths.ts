import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Liefert den Projekt-Root (Typst-`--root`, Ort von templates/, fonts/, assets/).
 *
 * Priorität:
 *   1. ENV `RECIPE_PROJECT_ROOT` (z.B. in der SvelteKit-/Docker-Umgebung gesetzt)
 *   2. `fallback` des Aufrufers (CLI berechnet ihn aus seinem Dateipfad)
 *   3. zwei Ebenen über dieser Datei (core/ → Repo-Wurzel)
 */
export function getProjectRoot(fallback?: string): string {
  const env = process.env.RECIPE_PROJECT_ROOT?.trim();
  if (env) return env;
  if (fallback) return fallback;
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

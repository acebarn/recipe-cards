import { readdirSync } from "node:fs";
import { join } from "node:path";

/** Findet rekursiv alle .md-Rezepte; überspringt versteckte Dateien und das Template. */
export function findRecipeFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name.toLowerCase() === "recipe template.md") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findRecipeFiles(full));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      found.push(full);
    }
  }
  return found.sort();
}

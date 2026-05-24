import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Liest KEY=VALUE-Zeilen aus einer .env im Projekt-Root, ohne Zusatzabhängigkeit. */
export function loadDotEnv(root: string): void {
  const file = join(root, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}

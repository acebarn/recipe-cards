import { getProjectRoot } from "$core/paths.ts";
import { error } from "@sveltejs/kit";
import { existsSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import type { RequestHandler } from "./$types";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export const GET: RequestHandler = ({ params }) => {
  const name = basename(params.file); // Pfad-Traversal verhindern
  const type = TYPES[extname(name).toLowerCase()];
  if (!type) throw error(404);
  const path = join(getProjectRoot(), "assets", name);
  if (!existsSync(path)) throw error(404);
  return new Response(readFileSync(path), {
    headers: { "content-type": type, "cache-control": "public, max-age=86400" },
  });
};

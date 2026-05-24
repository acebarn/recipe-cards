import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import type { Recipe } from "./model.ts";
import { scaleIngredient } from "./scale.ts";
import { themeFor } from "./theme.ts";

export function slugify(recipe: Recipe): string {
  const base = recipe.meta.title || basename(recipe.sourceFile, ".md");
  return base
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: "leicht",
  simple: "leicht",
  einfach: "leicht",
  medium: "mittel",
  mittel: "mittel",
  hard: "schwer",
  difficult: "schwer",
  schwer: "schwer",
};

/** Zeiten kommen als "H:MM" (1:50) oder als reine Minutenzahl (20) vor. */
function formatTime(raw: string): string {
  const v = raw.trim();
  if (v.includes(":")) {
    const [h, m] = v.split(":");
    const hours = Number(h);
    const mins = Number(m);
    if (Number.isFinite(hours) && Number.isFinite(mins)) {
      if (hours === 0) return `${mins} Min.`;
      return mins === 0 ? `${hours} Std.` : `${hours}:${String(mins).padStart(2, "0")} Std.`;
    }
    return v;
  }
  const mins = Number(v.replace(",", "."));
  if (!Number.isFinite(mins)) return v;
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `${h} Std.` : `${h}:${String(m).padStart(2, "0")} Std.`;
  }
  return `${v} Min.`;
}

/** Baut das JSON-Objekt, das das Typst-Template konsumiert. */
function buildCardData(
  recipe: Recipe,
  scale: number,
  opts: { slug: string; projectRoot: string },
) {
  const { meta } = recipe;

  // Symbolbild: assets/<slug>.{png,jpg} – Typst-Pfad relativ zu --root.
  let image: string | null = null;
  let imageAbs: string | undefined;
  for (const ext of ["png", "jpg", "jpeg", "webp"]) {
    const candidate = join(opts.projectRoot, "assets", `${opts.slug}.${ext}`);
    if (existsSync(candidate)) {
      image = "/" + relative(opts.projectRoot, candidate).split(sep).join("/");
      imageAbs = candidate;
      break;
    }
  }

  const times: Array<{ label: string; value: string }> = [];
  if (meta.prep_time) times.push({ label: "Vorbereitung", value: formatTime(meta.prep_time) });
  if (meta.cook_time) times.push({ label: "Kochen/Backen", value: formatTime(meta.cook_time) });
  if (meta.rest_time) times.push({ label: "Ruhezeit", value: formatTime(meta.rest_time) });

  let servingsText: string | null = null;
  if (meta.servings != null && Number.isFinite(meta.servings)) {
    const scaled = meta.servings * scale;
    servingsText =
      scale === 1
        ? `${meta.servings}`
        : `${formatServings(scaled)} (×${formatScale(scale)})`;
  }

  return {
    title: meta.title,
    theme: themeFor({ title: meta.title, themeColor: meta.theme_color, imagePath: imageAbs }),
    image,
    difficulty: meta.difficulty
      ? DIFFICULTY_LABEL[meta.difficulty.toLowerCase()] ?? meta.difficulty
      : null,
    category: meta.category ?? null,
    servings: servingsText,
    times,
    equipment: meta.equipment,
    ingredients: recipe.ingredients.map((sec) => ({
      name: sec.name ?? null,
      items: sec.items.map((line) => scaleIngredient(line, scale)),
    })),
    steps: recipe.steps.map((text, i) => ({ n: i + 1, text })),
    notes: recipe.notes,
    sources: meta.source_url,
  };
}

function formatServings(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace(".", ",");
}

function formatScale(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
}

export interface RenderResult {
  slug: string;
  pdfPath: string;
  pages: number;
}

/** Fragt die finale Seitenzahl über das <pagecount>-Metadatum des Templates ab. */
function queryPageCount(typPath: string, projectRoot: string): number {
  try {
    const out = execFileSync(
      "typst",
      ["query", "--root", projectRoot, typPath, "<pagecount>", "--field", "value", "--one"],
      { stdio: ["ignore", "pipe", "pipe"] },
    ).toString();
    const n = Number(JSON.parse(out));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0; // unbekannt
  }
}

export function renderCard(
  recipe: Recipe,
  options: { projectRoot: string; outDir: string; scale: number },
): RenderResult {
  const { projectRoot, outDir, scale } = options;
  const slug = slugify(recipe);
  const buildDir = join(outDir, ".build");
  mkdirSync(buildDir, { recursive: true });

  const data = buildCardData(recipe, scale, { slug, projectRoot });
  const jsonPath = join(buildDir, `${slug}.json`);
  writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf8");

  // Typst-Pfade mit führendem "/" werden relativ zu --root aufgelöst.
  const jsonRootPath = "/" + relative(projectRoot, jsonPath).split(sep).join("/");

  const typPath = join(buildDir, `${slug}.typ`);
  writeFileSync(
    typPath,
    `#import "/templates/card.typ": card\n#card(json(${JSON.stringify(jsonRootPath)}))\n`,
    "utf8",
  );

  const pdfPath = join(outDir, `${slug}.pdf`);
  execFileSync(
    "typst",
    ["compile", "--root", projectRoot, typPath, pdfPath],
    { stdio: ["ignore", "ignore", "pipe"] },
  );

  const pages = queryPageCount(typPath, projectRoot);
  return { slug, pdfPath, pages };
}

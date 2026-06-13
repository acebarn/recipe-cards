import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import type { Recipe } from "./model.ts";
import { scaleIngredient } from "./scale.ts";
import { themeFor } from "./theme.ts";

/** Wandelt einen Titel in einen dateisystem-/URL-sicheren Slug (Basis für PDF-/Bild-Namen). */
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function slugify(recipe: Recipe): string {
  return slugifyTitle(recipe.meta.title || basename(recipe.sourceFile, ".md"));
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
  /** Angewandte Auto-Fit-Skalierung (1 = unverändert). */
  scaleFront: number;
  scaleBack: number;
}

interface PageInfo {
  front: number; // Seite, auf der die Vorderseite endet
  total: number; // Gesamtseitenzahl
}

/** Liest das <pageinfo>-Metadatum (Vorderseiten-Endseite + Gesamtseiten). */
function queryPageInfo(typPath: string, projectRoot: string): PageInfo {
  try {
    const out = execFileSync(
      "typst",
      [
        "query",
        "--root",
        projectRoot,
        "--font-path",
        join(projectRoot, "fonts"),
        typPath,
        "<pageinfo>",
        "--field",
        "value",
        "--one",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    ).toString();
    const v = JSON.parse(out) as { front?: number; total?: number };
    const front = Number(v.front);
    const total = Number(v.total);
    return { front: Number.isFinite(front) ? front : 1, total: Number.isFinite(total) ? total : 0 };
  } catch {
    return { front: 1, total: 0 };
  }
}

const MIN_SCALE = 0.7; // nicht kleiner skalieren (Lesbarkeit)
const SCALE_STEP = 0.05;

export function renderCard(
  recipe: Recipe,
  options: { projectRoot: string; outDir: string; scale: number; slug?: string },
): RenderResult {
  const { projectRoot, outDir, scale } = options;
  // Bevorzugt der explizit übergebene (gespeicherte) Slug; sonst aus dem Titel.
  const slug = options.slug ?? slugify(recipe);
  // Wrapper & JSON müssen INNERHALB des Typst-Root liegen; die PDF darf irgendwohin.
  const buildDir = join(projectRoot, ".cli-build");
  mkdirSync(buildDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  const data = buildCardData(recipe, scale, { slug, projectRoot });
  const jsonPath = join(buildDir, `${slug}.json`);

  // Typst-Pfade mit führendem "/" werden relativ zu --root aufgelöst.
  const jsonRootPath = "/" + relative(projectRoot, jsonPath).split(sep).join("/");
  const typPath = join(buildDir, `${slug}.typ`);
  writeFileSync(
    typPath,
    `#import "/templates/card.typ": card\n#card(json(${JSON.stringify(jsonRootPath)}))\n`,
    "utf8",
  );
  const pdfPath = join(outDir, `${slug}.pdf`);

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const compileWith = (sf: number, sb: number): PageInfo => {
    writeFileSync(jsonPath, JSON.stringify({ ...data, scale_front: sf, scale_back: sb }, null, 2), "utf8");
    execFileSync(
      "typst",
      ["compile", "--root", projectRoot, "--font-path", join(projectRoot, "fonts"), typPath, pdfPath],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    return queryPageInfo(typPath, projectRoot);
  };

  // Auto-Fit: Schrift pro Seite schrittweise verkleinern, bis Vorder- und
  // Rückseite je genau eine Seite belegen (bis zur Mindestgröße).
  let sf = 1;
  let sb = 1;
  let info = compileWith(sf, sb);
  for (let guard = 0; guard < 16; guard++) {
    if (info.front > 1 && sf > MIN_SCALE) {
      sf = Math.max(MIN_SCALE, round2(sf - SCALE_STEP));
      info = compileWith(sf, sb);
      continue;
    }
    if (info.total - info.front > 1 && sb > MIN_SCALE) {
      sb = Math.max(MIN_SCALE, round2(sb - SCALE_STEP));
      info = compileWith(sf, sb);
      continue;
    }
    break;
  }

  return { slug, pdfPath, pages: info.total, scaleFront: sf, scaleBack: sb };
}

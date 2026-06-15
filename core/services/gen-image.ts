// Bild-Service: KI-Aquarell-Symbol pro Rezept via Pixazo FLUX.1 [schnell].
// Reine, wiederverwendbare Logik – genutzt von der CLI (scripts/gen-images.ts)
// und vom Web-/Bot-Add-Flow. Caching/Datei-Ablage liegt bei den Aufrufern.
import type { Recipe } from "../model.ts";

// Pixazo FLUX.1 [schnell] — günstig (~$0,0012/Bild), synchroner Flow.
const ENDPOINT = "https://gateway.pixazo.ai/flux-1-schnell/v1/getData";
export const DEFAULT_IMAGE_SIZE = 1024; // quadratisch fürs runde Badge
export const DEFAULT_IMAGE_STEPS = 4; // schnell-Default (max. 8)

// Aquarell-Stil bewusst ZUERST (FLUX gewichtet frühe Tokens stärker) + explizite
// "kein Foto"-Hinweise, damit das Motiv nicht ins Fotorealistische kippt.
const STYLE_LEAD =
  "Hand-painted watercolor illustration, loose visible brush strokes, soft pastel washes, " +
  "watercolor paper texture, flat 2D storybook style";

const STYLE_TAIL =
  "single subject, close-up, centered, filling most of the frame, " +
  "isolated on a plain white background, no plate, no cutlery, no background scenery, " +
  "no text, no words, no letters, no watermark. " +
  "Traditional watercolor painting — NOT a photo, not photorealistic, no realistic lighting, no 3D render";

/**
 * Baut den englischen Bild-Prompt. Priorität:
 *   1. image_prompt  → englischer Bild-Prompt (überschreibt image_subject)
 *   2. image_subject → englische Gerichtsbeschreibung (empfohlen)
 *   3. title         → deutscher Titel als Notlösung (oft ungenau)
 */
export function buildImagePrompt(recipe: Recipe): string {
  const subject = recipe.meta.image_prompt ?? recipe.meta.image_subject ?? recipe.meta.title;
  return `${STYLE_LEAD} of ${subject}. ${STYLE_TAIL}.`;
}

/** Bestimmt die Dateiendung anhand der Magic Bytes (Pixazo liefert JPEG). */
export function extFor(buf: Buffer): "jpg" | "png" | "webp" {
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  if (buf[0] === 0x89 && buf[1] === 0x50) return "png";
  if (buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return "jpg";
}

/** Deterministischer Seed aus dem Slug, damit erneute Läufe dasselbe Bild liefern. */
export function seedFrom(slug: string): number {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) % 2147483647;
  return h;
}

export async function generate(
  prompt: string,
  apiKey: string,
  opts: { size: number; steps: number; seed: number },
): Promise<Buffer> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "Ocp-Apim-Subscription-Key": apiKey,
    },
    body: JSON.stringify({
      prompt,
      num_steps: opts.steps,
      seed: opts.seed,
      width: opts.size,
      height: opts.size,
    }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300)}`);
  }

  const data = (await res.json()) as { output?: string };
  if (!data.output) {
    throw new Error(`Keine Bild-URL in der Antwort: ${JSON.stringify(data).slice(0, 300)}`);
  }

  // Antwort liefert eine URL zum PNG → herunterladen.
  const img = await fetch(data.output);
  if (!img.ok) throw new Error(`Bild-Download fehlgeschlagen: HTTP ${img.status} (${data.output})`);
  return Buffer.from(await img.arrayBuffer());
}

export interface GenImageOptions {
  apiKey: string;
  size?: number;
  steps?: number;
  /** Expliziter Seed (z.B. zufällig bei Neugenerierung); sonst deterministisch aus dem Slug. */
  seed?: number;
}

/** High-Level: Rezept + Slug → Bild-Buffer samt erkannter Endung. */
export async function generateRecipeImage(
  recipe: Recipe,
  slug: string,
  opts: GenImageOptions,
): Promise<{ buffer: Buffer; ext: "jpg" | "png" | "webp" }> {
  const buffer = await generate(buildImagePrompt(recipe), opts.apiKey, {
    size: opts.size ?? DEFAULT_IMAGE_SIZE,
    steps: opts.steps ?? DEFAULT_IMAGE_STEPS,
    seed: opts.seed ?? seedFrom(slug),
  });
  return { buffer, ext: extFor(buffer) };
}

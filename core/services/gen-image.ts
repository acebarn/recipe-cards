// Bild-Service: KI-Aquarell-Symbol pro Rezept via Cloudflare Workers AI (FLUX.1 [schnell]).
// Reine, wiederverwendbare Logik – genutzt von der Web-App (core/services/image-store.ts).
// Caching/Datei-Ablage liegt bei den Aufrufern.
import type { Recipe } from "../model.ts";

// Workers AI hat ein kostenloses Tageskontingent; das Modell liefert fest 1024×1024
// (quadratisch fürs runde Badge) und das Bild als Base64 in der JSON-Antwort.
const MODEL = "@cf/black-forest-labs/flux-1-schnell";
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

/** Bestimmt die Dateiendung anhand der Magic Bytes (Workers AI liefert JPEG). */
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

/** `apiKey` ist der Cloudflare-API-Token; die Konto-ID kommt aus CLOUDFLARE_ACCOUNT_ID. */
export async function generate(
  prompt: string,
  apiKey: string,
  opts: { steps: number; seed: number },
): Promise<Buffer> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID ist nicht gesetzt.");

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ prompt, steps: opts.steps, seed: opts.seed }),
    },
  );

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300)}`);
  }

  const data = (await res.json()) as { result?: { image?: string } };
  const b64 = data.result?.image;
  if (!b64) {
    throw new Error(`Kein Bild in der Antwort: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return Buffer.from(b64, "base64");
}

export interface GenImageOptions {
  apiKey: string;
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
    steps: opts.steps ?? DEFAULT_IMAGE_STEPS,
    seed: opts.seed ?? seedFrom(slug),
  });
  return { buffer, ext: extFor(buffer) };
}

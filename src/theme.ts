import { readFileSync } from "node:fs";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

export interface Theme {
  hue: number;
  source: "header" | "image" | "title"; // woher die Grundfarbe stammt
  accent: string; // Titel, Abschnitts-Überschriften, Linien, Aufzählungen
  accentSoft: string; // Trennlinie / Ring dezent
  panelBg: string; // Hintergrund der Zutaten-Spalte
  panelText: string; // Text auf dem Zutaten-Panel (kontraststark)
  panelHeading: string; // Überschriften auf dem Panel
  chipBg: string; // Metadaten-Chips
  noteBg: string; // Hinweise-Box
  placeholderBg: string; // Fallback-Badge-Hintergrund
}

/** Deterministischer Hash (djb2) über die Unicode-Codepoints des Titels. */
function hashString(s: string): number {
  let h = 5381;
  for (const ch of s) {
    h = ((h << 5) + h + ch.codePointAt(0)!) >>> 0;
  }
  return h;
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = lig - c / 2;
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** RGB (0–255) → {h: 0–360, s: 0–1, l: 0–1}. */
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

/** #rgb oder #rrggbb → Farbton (0–360) oder null. */
function hueFromHex(hex: string): number | null {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return rgbToHsl(r, g, b).h;
}

interface Bitmap {
  width: number;
  height: number;
  data: Uint8Array; // RGBA
}

function decodeImage(path: string): Bitmap | null {
  try {
    const buf = readFileSync(path);
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      const img = jpeg.decode(buf, { useTArray: true });
      return { width: img.width, height: img.height, data: img.data };
    }
    if (buf[0] === 0x89 && buf[1] === 0x50) {
      const png = PNG.sync.read(buf);
      return { width: png.width, height: png.height, data: png.data };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Ermittelt einen das Gericht repräsentierenden Farbton aus dem Bild:
 * Hintergrund (nahezu weiß) und neutrale/graue Pixel werden ignoriert, die
 * verbleibenden farbigen Pixel werden – nach Sättigung gewichtet – als
 * zirkulärer Mittelwert zusammengefasst.
 */
function hueFromImage(path: string): number | null {
  const img = decodeImage(path);
  if (!img) return null;

  let sumSin = 0;
  let sumCos = 0;
  let weight = 0;
  const step = 4 * Math.max(1, Math.floor((img.width * img.height) / 20000)); // ~20k Samples
  for (let i = 0; i + 2 < img.data.length; i += step) {
    const { h, s, l } = rgbToHsl(img.data[i], img.data[i + 1], img.data[i + 2]);
    if (l > 0.9 || l < 0.12 || s < 0.18) continue; // Hintergrund/Neutral ausblenden
    const rad = (h * Math.PI) / 180;
    sumSin += Math.sin(rad) * s;
    sumCos += Math.cos(rad) * s;
    weight += s;
  }
  if (weight < 1) return null; // zu wenig Farbe gefunden
  let hue = (Math.atan2(sumSin, sumCos) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  return hue;
}

/**
 * Baut die harmonische Palette aus einem Farbton. Sättigung und Helligkeit sind
 * pro Rolle fix → einheitlicher Look, heller Hintergrund + dunkler, gleichfarbiger
 * Text für guten Kontrast.
 */
function paletteFromHue(hue: number, source: Theme["source"]): Theme {
  return {
    hue,
    source,
    accent: hslToHex(hue, 52, 38),
    accentSoft: hslToHex(hue, 40, 80),
    panelBg: hslToHex(hue, 42, 92),
    panelText: hslToHex(hue, 48, 22),
    panelHeading: hslToHex(hue, 55, 32),
    chipBg: hslToHex(hue, 32, 93),
    noteBg: hslToHex(hue, 46, 90),
    placeholderBg: hslToHex(hue, 38, 86),
  };
}

/**
 * Bestimmt die Grundfarbe nach Priorität:
 *   1. themeColor   – explizit im Rezept-Header (#hex)
 *   2. imagePath    – repräsentative Farbe aus dem generierten Bild
 *   3. title        – deterministischer Hash als Notlösung
 */
export function themeFor(opts: {
  title: string;
  themeColor?: string;
  imagePath?: string;
}): Theme {
  if (opts.themeColor) {
    const hue = hueFromHex(opts.themeColor);
    if (hue !== null) return paletteFromHue(hue, "header");
  }
  if (opts.imagePath) {
    const hue = hueFromImage(opts.imagePath);
    if (hue !== null) return paletteFromHue(hue, "image");
  }
  return paletteFromHue(hashString(opts.title) % 360, "title");
}

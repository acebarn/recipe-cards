// Instagram-Reel-Import (Weg A): die Caption (Bildunterschrift) per yt-dlp holen.
// Viele Rezept-Reels haben das komplette Rezept in der Caption → fließt dann in
// den normalen Text→Rezept-Flow (Gemini). Das Video selbst wird NICHT geladen.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(execFile);

export function isInstagramUrl(s: string): boolean {
  return /^https?:\/\/(www\.)?(instagram\.com|instagr\.am)\/[^\s]+/i.test(s.trim());
}

/** Holt die Caption eines öffentlichen Instagram-Reels/Posts via yt-dlp. */
export async function fetchReelCaption(url: string): Promise<string> {
  const u = url.trim();
  if (!isInstagramUrl(u)) throw new Error("Kein Instagram-Link.");
  let stdout: string;
  try {
    ({ stdout } = await pexec("yt-dlp", ["-J", "--no-warnings", "--no-playlist", u], {
      maxBuffer: 32 * 1024 * 1024,
      timeout: 60_000,
    }));
  } catch (e) {
    const err = e as { code?: string; stderr?: string; message?: string };
    if (err.code === "ENOENT") throw new Error("yt-dlp ist nicht installiert.");
    const detail = (err.stderr ?? err.message ?? "").toString().slice(0, 300);
    throw new Error(
      "Instagram-Abruf fehlgeschlagen (Reel evtl. privat oder Login nötig). " +
        "Tipp: Caption kopieren und als Text senden.\n" +
        detail,
    );
  }
  let data: { description?: string; title?: string };
  try {
    data = JSON.parse(stdout);
  } catch {
    throw new Error("Konnte die yt-dlp-Ausgabe nicht lesen.");
  }
  const caption = (data.description ?? data.title ?? "").trim();
  if (!caption) {
    throw new Error(
      "Keine Caption gefunden – das Rezept steht vermutlich nur im Video. " +
        "Kopiere den Rezepttext und sende ihn als Text.",
    );
  }
  return caption;
}

#!/usr/bin/env node
// Telegram-Bot (Long-Polling, dependency-frei): empfängt Foto / Link / Text,
// fährt die Pipeline (Import → Bild → PDF) und schickt die fertige Karte zurück.
//
// Konfiguration (Umgebung oder .env):
//   TELEGRAM_BOT_TOKEN       Pflicht – Token von @BotFather
//   ALLOWED_TELEGRAM_USERS   optional – Komma-Liste erlaubter User-IDs (leer = alle)
//   PIXAZO_API_KEY / GEMINI_API_KEY   für Bild- bzw. Importschritt
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "../src/env.ts";
import { slugifyTitle } from "../src/render.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadDotEnv(ROOT);

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN fehlt (in .env oder Umgebung).");
  process.exit(1);
}
const ALLOWED = (process.env.ALLOWED_TELEGRAM_USERS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const API = `https://api.telegram.org/bot${TOKEN}`;
const FILE_API = `https://api.telegram.org/file/bot${TOKEN}`;
const TMP = join(ROOT, ".bot-tmp");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const WELCOME =
  "👋 Schick mir einfach:\n" +
  "• ein 📸 Foto einer Rezeptseite (am besten als Datei für beste Qualität),\n" +
  "• einen 🔗 Rezept-Link, oder\n" +
  "• 📝 Rezepttext.\n\n" +
  "Ich erstelle daraus eine druckfertige A5-Rezeptkarte (PDF) und schicke sie dir zurück.\n" +
  "Tipp: Blockt eine Webseite den Zugriff, kopier den Rezepttext und sende ihn direkt.";

async function api(method: string, params: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const j = (await res.json()) as { ok: boolean; result?: any; description?: string };
  if (!j.ok) throw new Error(`${method}: ${j.description ?? res.status}`);
  return j.result;
}

async function sendMessage(chatId: number, text: string): Promise<void> {
  try {
    await api("sendMessage", { chat_id: chatId, text });
  } catch (e) {
    console.error("sendMessage:", (e as Error).message);
  }
}

async function sendDocument(chatId: number, filePath: string, caption: string): Promise<void> {
  const fd = new FormData();
  fd.append("chat_id", String(chatId));
  if (caption) fd.append("caption", caption);
  fd.append("document", new Blob([readFileSync(filePath)], { type: "application/pdf" }), basename(filePath));
  const res = await fetch(`${API}/sendDocument`, { method: "POST", body: fd });
  const j = (await res.json()) as { ok: boolean; description?: string };
  if (!j.ok) throw new Error(`sendDocument: ${j.description ?? res.status}`);
}

/** Lädt eine Telegram-Datei in TMP und gibt den lokalen Pfad zurück. */
async function downloadFile(fileId: string): Promise<string> {
  const f = (await api("getFile", { file_id: fileId })) as { file_path: string };
  const res = await fetch(`${FILE_API}/${f.file_path}`);
  if (!res.ok) throw new Error(`Datei-Download HTTP ${res.status}`);
  mkdirSync(TMP, { recursive: true });
  const dest = join(TMP, `tg-${Date.now()}${extname(f.file_path) || ".jpg"}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

function node(script: string, args: string[] = []): { out: string } {
  const r = spawnSync("node", [script, ...args], { cwd: ROOT, encoding: "utf8" });
  const combined = (r.stdout ?? "") + (r.stderr ?? "");
  if (r.status !== 0) throw new Error(combined.trim() || `${script} fehlgeschlagen`);
  return { out: combined };
}

/** Import → Bild → PDF; liefert Titel und Pfad der erzeugten PDF. */
function runPipeline(inputArg: string): { title: string; pdfPath: string } {
  // --force: erneutes Senden überschreibt dasselbe Rezept (kein "-2"-Duplikat).
  const imp = node("scripts/import-photo.ts", [inputArg, "--force"]).out;
  const titleMatch = imp.match(/Entwurf erstellt:\s*(.+)/);
  const pathMatch = imp.match(/→\s*(.+\.md)\s*$/m);
  if (!titleMatch && !pathMatch) {
    throw new Error("Konnte das erzeugte Rezept nicht ermitteln.\n" + imp);
  }
  const title = titleMatch ? titleMatch[1].trim() : basename(pathMatch![1].trim(), ".md");
  // PDF-Name = Titel-Slug (identisch zur Benennung im Renderer).
  const slug = slugifyTitle(title);
  node("scripts/gen-images.ts");
  node("src/cli.ts");
  return { title, pdfPath: join(ROOT, "out", `${slug}.pdf`) };
}

async function handle(msg: any): Promise<void> {
  if (!msg) return;
  const chatId = msg.chat.id as number;
  const userId = String(msg.from?.id ?? "");
  if (ALLOWED.length > 0 && !ALLOWED.includes(userId)) {
    await sendMessage(chatId, "⛔ Nicht autorisiert.");
    return;
  }

  // Telegram-Befehle (/start, /help …) nicht als Rezept verarbeiten.
  if (typeof msg.text === "string" && msg.text.trim().startsWith("/")) {
    await sendMessage(chatId, WELCOME);
    return;
  }

  let inputArg: string | undefined;
  if (msg.photo) {
    inputArg = await downloadFile(msg.photo[msg.photo.length - 1].file_id); // größte Auflösung
  } else if (msg.document) {
    inputArg = await downloadFile(msg.document.file_id);
  } else if (msg.text) {
    inputArg = msg.text.trim();
  }
  if (!inputArg) {
    await sendMessage(chatId, "Bitte ein Foto, einen Link oder Rezepttext senden 📸🔗📝");
    return;
  }

  await sendMessage(chatId, "⏳ Verarbeite das Rezept …");
  let result: { title: string; pdfPath: string };
  try {
    result = runPipeline(inputArg);
  } catch (e) {
    await sendMessage(chatId, "❌ Fehler:\n" + String((e as Error).message).slice(0, 800));
    return;
  }
  try {
    await sendDocument(chatId, result.pdfPath, `✅ ${result.title}`);
  } catch (e) {
    await sendMessage(chatId, `Rezept „${result.title}" erstellt, aber PDF-Versand fehlschlug: ${(e as Error).message}`);
  }
}

async function main(): Promise<void> {
  try {
    const me = (await api("getMe")) as { username: string };
    console.error(`Bot @${me.username} läuft (Long-Polling)${ALLOWED.length ? `, erlaubte User: ${ALLOWED.join(", ")}` : ""} …`);
  } catch (e) {
    console.error("getMe fehlgeschlagen, fahre trotzdem fort:", (e as Error).message);
  }
  let offset = 0;
  for (;;) {
    let updates: any[];
    try {
      updates = await api("getUpdates", { offset, timeout: 50 });
    } catch (e) {
      console.error("getUpdates:", (e as Error).message);
      await sleep(3000);
      continue;
    }
    for (const u of updates) {
      offset = u.update_id + 1;
      try {
        await handle(u.message ?? u.channel_post);
      } catch (e) {
        console.error("handle:", (e as Error).message);
      }
    }
  }
}

main();

#!/usr/bin/env node
// Telegram-Bot (Long-Polling, dependency-frei): empfängt Foto / Link / Text,
// fährt die Pipeline (Import → Bild → PDF) und schickt die fertige Karte zurück.
//
// Konfiguration (Umgebung oder .env):
//   TELEGRAM_BOT_TOKEN       Pflicht – Token von @BotFather
//   ALLOWED_TELEGRAM_USERS   Komma-Liste erlaubter User-IDs (fail-closed: leer = niemand)
//   PIXAZO_API_KEY / GEMINI_API_KEY   für Bild- bzw. Importschritt
//   DRIVE_REMOTE / DRIVE_FOLDER       optional – rclone-Remote + Zielordner für die Bibliothek
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "../core/env.ts";
import { parseRecipe } from "../core/parse.ts";
import { slugifyTitle } from "../core/render.ts";

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

const DRIVE_REMOTE = (process.env.DRIVE_REMOTE ?? "drive").trim();
const DRIVE_FOLDER = (process.env.DRIVE_FOLDER ?? "Rezepte").trim();
// Vom Add-on gesetzt: nur dann gilt der lokale Speicher als transient (Janitor aktiv).
const MANAGED = process.env.RECIPE_BOT_MANAGED === "1";

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

async function sendDocument(
  chatId: number,
  filePath: string,
  caption: string,
  mime: string = "application/pdf",
): Promise<void> {
  const fd = new FormData();
  fd.append("chat_id", String(chatId));
  if (caption) fd.append("caption", caption);
  fd.append("document", new Blob([readFileSync(filePath)], { type: mime }), basename(filePath));
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

interface Recipe {
  title: string;
  slug: string;
  category: string; // Kategorie-Ordner (gespiegelt nach Drive)
  mdPath: string;
  pdfPath: string;
  imagePath?: string;
}

/** Import → Bild → PDF; liefert die Pfade des erzeugten Rezepts. */
function runPipeline(inputArg: string): Recipe {
  // --force: erneutes Senden überschreibt dasselbe Rezept (kein "-2"-Duplikat).
  const imp = node("scripts/import-photo.ts", [inputArg, "--force"]).out;
  const pathMatch = imp.match(/→\s*(.+\.md)\s*$/m);
  if (!pathMatch) throw new Error("Konnte das erzeugte Rezept nicht ermitteln.\n" + imp);
  const mdPath = join(ROOT, pathMatch[1].trim());
  node("scripts/gen-images.ts");
  node("scripts/cli.ts");
  const recipe = parseRecipe(mdPath);
  const title = recipe.meta.title;
  const slug = slugifyTitle(title);
  const imagePath = ["jpg", "png", "jpeg", "webp"]
    .map((e) => join(ROOT, "assets", `${slug}.${e}`))
    .find(existsSync);
  return {
    title,
    slug,
    category: basename(dirname(mdPath)), // lokaler Kategorie-Ordner, z. B. "salate"
    mdPath,
    pdfPath: join(ROOT, "out", basename(dirname(mdPath)), `${slug}.pdf`),
    imagePath,
  };
}

// ---- Bibliothek (Google Drive via rclone) ----

/** Prüft, ob rclone verfügbar ist und der konfigurierte Remote existiert. */
function driveConfigured(): boolean {
  try {
    const r = spawnSync("rclone", ["listremotes"], { encoding: "utf8" });
    if (r.status !== 0) return false;
    return (r.stdout ?? "").split(/\r?\n/).map((s) => s.trim()).includes(`${DRIVE_REMOTE}:`);
  } catch {
    return false;
  }
}

/** Lädt PDF und Rezept-.md getrennt nach <Folder>/pdf/<Kategorie> bzw. /md/<Kategorie>. */
function uploadToDrive(r: Recipe): void {
  // [lokale Datei, Typ-Unterordner] – das JPG wird bewusst nicht abgelegt.
  const uploads: Array<[string, string]> = [];
  if (existsSync(r.pdfPath)) uploads.push([r.pdfPath, "pdf"]);
  if (existsSync(r.mdPath)) uploads.push([r.mdPath, "md"]);
  if (uploads.length === 0) throw new Error("Keine Dateien zum Hochladen gefunden.");
  for (const [file, type] of uploads) {
    const sub = [DRIVE_FOLDER, type, r.category].filter(Boolean).join("/");
    const res = spawnSync("rclone", ["copy", file, `${DRIVE_REMOTE}:${sub}`], { encoding: "utf8" });
    if (res.status !== 0) throw new Error((res.stderr || "rclone-Fehler").trim().slice(0, 300));
  }
}

/** Entfernt die lokalen Arbeitsdateien eines Rezepts (Bibliothek liegt in Drive). */
function cleanupLocal(r: Recipe): void {
  const targets = [
    r.mdPath,
    r.pdfPath,
    r.imagePath,
    join(ROOT, ".cli-build", `${r.slug}.json`),
    join(ROOT, ".cli-build", `${r.slug}.typ`),
  ];
  for (const t of targets) {
    try {
      if (t && existsSync(t)) rmSync(t);
    } catch {
      /* ignore */
    }
  }
}

// Offene Speichern-Abfragen (callback_data → Rezept).
const pending = new Map<string, Recipe>();
let pendingSeq = 0;
// Chats, deren nächste Nachricht als Edit eines Rezepts behandelt wird (chatId → recipeId).
const pendingEdits = new Map<number, string>();

async function askSaveToLibrary(chatId: number, id: string): Promise<void> {
  await api("sendMessage", {
    chat_id: chatId,
    text: "📚 Wie geht es weiter?",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Speichern", callback_data: `save:${id}` },
          { text: "✏️ Bearbeiten", callback_data: `edit:${id}` },
          { text: "🗑 Verwerfen", callback_data: `skip:${id}` },
        ],
      ],
    },
  });
}

/** Schickt den aktuellen Markdown-Text zur Bearbeitung in den Chat. */
async function sendForEdit(chatId: number, r: Recipe): Promise<void> {
  const md = readFileSync(r.mdPath, "utf8");
  const hint =
    "✏️ Schicke die korrigierte Version zurück (als Nachricht oder .md-Datei). " +
    "Danach erhältst du die neue PDF.";
  if (md.length <= 3500) {
    await api("sendMessage", { chat_id: chatId, text: `${hint}\n\n${md}` });
  } else {
    await sendDocument(chatId, r.mdPath, hint, "text/markdown");
  }
}

async function editText(chatId: number, messageId: number, text: string): Promise<void> {
  try {
    await api("editMessageText", { chat_id: chatId, message_id: messageId, text });
  } catch (e) {
    console.error("editMessageText:", (e as Error).message);
  }
}

async function handle(msg: any): Promise<void> {
  if (!msg) return;
  const chatId = msg.chat.id as number;
  const userId = String(msg.from?.id ?? "");
  // Fail-closed: ohne konfigurierte Whitelist wird niemand zugelassen.
  if (!ALLOWED.includes(userId)) {
    await sendMessage(chatId, "⛔ Nicht autorisiert.");
    console.error(`Abgelehnt: nicht autorisierte User-ID ${userId || "(unbekannt)"}`);
    return;
  }

  // Telegram-Befehle (/start, /help …) nicht als Rezept verarbeiten.
  if (typeof msg.text === "string" && msg.text.trim().startsWith("/")) {
    await sendMessage(chatId, WELCOME);
    return;
  }

  // Edit-Modus: nächste Text-/.md-Antwort ersetzt den Rezepttext.
  const editId = pendingEdits.get(chatId);
  if (editId) {
    let newMd: string | undefined;
    if (msg.text) {
      newMd = msg.text;
    } else if (msg.document) {
      const name = (msg.document.file_name ?? "").toLowerCase();
      const mime = msg.document.mime_type ?? "";
      if (name.endsWith(".md") || mime === "text/markdown" || mime.startsWith("text/")) {
        const f = await downloadFile(msg.document.file_id);
        newMd = readFileSync(f, "utf8");
        try {
          rmSync(f);
        } catch {
          /* ignore */
        }
      }
    }
    if (newMd) {
      pendingEdits.delete(chatId);
      await processEdit(chatId, editId, newMd);
      return;
    }
    // anderer Inhalt (Foto …) → Edit abbrechen, normal weiterverarbeiten
    pendingEdits.delete(chatId);
    await sendMessage(chatId, "Edit abgebrochen – verarbeite als neue Eingabe.");
  }

  let inputArg: string | undefined;
  let tmpFile: string | undefined; // heruntergeladene Telegram-Datei → nach Verarbeitung löschen
  if (msg.photo) {
    tmpFile = await downloadFile(msg.photo[msg.photo.length - 1].file_id); // größte Auflösung
    inputArg = tmpFile;
  } else if (msg.document) {
    tmpFile = await downloadFile(msg.document.file_id);
    inputArg = tmpFile;
  } else if (msg.text) {
    inputArg = msg.text.trim();
  }
  if (!inputArg) {
    await sendMessage(chatId, "Bitte ein Foto, einen Link oder Rezepttext senden 📸🔗📝");
    return;
  }

  await sendMessage(chatId, "⏳ Verarbeite das Rezept …");
  let recipe: Recipe;
  try {
    recipe = runPipeline(inputArg);
  } catch (e) {
    await sendMessage(chatId, "❌ Fehler:\n" + String((e as Error).message).slice(0, 800));
    return;
  } finally {
    if (tmpFile && existsSync(tmpFile)) {
      try {
        rmSync(tmpFile);
      } catch {
        /* ignore */
      }
    }
  }
  try {
    await sendDocument(chatId, recipe.pdfPath, `✅ ${recipe.title}`);
  } catch (e) {
    await sendMessage(chatId, `Rezept „${recipe.title}" erstellt, aber PDF-Versand fehlschlug: ${(e as Error).message}`);
    return;
  }

  // Nach Ansicht des PDFs fragen, ob es in die Bibliothek (Drive) soll.
  if (driveConfigured()) {
    const id = String(++pendingSeq);
    pending.set(id, recipe);
    await askSaveToLibrary(chatId, id);
  }
}

/** Antwort auf die „In Bibliothek speichern?"-Abfrage. */
async function handleCallback(cq: any): Promise<void> {
  const userId = String(cq.from?.id ?? "");
  const chatId = cq.message?.chat?.id as number | undefined;
  const messageId = cq.message?.message_id as number | undefined;
  try {
    await api("answerCallbackQuery", { callback_query_id: cq.id });
  } catch {
    /* ignore */
  }
  if (!ALLOWED.includes(userId)) return;

  const [action, id] = String(cq.data ?? "").split(":");
  const recipe = pending.get(id);
  if (!recipe || chatId === undefined || messageId === undefined) {
    if (chatId !== undefined && messageId !== undefined) await editText(chatId, messageId, "Aktion abgelaufen.");
    return;
  }
  if (action === "save") {
    pending.delete(id);
    try {
      uploadToDrive(recipe);
      await editText(chatId, messageId, `📚 Gespeichert: ${DRIVE_FOLDER}/{pdf,md}/${recipe.category}`);
      cleanupLocal(recipe); // erst nach erfolgreichem Upload
    } catch (e) {
      await editText(chatId, messageId, "❌ Speichern fehlgeschlagen: " + String((e as Error).message).slice(0, 300));
    }
  } else if (action === "edit") {
    // Rezept im pending lassen; nächste Nachricht des Users wird als neuer MD-Text aufgefasst.
    pendingEdits.set(chatId, id);
    await editText(chatId, messageId, "✏️ Warte auf bearbeiteten Markdown-Text …");
    try {
      await api("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });
    } catch {
      /* ignore */
    }
    await sendForEdit(chatId, recipe);
  } else {
    pending.delete(id);
    cleanupLocal(recipe);
    await editText(chatId, messageId, "🗑 Nicht gespeichert.");
  }
}

/** Re-Render nach Edit: MD überschreiben, Bilder + PDF neu, dann erneut nachfragen. */
async function processEdit(chatId: number, recipeId: string, newMd: string): Promise<void> {
  const old = pending.get(recipeId);
  if (!old) {
    await sendMessage(chatId, "Edit-Sitzung abgelaufen.");
    return;
  }
  if (!newMd.includes("---") || !newMd.includes("title")) {
    await sendMessage(chatId, "❌ Der Text enthält kein gültiges Frontmatter – Edit abgebrochen.");
    return;
  }
  await sendMessage(chatId, "⏳ Aktualisiere und rendere neu …");
  try {
    writeFileSync(old.mdPath, newMd, "utf8");
    const parsed = parseRecipe(old.mdPath);
    const title = parsed.meta.title;
    const slug = slugifyTitle(title);
    const category = basename(dirname(old.mdPath));
    node("scripts/gen-images.ts");
    node("scripts/cli.ts");
    const imagePath = ["jpg", "png", "jpeg", "webp"]
      .map((e) => join(ROOT, "assets", `${slug}.${e}`))
      .find(existsSync);
    const updated: Recipe = {
      title,
      slug,
      category,
      mdPath: old.mdPath,
      pdfPath: join(ROOT, "out", category, `${slug}.pdf`),
      imagePath,
    };
    pending.set(recipeId, updated);
    await sendDocument(chatId, updated.pdfPath, `✅ ${updated.title}`);
    if (driveConfigured()) await askSaveToLibrary(chatId, recipeId);
  } catch (e) {
    await sendMessage(chatId, "❌ Edit fehlgeschlagen:\n" + String((e as Error).message).slice(0, 800));
    pending.delete(recipeId);
  }
}

// ---- Janitor: lokalen Speicher begrenzen (die Bibliothek liegt in Drive) ----
const HOUR = 60 * 60 * 1000;

function removeOlderThan(dir: string, ms: number): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const now = Date.now();
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      removeOlderThan(p, ms);
      continue;
    }
    try {
      if (now - statSync(p).mtimeMs > ms) rmSync(p);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Räumt transiente Dateien auf (Downloads, gerenderte PDFs/Build).
 * Ist die Bibliothek (Drive) aktiv, sind auch recipes/assets nur Arbeitskopien
 * → liegen gebliebene Waisen (unbeantwortete Abfragen) werden nach 24 h entfernt.
 */
function janitor(): void {
  if (!MANAGED) return; // außerhalb des Add-ons (z. B. lokal) niemals löschen
  try {
    removeOlderThan(join(ROOT, ".bot-tmp"), HOUR);
    removeOlderThan(join(ROOT, "out"), HOUR);
    removeOlderThan(join(ROOT, ".cli-build"), HOUR);
    if (driveConfigured()) {
      removeOlderThan(join(ROOT, "recipes"), 24 * HOUR);
      removeOlderThan(join(ROOT, "assets"), 24 * HOUR);
    }
  } catch (e) {
    console.error("janitor:", (e as Error).message);
  }
}

async function main(): Promise<void> {
  try {
    const me = (await api("getMe")) as { username: string };
    console.error(`Bot @${me.username} läuft (Long-Polling)${ALLOWED.length ? `, erlaubte User: ${ALLOWED.join(", ")}` : ""} …`);
  } catch (e) {
    console.error("getMe fehlgeschlagen, fahre trotzdem fort:", (e as Error).message);
  }
  if (ALLOWED.length === 0) {
    console.error("WARNUNG: keine ALLOWED_TELEGRAM_USERS gesetzt – es werden ALLE Nachrichten abgelehnt (fail-closed).");
  }
  console.error(
    driveConfigured()
      ? `Bibliothek aktiv: ${DRIVE_REMOTE}:${DRIVE_FOLDER}`
      : `Bibliothek inaktiv (kein rclone-Remote "${DRIVE_REMOTE}") – Speichern-Abfrage wird übersprungen.`,
  );

  // Aufräumen: beim Start und danach stündlich.
  janitor();
  setInterval(janitor, HOUR);

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
        if (u.callback_query) await handleCallback(u.callback_query);
        else await handle(u.message ?? u.channel_post);
      } catch (e) {
        console.error("update:", (e as Error).message);
      }
    }
  }
}

main();

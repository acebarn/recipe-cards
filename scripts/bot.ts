#!/usr/bin/env node
// Telegram-Bot (Long-Polling, dependency-frei): empfängt Foto / Link / Text,
// legt das Rezept über die gemeinsame Service-Schicht direkt in der SQLite-
// Bibliothek an (erscheint sofort im Web), generiert Bild + PDF und schickt die
// Karte zurück. Drive-Backup läuft über den gemeinsamen Sync-Worker (Web-Container).
//
// Konfiguration (Umgebung oder .env):
//   TELEGRAM_BOT_TOKEN       Pflicht – Token von @BotFather
//   ALLOWED_TELEGRAM_USERS   Komma-Liste erlaubter User-IDs (fail-closed: leer = niemand)
//   GEMINI_API_KEY           Import (Foto/Link/Text → Rezept)
//   PIXAZO_API_KEY           Aquarell-Bild (optional; sonst Platzhalter)
//   RECIPE_DB_PATH           SQLite-DB (geteilt mit der Web-App)
//   RECIPE_PROJECT_ROOT      Wurzel für Typst/Assets (im Container /app)
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { loadDotEnv } from "../core/env.ts";
import { getProjectRoot } from "../core/paths.ts";
import { parseRecipeFromString } from "../core/parse.ts";
import { renderCard, slugify } from "../core/render.ts";
import { generateAndStoreImage } from "../core/services/image-store.ts";
import {
  importRecipeMarkdown,
  resolveInput,
  type Input,
} from "../core/services/import-recipe.ts";
import {
  categoryDirForCategory,
  getRecipeBySlug,
  insertRecipe,
  softDeleteRecipe,
  toRecipe,
  uniqueSlug,
  updateRecipe,
} from "../core/services/library.ts";
import { queueStepMapping } from "../core/services/step-map.ts";
import { fetchReelCaption, isInstagramUrl } from "../core/services/reel.ts";
import { enqueueDelete, enqueueUpsert } from "../core/services/sync-queue.ts";
import { ensureTelegramUser } from "../core/services/users.ts";

const ROOT = getProjectRoot();
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

const GEMINI_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
const PIXAZO_KEY = process.env.PIXAZO_API_KEY;
// Nur im verwalteten Container werden transiente Arbeitsdateien aufgeräumt.
const MANAGED = process.env.RECIPE_BOT_MANAGED === "1";

const API = `https://api.telegram.org/bot${TOKEN}`;
const FILE_API = `https://api.telegram.org/file/bot${TOKEN}`;
const TMP = join(ROOT, ".bot-tmp");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const WELCOME =
  "👋 Schick mir einfach:\n" +
  "• ein 📸 Foto einer Rezeptseite (am besten als Datei für beste Qualität),\n" +
  "• einen 🔗 Rezept-Link,\n" +
  "• 🎬 einen Instagram-Reel-Link (Rezept in der Caption), oder\n" +
  "• 📝 Rezepttext.\n\n" +
  "Ich erstelle daraus eine A5-Rezeptkarte (PDF), lege das Rezept in der Bibliothek ab " +
  "(erscheint sofort im Web) und schicke dir die Karte zurück.\n" +
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

async function editText(chatId: number, messageId: number, text: string): Promise<void> {
  try {
    await api("editMessageText", { chat_id: chatId, message_id: messageId, text });
  } catch (e) {
    console.error("editMessageText:", (e as Error).message);
  }
}

// ---------------- Pipeline über die Shared-Services ----------------

/** Rendert die Karte des (gespeicherten) Rezepts und gibt den PDF-Pfad zurück. */
function renderPdf(slug: string): string {
  const stored = getRecipeBySlug(slug);
  if (!stored) throw new Error(`Rezept ${slug} nicht gefunden.`);
  return renderCard(toRecipe(stored), {
    projectRoot: ROOT,
    outDir: join(ROOT, "out"),
    scale: 1,
    slug,
  }).pdfPath;
}

/** Eingabe → Gemini → Rezept in der DB anlegen (+ Bild, Mapping, Drive-Upsert) → PDF. */
async function addRecipe(inputArg: string, createdBy: number): Promise<{ slug: string; title: string; pdfPath: string }> {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY fehlt – Import nicht möglich.");
  let input: Input | null;
  if (isInstagramUrl(inputArg)) {
    // Instagram-Reel: Caption holen → wie Text behandeln.
    const caption = await fetchReelCaption(inputArg);
    input = { mode: "text", text: caption, sourceUrl: inputArg, label: `Reel ${inputArg}` };
  } else {
    input = await resolveInput([inputArg]);
  }
  if (!input) throw new Error("Keine verwertbare Eingabe erkannt.");
  const markdown = await importRecipeMarkdown(input, { apiKey: GEMINI_KEY });
  const recipe = parseRecipeFromString(markdown, input.label);
  const slug = uniqueSlug(slugify(recipe));
  insertRecipe({
    recipe,
    markdownBody: markdown.endsWith("\n") ? markdown : markdown + "\n",
    slug,
    categoryDir: categoryDirForCategory(recipe.meta.category),
    createdBy,
  });
  // Bild SYNCHRON erzeugen, damit es in der PDF eingebettet ist.
  if (PIXAZO_KEY) {
    try {
      await generateAndStoreImage(recipe, slug, PIXAZO_KEY);
    } catch (e) {
      console.error(`Bildgenerierung (${slug}):`, (e as Error).message);
    }
  }
  queueStepMapping(recipe, slug, GEMINI_KEY); // Schritt→Zutat async
  enqueueUpsert(slug); // Drive-Backup über den Web-Worker
  return { slug, title: recipe.meta.title, pdfPath: renderPdf(slug) };
}

// Offene Aktionen (callback_data → slug). Edit-Modus pro Chat.
const pending = new Map<string, { slug: string; title: string }>();
let pendingSeq = 0;
const pendingEdits = new Map<number, string>(); // chatId → callback-id

async function askNext(chatId: number, id: string): Promise<void> {
  await api("sendMessage", {
    chat_id: chatId,
    text: "📚 In der Bibliothek gespeichert. Bearbeiten oder löschen?",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✏️ Bearbeiten", callback_data: `edit:${id}` },
          { text: "🗑 Löschen", callback_data: `del:${id}` },
        ],
      ],
    },
  });
}

async function sendForEdit(chatId: number, slug: string): Promise<void> {
  const stored = getRecipeBySlug(slug);
  if (!stored) return;
  const hint =
    "✏️ Schicke die korrigierte Version zurück (als Nachricht oder .md-Datei). Danach erhältst du die neue PDF.";
  if (stored.markdownBody.length <= 3500) {
    await api("sendMessage", { chat_id: chatId, text: `${hint}\n\n${stored.markdownBody}` });
  } else {
    const tmp = join(TMP, `${slug}.md`);
    mkdirSync(TMP, { recursive: true });
    writeFileSync(tmp, stored.markdownBody, "utf8");
    const fd = new FormData();
    fd.append("chat_id", String(chatId));
    fd.append("caption", hint);
    fd.append("document", new Blob([readFileSync(tmp)], { type: "text/markdown" }), `${slug}.md`);
    await fetch(`${API}/sendDocument`, { method: "POST", body: fd });
  }
}

async function handle(msg: any): Promise<void> {
  if (!msg) return;
  const chatId = msg.chat.id as number;
  const userId = String(msg.from?.id ?? "");
  if (!ALLOWED.includes(userId)) {
    await sendMessage(chatId, "⛔ Nicht autorisiert.");
    console.error(`Abgelehnt: nicht autorisierte User-ID ${userId || "(unbekannt)"}`);
    return;
  }

  if (typeof msg.text === "string" && msg.text.trim().startsWith("/")) {
    await sendMessage(chatId, WELCOME);
    return;
  }

  // Edit-Modus: nächste Text-/.md-Antwort ersetzt den Rezepttext.
  const editCbId = pendingEdits.get(chatId);
  if (editCbId) {
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
      await processEdit(chatId, editCbId, newMd);
      return;
    }
    pendingEdits.delete(chatId);
    await sendMessage(chatId, "Edit abgebrochen – verarbeite als neue Eingabe.");
  }

  let inputArg: string | undefined;
  let tmpFile: string | undefined;
  if (msg.photo) {
    tmpFile = await downloadFile(msg.photo[msg.photo.length - 1].file_id);
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
  let result: { slug: string; title: string; pdfPath: string };
  try {
    const user = ensureTelegramUser(userId, msg.from?.first_name);
    result = await addRecipe(inputArg, user.id);
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
    await sendDocument(chatId, result.pdfPath, `✅ ${result.title}`);
  } catch (e) {
    await sendMessage(chatId, `Rezept „${result.title}" gespeichert, aber PDF-Versand fehlschlug: ${(e as Error).message}`);
    return;
  }

  const id = String(++pendingSeq);
  pending.set(id, { slug: result.slug, title: result.title });
  await askNext(chatId, id);
}

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
  const entry = pending.get(id);
  if (!entry || chatId === undefined || messageId === undefined) {
    if (chatId !== undefined && messageId !== undefined) await editText(chatId, messageId, "Aktion abgelaufen.");
    return;
  }

  if (action === "edit") {
    pendingEdits.set(chatId, id);
    await editText(chatId, messageId, "✏️ Warte auf bearbeiteten Markdown-Text …");
    try {
      await api("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });
    } catch {
      /* ignore */
    }
    await sendForEdit(chatId, entry.slug);
  } else if (action === "del") {
    pending.delete(id);
    const ref = softDeleteRecipe(entry.slug);
    if (ref) enqueueDelete(ref);
    await editText(chatId, messageId, "🗑 Aus der Bibliothek gelöscht.");
  }
}

/** Re-Render nach Edit: DB aktualisieren, PDF neu, dann erneut nachfragen. */
async function processEdit(chatId: number, id: string, newMd: string): Promise<void> {
  const entry = pending.get(id);
  if (!entry) {
    await sendMessage(chatId, "Edit-Sitzung abgelaufen.");
    return;
  }
  await sendMessage(chatId, "⏳ Aktualisiere und rendere neu …");
  let recipe;
  try {
    recipe = parseRecipeFromString(newMd, entry.slug);
  } catch (e) {
    await sendMessage(chatId, "❌ Der Text enthält kein gültiges Frontmatter – Edit abgebrochen.");
    return;
  }
  try {
    const updated = updateRecipe(entry.slug, {
      recipe,
      markdownBody: newMd.endsWith("\n") ? newMd : newMd + "\n",
      categoryDir: categoryDirForCategory(recipe.meta.category),
    });
    if (!updated) {
      await sendMessage(chatId, "❌ Rezept nicht mehr in der Bibliothek.");
      pending.delete(id);
      return;
    }
    queueStepMapping(recipe, entry.slug, GEMINI_KEY);
    enqueueUpsert(entry.slug);
    pending.set(id, { slug: entry.slug, title: recipe.meta.title });
    await sendDocument(chatId, renderPdf(entry.slug), `✅ ${recipe.meta.title}`);
    await askNext(chatId, id);
  } catch (e) {
    await sendMessage(chatId, "❌ Edit fehlgeschlagen:\n" + String((e as Error).message).slice(0, 800));
  }
}

// ---- Janitor: nur transiente Arbeitsdateien (Bibliothek liegt in SQLite, Assets bleiben) ----
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

function janitor(): void {
  if (!MANAGED) return;
  // Nur Transientes: Downloads, gerenderte PDFs, Typst-Build. NICHT assets/ (Web serviert sie).
  removeOlderThan(TMP, HOUR);
  removeOlderThan(join(ROOT, "out"), HOUR);
  removeOlderThan(join(ROOT, ".cli-build"), HOUR);
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
  if (!GEMINI_KEY) console.error("WARNUNG: GEMINI_API_KEY fehlt – Importe schlagen fehl.");
  console.error("Bibliothek: SQLite (geteilt mit der Web-App); Drive-Backup über den Web-Sync-Worker.");

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

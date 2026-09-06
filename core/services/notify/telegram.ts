// Telegram-Anbindung: schickt Benachrichtigungen über die Bot-API.
//
// Bewusst ohne Bibliothek und ohne eigenen Prozess — ein fetch auf api.telegram.org
// genügt. Eingehende Nachrichten kommen per Webhook in die App (siehe
// src/routes/api/telegram), es läuft also kein Polling-Dienst wie beim früheren
// Rezept-Bot.
const API = "https://api.telegram.org";

export const botToken = (): string => process.env.TELEGRAM_BOT_TOKEN ?? "";
export const botUsername = (): string => process.env.TELEGRAM_BOT_USERNAME ?? "";
export const telegramConfigured = (): boolean => !!botToken();

/** HTML-Sonderzeichen für Telegrams parse_mode="HTML" entschärfen. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Nachricht an einen Chat schicken. Wirft nie — eine gescheiterte
 * Benachrichtigung darf weder eine Anmeldung noch ein Feedback verhindern.
 */
export async function sendTelegram(chatId: string, html: string): Promise<boolean> {
  const token = botToken();
  if (!token) return false;
  try {
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`Telegram ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("Telegram nicht erreichbar:", (e as Error).message);
    return false;
  }
}

/** Webhook bei Telegram registrieren (idempotent). */
export async function setWebhook(url: string, secret: string): Promise<string> {
  const token = botToken();
  if (!token) return "kein TELEGRAM_BOT_TOKEN gesetzt";
  const res = await fetch(`${API}/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: secret,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    }),
  });
  return (await res.text()).slice(0, 300);
}

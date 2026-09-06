import { consumeLinkCode } from "$core/services/notify/targets.ts";
import { escapeHtml, sendTelegram } from "$core/services/notify/telegram.ts";
import { getUserById } from "$core/services/users.ts";
import { json, text, type RequestHandler } from "@sveltejs/kit";

/**
 * Telegram-Webhook. Telegram schickt Updates hierher, statt dass ein eigener
 * Bot-Prozess pollt — der frühere Rezept-Bot-Container ist genau deshalb weg.
 *
 * Absicherung: Telegram sendet bei jedem Aufruf den bei setWebhook hinterlegten
 * Wert im Header X-Telegram-Bot-Api-Secret-Token. Ohne passenden Wert wird der
 * Aufruf abgewiesen — die Route liegt öffentlich (der Auth-Hook lässt sie
 * durch, weil Telegram sich nicht anmelden kann).
 */
interface Update {
  message?: {
    chat?: { id?: number | string; first_name?: string; username?: string };
    from?: { first_name?: string; username?: string };
    text?: string;
  };
}

export const POST: RequestHandler = async ({ request }) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return text("nein", { status: 403 });
  }

  let update: Update;
  try {
    update = (await request.json()) as Update;
  } catch {
    return json({ ok: true }); // kaputtes Update: bestätigen, sonst wiederholt Telegram ewig
  }

  const chatId = update.message?.chat?.id;
  const nachricht = (update.message?.text ?? "").trim();
  if (chatId == null || !nachricht) return json({ ok: true });

  const chat = String(chatId);
  const absender =
    update.message?.from?.first_name ?? update.message?.chat?.first_name ?? "unbekannt";

  // /start <code> — Verknüpfung aus den Einstellungen abschließen.
  const start = /^\/start(?:@\w+)?(?:\s+(\S+))?$/.exec(nachricht);
  if (start) {
    const code = start[1];
    if (!code) {
      await sendTelegram(
        chat,
        "Hallo! Damit ich dich benachrichtigen kann, öffne bitte in SCHMACKOFATZ " +
          "<b>Einstellungen \u2192 Benachrichtigungen</b> und tippe dort auf \u201eTelegram verbinden\u201c.",
      );
      return json({ ok: true });
    }
    const userId = consumeLinkCode(code, chat, absender);
    if (userId == null) {
      await sendTelegram(
        chat,
        "Dieser Verknüpfungs-Link ist abgelaufen. Bitte in den Einstellungen einen neuen erzeugen.",
      );
      return json({ ok: true });
    }
    const user = getUserById(userId);
    await sendTelegram(
      chat,
      `✅ Verbunden${user?.name ? ` als <b>${escapeHtml(user.name)}</b>` : ""}. ` +
        "Du bekommst ab jetzt Freigabe-Anfragen und Rückmeldungen aus SCHMACKOFATZ hier her.",
    );
    return json({ ok: true });
  }

  // Alles andere: kurz erklären, was der Bot kann.
  await sendTelegram(
    chat,
    "Ich melde nur Freigabe-Anfragen und Rückmeldungen aus SCHMACKOFATZ. " +
      "Rezepte pflegst du direkt in der App: https://recipes.alessiobisgen.de",
  );
  return json({ ok: true });
};

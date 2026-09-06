import { listFeedback, setFeedbackStatus } from "$core/services/feedback.ts";
import {
  createLinkCode,
  listTargets,
  notifyAll,
  purgeStaleLinks,
  removeTarget,
  targetForUser,
} from "$core/services/notify/targets.ts";
import { botUsername, escapeHtml, telegramConfigured } from "$core/services/notify/telegram.ts";
import { getUserById } from "$core/services/users.ts";
import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

// Der Auth-Hook lässt /admin/* nur für Admins durch — hier reicht die
// Anmeldeprüfung als Absicherung gegen direkte Aufrufe ohne Nutzer.
function requireUser(locals: App.Locals) {
  if (!locals.user) throw error(401, "Nicht angemeldet.");
  return locals.user;
}

export const load: PageServerLoad = ({ locals }) => {
  const user = requireUser(locals);
  purgeStaleLinks();
  return {
    configured: telegramConfigured(),
    botUsername: botUsername(),
    selbstVerbunden: !!targetForUser(user.id),
    targets: listTargets().map((t) => ({
      id: t.id,
      label: t.label,
      chatId: t.chatId,
      person: t.userId ? (getUserById(t.userId)?.name ?? getUserById(t.userId)?.email ?? null) : null,
      createdAt: t.createdAt,
    })),
    feedback: listFeedback(),
  };
};

export const actions: Actions = {
  // Einmal-Code erzeugen; die Seite baut daraus den t.me-Deeplink.
  verknuepfen: async ({ locals }) => {
    const user = requireUser(locals);
    if (!telegramConfigured()) return fail(400, { error: "Kein TELEGRAM_BOT_TOKEN konfiguriert." });
    return { code: createLinkCode(user.id) };
  },

  entfernen: async ({ request, locals }) => {
    requireUser(locals);
    const id = Number((await request.formData()).get("id"));
    if (!Number.isInteger(id)) return fail(400, { error: "Ungültiger Eintrag." });
    removeTarget(id);
    return { ok: "Empfänger entfernt." };
  },

  test: async ({ locals }) => {
    const user = requireUser(locals);
    const gesendet = await notifyAll(
      `🔔 <b>Testnachricht</b>\nAusgelöst von ${escapeHtml(user.name ?? user.email)}. ` +
        "Wenn du das liest, funktionieren die Benachrichtigungen.",
    );
    return gesendet > 0
      ? { ok: `Testnachricht an ${gesendet} Empfänger geschickt.` }
      : fail(502, { error: "Nichts zugestellt — ist jemand verbunden und der Bot erreichbar?" });
  },

  erledigt: async ({ request, locals }) => {
    requireUser(locals);
    const data = await request.formData();
    const id = Number(data.get("id"));
    const zurueck = String(data.get("zurueck") ?? "") === "1";
    if (!Number.isInteger(id)) return fail(400, { error: "Ungültiger Eintrag." });
    setFeedbackStatus(id, zurueck ? "neu" : "erledigt");
    return { ok: true };
  },
};

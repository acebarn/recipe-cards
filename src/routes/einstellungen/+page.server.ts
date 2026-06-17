import { hasCalendarAccess } from "$core/services/calendar/settings.ts";
import {
  getBringAccount,
  linkBringAccount,
  listBringLists,
  setBringList,
  unlinkBringAccount,
} from "$core/services/shopping/account.ts";
import { isAdmin } from "$core/services/users.ts";
import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const user = locals.user;
  if (!user) throw error(401, "Nicht angemeldet.");

  const bring = getBringAccount(user.id);
  let bringLists: { listUuid: string; name: string }[] = [];
  let bringError: string | undefined;
  if (bring) {
    try {
      bringLists = await listBringLists(user.id);
    } catch (e) {
      bringError = (e as Error).message;
    }
  }

  return {
    isAdmin: isAdmin(user),
    calendarConnected: hasCalendarAccess(user.id),
    bring: bring ? { email: bring.email, listUuid: bring.listUuid ?? null, listName: bring.listName ?? null } : null,
    bringLists,
    bringError,
  };
};

function requireUser(locals: App.Locals): number {
  if (!locals.user) throw error(401, "Nicht angemeldet.");
  return locals.user.id;
}

export const actions: Actions = {
  linkBring: async ({ request, locals }) => {
    const userId = requireUser(locals);
    const data = await request.formData();
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    if (!email || !password) return fail(400, { error: "E-Mail und Passwort angeben." });
    try {
      const lists = await linkBringAccount(userId, email, password);
      if (lists.length === 1) setBringList(userId, lists[0].listUuid, lists[0].name);
      return { ok: "Bring-Konto verknüpft." };
    } catch (e) {
      return fail(400, { error: (e as Error).message });
    }
  },

  selectBringList: async ({ request, locals }) => {
    const userId = requireUser(locals);
    const data = await request.formData();
    const listUuid = String(data.get("listUuid") ?? "");
    const listName = String(data.get("listName") ?? "");
    if (!listUuid) return fail(400, { error: "Keine Liste gewählt." });
    setBringList(userId, listUuid, listName);
    return { ok: `Liste „${listName}" aktiviert.` };
  },

  unlinkBring: async ({ locals }) => {
    unlinkBringAccount(requireUser(locals));
    return { ok: "Bring-Konto getrennt." };
  },
};

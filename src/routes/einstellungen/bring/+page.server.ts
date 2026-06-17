import {
  getBringAccount,
  linkBringAccount,
  listBringLists,
  setBringList,
  unlinkBringAccount,
} from "$core/services/shopping/account.ts";
import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const user = locals.user;
  if (!user) throw error(401, "Nicht angemeldet.");

  const acc = getBringAccount(user.id);
  if (!acc) return { linked: false as const };

  try {
    const lists = await listBringLists(user.id);
    return { linked: true as const, email: acc.email, listUuid: acc.listUuid ?? null, listName: acc.listName ?? null, lists };
  } catch (e) {
    return {
      linked: true as const,
      email: acc.email,
      listUuid: acc.listUuid ?? null,
      listName: acc.listName ?? null,
      lists: [],
      error: (e as Error).message,
    };
  }
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

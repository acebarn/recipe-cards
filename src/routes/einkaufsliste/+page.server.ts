import { AISLE_ORDER, foodCategory } from "$core/food-category.ts";
import {
  getBringAccount,
  getBringProvider,
  linkBringAccount,
  listBringLists,
  setBringList,
  unlinkBringAccount,
} from "$core/services/shopping/account.ts";
import { addStandard, listStandard, removeStandard } from "$core/services/shopping/standard.ts";
import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const user = locals.user;
  if (!user) throw error(401, "Nicht angemeldet.");

  const acc = getBringAccount(user.id);
  if (!acc) return { linked: false as const };

  // Verknüpft, aber noch keine Liste gewählt → Auswahl anbieten.
  if (!acc.listUuid) {
    try {
      const lists = await listBringLists(user.id);
      return { linked: true as const, hasList: false as const, email: acc.email, lists };
    } catch (e) {
      return { linked: true as const, hasList: false as const, email: acc.email, lists: [], error: (e as Error).message };
    }
  }

  const provider = getBringProvider(user.id)!;
  const standard = listStandard(user.id);
  try {
    const items = await provider.list();
    const open = items.filter((i) => !i.done);
    const groups = AISLE_ORDER.map((aisle) => ({
      aisle,
      items: open
        .filter((i) => foodCategory(i.name) === aisle)
        .map((i) => ({ name: i.name, quantity: i.quantity })),
    })).filter((g) => g.items.length > 0);
    const doneItems = items.filter((i) => i.done).map((i) => ({ name: i.name, quantity: i.quantity }));
    return {
      linked: true as const,
      hasList: true as const,
      email: acc.email,
      listName: acc.listName ?? "",
      groups,
      doneItems,
      standard,
    };
  } catch (e) {
    return {
      linked: true as const,
      hasList: true as const,
      email: acc.email,
      listName: acc.listName ?? "",
      groups: [],
      doneItems: [],
      standard,
      error: (e as Error).message,
    };
  }
};

function requireUser(locals: App.Locals): number {
  if (!locals.user) throw error(401, "Nicht angemeldet.");
  return locals.user.id;
}

export const actions: Actions = {
  linkAccount: async ({ request, locals }) => {
    const userId = requireUser(locals);
    const data = await request.formData();
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    if (!email || !password) return fail(400, { error: "E-Mail und Passwort angeben." });
    try {
      const lists = await linkBringAccount(userId, email, password);
      // Komfort: gibt es genau eine Liste, direkt aktivieren.
      if (lists.length === 1) setBringList(userId, lists[0].listUuid, lists[0].name);
      return { ok: "Bring-Konto verknüpft." };
    } catch (e) {
      return fail(400, { error: (e as Error).message });
    }
  },

  selectList: async ({ request, locals }) => {
    const userId = requireUser(locals);
    const data = await request.formData();
    const listUuid = String(data.get("listUuid") ?? "");
    const listName = String(data.get("listName") ?? "");
    if (!listUuid) return fail(400, { error: "Keine Liste gewählt." });
    setBringList(userId, listUuid, listName);
    return { ok: `Liste „${listName}" aktiviert.` };
  },

  unlink: async ({ locals }) => {
    unlinkBringAccount(requireUser(locals));
    return { ok: "Bring-Konto getrennt." };
  },

  addItem: async ({ request, locals }) => {
    const userId = requireUser(locals);
    const data = await request.formData();
    const name = String(data.get("name") ?? "").trim();
    const quantity = String(data.get("quantity") ?? "").trim();
    if (!name) return fail(400, { error: "Name angeben." });
    const provider = getBringProvider(userId);
    if (!provider) return fail(400, { error: "Keine Bring-Liste gewählt." });
    try {
      await provider.add(name, quantity);
      return { ok: `„${name}" hinzugefügt.` };
    } catch (e) {
      return fail(502, { error: (e as Error).message });
    }
  },

  updateItem: async ({ request, locals }) => {
    const userId = requireUser(locals);
    const data = await request.formData();
    const name = String(data.get("name") ?? "");
    const newName = String(data.get("newName") ?? "").trim();
    const quantity = String(data.get("quantity") ?? "").trim();
    const provider = getBringProvider(userId);
    if (!provider) return fail(400, { error: "Keine Bring-Liste gewählt." });
    try {
      await provider.update(name, { quantity, newName: newName || undefined });
      return { ok: "Aktualisiert." };
    } catch (e) {
      return fail(502, { error: (e as Error).message });
    }
  },

  toggle: async ({ request, locals }) => {
    const userId = requireUser(locals);
    const data = await request.formData();
    const name = String(data.get("name") ?? "");
    const done = String(data.get("done") ?? "") === "true";
    const quantity = String(data.get("quantity") ?? "");
    const provider = getBringProvider(userId);
    if (!provider) return fail(400, { error: "Keine Bring-Liste gewählt." });
    try {
      await provider.setDone(name, done, quantity);
      return { ok: "" };
    } catch (e) {
      return fail(502, { error: (e as Error).message });
    }
  },

  removeItem: async ({ request, locals }) => {
    const userId = requireUser(locals);
    const name = String((await request.formData()).get("name") ?? "");
    const provider = getBringProvider(userId);
    if (!provider) return fail(400, { error: "Keine Bring-Liste gewählt." });
    try {
      await provider.remove(name);
      return { ok: `„${name}" entfernt.` };
    } catch (e) {
      return fail(502, { error: (e as Error).message });
    }
  },

  addStandard: async ({ request, locals }) => {
    const userId = requireUser(locals);
    const name = String((await request.formData()).get("name") ?? "").trim();
    if (!name) return fail(400, { error: "Name angeben." });
    addStandard(userId, name);
    return { ok: `„${name}" ist jetzt Standardzutat.` };
  },

  removeStandard: async ({ request, locals }) => {
    const userId = requireUser(locals);
    const id = Number((await request.formData()).get("id"));
    if (id) removeStandard(userId, id);
    return { ok: "Standardzutat entfernt." };
  },

  quickAddStandard: async ({ request, locals }) => {
    const userId = requireUser(locals);
    const name = String((await request.formData()).get("name") ?? "").trim();
    if (!name) return fail(400, { error: "Name angeben." });
    const provider = getBringProvider(userId);
    if (!provider) return fail(400, { error: "Keine Bring-Liste gewählt." });
    try {
      await provider.add(name, "");
      return { ok: `„${name}" auf die Liste gesetzt.` };
    } catch (e) {
      return fail(502, { error: (e as Error).message });
    }
  },
};

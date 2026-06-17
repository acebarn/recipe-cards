import { AISLE_ORDER, foodCategory } from "$core/food-category.ts";
import { getBringAccount, getBringProvider } from "$core/services/shopping/account.ts";
import { addStandard, listStandard, removeStandard } from "$core/services/shopping/standard.ts";
import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const user = locals.user;
  if (!user) throw error(401, "Nicht angemeldet.");

  const acc = getBringAccount(user.id);
  if (!acc) return { linked: false as const };

  // Verknüpft, aber noch keine Liste gewählt → in den Einstellungen wählen.
  if (!acc.listUuid) {
    return { linked: true as const, hasList: false as const, email: acc.email };
  }

  const standard = listStandard(user.id);
  let provider;
  try {
    provider = getBringProvider(user.id)!;
  } catch {
    // Entschlüsselung des Bring-Passworts gescheitert (z. B. nach AUTH_SECRET-Rotation).
    return {
      linked: true as const,
      hasList: true as const,
      email: acc.email,
      listName: acc.listName ?? "",
      groups: [],
      doneItems: [],
      doneHidden: 0,
      standard,
      error:
        "Dein gespeichertes Bring-Passwort konnte nicht entschlüsselt werden (evtl. nach einem Server-Update). Bitte das Konto trennen und neu verknüpfen.",
    };
  }
  const DONE_LIMIT = 30; // Bring-„recently" kann sehr lang werden → nur die neuesten zeigen.
  try {
    const items = await provider.list();
    const open = items.filter((i) => !i.done);
    const groups = AISLE_ORDER.map((aisle) => ({
      aisle,
      items: open
        .filter((i) => foodCategory(i.name) === aisle)
        .map((i) => ({ name: i.name, quantity: i.quantity })),
    })).filter((g) => g.items.length > 0);
    const done = items.filter((i) => i.done);
    const doneItems = done.slice(0, DONE_LIMIT).map((i) => ({ name: i.name, quantity: i.quantity }));
    return {
      linked: true as const,
      hasList: true as const,
      email: acc.email,
      listName: acc.listName ?? "",
      groups,
      doneItems,
      doneHidden: Math.max(0, done.length - DONE_LIMIT),
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
      doneHidden: 0,
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

import {
  addMember,
  getHousehold,
  leaveHousehold,
  listAddableUsers,
  listMembers,
  removeMember,
  renameHousehold,
} from "$core/services/inventory/household.ts";
import { getUserById } from "$core/services/users.ts";
import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => {
  const user = locals.user;
  if (!user) throw error(401, "Nicht angemeldet.");
  const household = getHousehold(user.id);
  const members = listMembers(household.id);
  return {
    name: household.name,
    isCreator: household.createdBy === user.id,
    me: user.id,
    members,
    candidates: listAddableUsers(user.id),
  };
};

function requireUser(locals: App.Locals): number {
  if (!locals.user) throw error(401, "Nicht angemeldet.");
  return locals.user.id;
}

export const actions: Actions = {
  rename: async ({ request, locals }) => {
    const userId = requireUser(locals);
    const name = String((await request.formData()).get("name") ?? "").trim();
    if (!name) return fail(400, { error: "Name angeben." });
    renameHousehold(userId, name);
    return { ok: "Haushalt umbenannt." };
  },

  add: async ({ request, locals }) => {
    const userId = requireUser(locals);
    const id = Number((await request.formData()).get("id"));
    const target = id ? getUserById(id) : null;
    if (!target) return fail(400, { error: "Unbekannter Nutzer." });
    try {
      const m = addMember(userId, target.email);
      return { ok: `${m.name} ist jetzt im Haushalt.` };
    } catch (e) {
      return fail(400, { error: (e as Error).message });
    }
  },

  remove: async ({ request, locals }) => {
    const userId = requireUser(locals);
    const id = Number((await request.formData()).get("id"));
    if (!id) return fail(400, { error: "Unbekanntes Mitglied." });
    try {
      removeMember(userId, id);
      return { ok: "Mitglied entfernt." };
    } catch (e) {
      return fail(400, { error: (e as Error).message });
    }
  },

  leave: async ({ locals }) => {
    const userId = requireUser(locals);
    leaveHousehold(userId);
    return { ok: "Du hast den Haushalt verlassen. Es wurde ein neuer persönlicher Haushalt angelegt." };
  },
};

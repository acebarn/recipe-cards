import {
  getUserById,
  inviteUser,
  listUsers,
  setUserRole,
  setUserStatus,
} from "$core/services/users.ts";
import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => {
  return {
    users: listUsers().map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name ?? null,
      role: u.role,
      status: u.status,
      linked: !!u.googleSub,
      lastLoginAt: u.lastLoginAt ?? null,
    })),
    me: locals.user?.id,
  };
};

const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

export const actions: Actions = {
  invite: async ({ request, locals }) => {
    const data = await request.formData();
    const email = String(data.get("email") ?? "").trim().toLowerCase();
    if (!isEmail(email)) return fail(400, { error: "Bitte eine gültige E-Mail eingeben." });
    inviteUser(email, locals.user?.id);
    return { ok: `${email} eingeladen (freigegeben).` };
  },
  approve: async ({ request }) => {
    const id = Number((await request.formData()).get("id"));
    if (id) setUserStatus(id, "approved");
    return { ok: "Freigegeben." };
  },
  block: async ({ request, locals }) => {
    const id = Number((await request.formData()).get("id"));
    if (id === locals.user?.id) return fail(400, { error: "Du kannst dich nicht selbst sperren." });
    if (id) setUserStatus(id, "blocked");
    return { ok: "Gesperrt." };
  },
  makeAdmin: async ({ request }) => {
    const id = Number((await request.formData()).get("id"));
    const target = id ? getUserById(id) : null;
    if (!target) return fail(404, { error: "Nutzer nicht gefunden." });
    if (target.role === "owner") return fail(400, { error: "Der Owner ist bereits Admin." });
    setUserRole(id, "admin");
    return { ok: `${target.name ?? target.email} ist jetzt Admin.` };
  },
  revokeAdmin: async ({ request, locals }) => {
    const id = Number((await request.formData()).get("id"));
    const target = id ? getUserById(id) : null;
    if (!target) return fail(404, { error: "Nutzer nicht gefunden." });
    if (target.role === "owner") return fail(400, { error: "Dem Owner kann der Admin-Status nicht entzogen werden." });
    if (id === locals.user?.id) return fail(400, { error: "Du kannst dir den Admin-Status nicht selbst entziehen." });
    setUserRole(id, "member");
    return { ok: `${target.name ?? target.email} ist jetzt Mitglied.` };
  },
};

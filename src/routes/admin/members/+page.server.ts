import {
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
  promote: async ({ request }) => {
    const id = Number((await request.formData()).get("id"));
    if (id) setUserRole(id, "owner");
    return { ok: "Zum Owner gemacht." };
  },
  demote: async ({ request, locals }) => {
    const id = Number((await request.formData()).get("id"));
    if (id === locals.user?.id) return fail(400, { error: "Du kannst dich nicht selbst zurückstufen." });
    if (id) setUserRole(id, "member");
    return { ok: "Zu Mitglied gemacht." };
  },
};

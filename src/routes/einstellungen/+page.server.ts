import { hasCalendarAccess } from "$core/services/calendar/settings.ts";
import { getBringAccount } from "$core/services/shopping/account.ts";
import { isAdmin } from "$core/services/users.ts";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => {
  const user = locals.user;
  if (!user) throw error(401, "Nicht angemeldet.");
  return {
    isAdmin: isAdmin(user),
    bringLinked: !!getBringAccount(user.id),
    calendarConnected: hasCalendarAccess(user.id),
  };
};

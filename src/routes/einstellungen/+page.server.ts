import { hasCalendarAccess } from "$core/services/calendar/settings.ts";
import { getBringAccount } from "$core/services/shopping/account.ts";
import { getHousehold, getHouseholdId, listMembers } from "$core/services/inventory/household.ts";
import { isInventoryEnabled, setInventoryEnabled } from "$core/services/inventory/settings.ts";
import { isImportRetryEnabled, setImportRetryEnabled } from "$core/services/import-queue.ts";
import { isAdmin } from "$core/services/users.ts";
import { error } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => {
  const user = locals.user;
  if (!user) throw error(401, "Nicht angemeldet.");
  return {
    isAdmin: isAdmin(user),
    bringLinked: !!getBringAccount(user.id),
    calendarConnected: hasCalendarAccess(user.id),
    inventoryEnabled: isInventoryEnabled(user.id),
    importRetryEnabled: isImportRetryEnabled(user.id),
    householdName: getHousehold(user.id).name,
    memberCount: listMembers(getHouseholdId(user.id)).length,
  };
};

export const actions: Actions = {
  toggleInventory: async ({ request, locals }) => {
    if (!locals.user) throw error(401, "Nicht angemeldet.");
    const enabled = String((await request.formData()).get("enabled") ?? "") === "1";
    setInventoryEnabled(locals.user.id, enabled);
    return { ok: true };
  },

  toggleImportRetry: async ({ request, locals }) => {
    if (!locals.user) throw error(401, "Nicht angemeldet.");
    const enabled = String((await request.formData()).get("enabled") ?? "") === "1";
    setImportRetryEnabled(locals.user.id, enabled);
    return { ok: true };
  },
};

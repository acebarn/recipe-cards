import { normalizeName } from "$core/ingredient-parse.ts";
import { getBringProvider } from "$core/services/shopping/account.ts";
import { getHousehold, getHouseholdId, listMembers } from "$core/services/inventory/household.ts";
import {
  addItem,
  listItems,
  removeItem,
  updateItem,
  type InventoryItem,
  type InventoryLocation,
} from "$core/services/inventory/inventory.ts";
import {
  addGroup,
  deleteGroup,
  listGroups,
  renameGroup,
  suggestGroup,
} from "$core/services/inventory/groups.ts";
import { addTemplate, listTemplates, removeTemplate } from "$core/services/inventory/templates.ts";
import { isInventoryEnabled, setInventoryEnabled } from "$core/services/inventory/settings.ts";
import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

const loc = (v: FormDataEntryValue | null): InventoryLocation =>
  String(v) === "freezer" ? "freezer" : "pantry";

/** Posten eines Bereichs nach Gruppe bündeln (in Gruppen-Reihenfolge, Rest am Ende). */
function byGroup(items: InventoryItem[], groupOrder: string[]) {
  const buckets = new Map<string, InventoryItem[]>();
  for (const it of items) {
    const key = it.group ?? "Ohne Gruppe";
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(it);
  }
  const order = [...groupOrder, "Ohne Gruppe"];
  return [...buckets.entries()]
    .sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    })
    .map(([group, list]) => ({ group, items: list }));
}

export const load: PageServerLoad = async ({ locals }) => {
  const user = locals.user;
  if (!user) throw error(401, "Nicht angemeldet.");

  if (!isInventoryEnabled(user.id)) {
    return { enabled: false as const };
  }

  const householdId = getHouseholdId(user.id);
  const household = getHousehold(user.id);
  const members = listMembers(householdId);
  const groups = listGroups(householdId);
  const groupNames = groups.map((g) => g.name);
  const items = listItems(householdId);
  const templates = listTemplates(householdId);

  // Vorschläge aus zuletzt abgehakten (= eingekauften) Bring-Posten, ohne schon Vorrätiges.
  const have = new Set(items.map((i) => i.normalized));
  let recentlyBought: string[] = [];
  try {
    const provider = getBringProvider(user.id);
    if (provider) {
      const seen = new Set<string>();
      for (const i of await provider.list()) {
        if (!i.done) continue;
        const norm = normalizeName(i.name);
        if (have.has(norm) || seen.has(norm)) continue;
        seen.add(norm);
        recentlyBought.push(i.name);
        if (recentlyBought.length >= 20) break;
      }
    }
  } catch {
    recentlyBought = []; // Bring nicht erreichbar → einfach keine Vorschläge.
  }

  return {
    enabled: true as const,
    householdName: household.name,
    memberCount: members.length,
    groups,
    groupNames,
    templates,
    recentlyBought,
    pantry: byGroup(
      items.filter((i) => i.location === "pantry"),
      groupNames,
    ),
    freezer: byGroup(
      items.filter((i) => i.location === "freezer"),
      groupNames,
    ),
  };
};

function requireUser(locals: App.Locals): number {
  if (!locals.user) throw error(401, "Nicht angemeldet.");
  return locals.user.id;
}

export const actions: Actions = {
  toggleEnabled: async ({ request, locals }) => {
    const userId = requireUser(locals);
    const enabled = String((await request.formData()).get("enabled") ?? "") === "1";
    setInventoryEnabled(userId, enabled);
    return { ok: enabled ? "Inventar aktiviert." : "Inventar deaktiviert." };
  },

  addItem: async ({ request, locals }) => {
    const userId = requireUser(locals);
    const householdId = getHouseholdId(userId);
    const data = await request.formData();
    const name = String(data.get("name") ?? "").trim();
    if (!name) return fail(400, { error: "Name angeben." });
    const group = String(data.get("group") ?? "").trim() || suggestGroup(householdId, name);
    addItem(householdId, {
      name,
      quantity: String(data.get("quantity") ?? ""),
      location: loc(data.get("location")),
      group,
      userId,
    });
    return { ok: `„${name}" im Vorrat ergänzt.` };
  },

  updateItem: async ({ request, locals }) => {
    const userId = requireUser(locals);
    const householdId = getHouseholdId(userId);
    const data = await request.formData();
    const id = Number(data.get("id"));
    if (!id) return fail(400, { error: "Unbekannter Posten." });
    updateItem(householdId, id, {
      quantity: String(data.get("quantity") ?? ""),
      group: String(data.get("group") ?? "").trim() || null,
      userId,
    });
    return { ok: "Aktualisiert." };
  },

  removeItem: async ({ request, locals }) => {
    const householdId = getHouseholdId(requireUser(locals));
    const id = Number((await request.formData()).get("id"));
    if (id) removeItem(householdId, id);
    return { ok: "Entfernt." };
  },

  addTemplate: async ({ request, locals }) => {
    const householdId = getHouseholdId(requireUser(locals));
    const data = await request.formData();
    const name = String(data.get("name") ?? "").trim();
    if (!name) return fail(400, { error: "Name angeben." });
    addTemplate(householdId, {
      name,
      group: String(data.get("group") ?? "").trim() || null,
      defaultLocation: loc(data.get("location")),
    });
    return { ok: `„${name}" als Standardartikel gespeichert.` };
  },

  removeTemplate: async ({ request, locals }) => {
    const householdId = getHouseholdId(requireUser(locals));
    const id = Number((await request.formData()).get("id"));
    if (id) removeTemplate(householdId, id);
    return { ok: "Standardartikel entfernt." };
  },

  addGroup: async ({ request, locals }) => {
    const householdId = getHouseholdId(requireUser(locals));
    const name = String((await request.formData()).get("name") ?? "").trim();
    if (!name) return fail(400, { error: "Name angeben." });
    addGroup(householdId, name);
    return { ok: `Gruppe „${name}" angelegt.` };
  },

  renameGroup: async ({ request, locals }) => {
    const householdId = getHouseholdId(requireUser(locals));
    const data = await request.formData();
    const id = Number(data.get("id"));
    const name = String(data.get("name") ?? "").trim();
    if (id && name) renameGroup(householdId, id, name);
    return { ok: "Gruppe umbenannt." };
  },

  deleteGroup: async ({ request, locals }) => {
    const householdId = getHouseholdId(requireUser(locals));
    const id = Number((await request.formData()).get("id"));
    if (id) deleteGroup(householdId, id);
    return { ok: "Gruppe gelöscht." };
  },
};

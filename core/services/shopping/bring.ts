// Direkte Anbindung an die (reverse-engineerte) Bring!-API via npm-Paket `bring-shopping`.
// Items werden in Bring über den NAMEN identifiziert (keine UID); "erledigt" = Verschieben
// in die "recently"-Liste. Access-Token werden nur im RAM gecacht; bei Ablauf wird mit den
// (verschlüsselt gespeicherten) Credentials neu eingeloggt.
import Bring from "bring-shopping";

type BringClient = InstanceType<typeof Bring>;

export interface ShoppingItem {
  name: string;
  quantity: string; // Bring-"specification" (Menge/Notiz)
  done: boolean;
}

export interface ShoppingList {
  listUuid: string;
  name: string;
}

// Login-Cache pro Bring-E-Mail (Access-Token lebt im Bring-Objekt).
const TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { api: BringClient; ts: number }>();

async function authed(email: string, password: string): Promise<BringClient> {
  const hit = cache.get(email);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.api;
  const api = new Bring({ mail: email, password });
  await api.login();
  cache.set(email, { api, ts: Date.now() });
  return api;
}

/**
 * Übersetzt rohe Fehler aus `bring-shopping` in eine verständliche Meldung. Bei nicht
 * erreichbarem Host / HTML-Antwort (Proxy, Wartung) scheitert dort `JSON.parse` → das
 * ist KEIN Credential-Problem, sondern Netzwerk/Server.
 */
export function bringErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/not valid JSON|Unexpected token|Unexpected end of (JSON|data)|fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(msg)) {
    return "Bring ist nicht erreichbar oder hat unerwartet geantwortet (Netzwerk/Server?).";
  }
  return msg;
}

/** Listet die Bring-Listen des Kontos – dient zugleich der Credential-Validierung. */
export async function loadBringLists(email: string, password: string): Promise<ShoppingList[]> {
  try {
    const api = await authed(email, password);
    const res = await api.loadLists();
    return res.lists.map((l) => ({ listUuid: l.listUuid, name: l.name }));
  } catch (e) {
    throw new Error(bringErrorMessage(e));
  }
}

export class BringProvider {
  constructor(
    private readonly email: string,
    private readonly password: string,
    private readonly listUuid: string,
  ) {}

  /** Führt eine Operation aus; bei (Auth-)Fehler einmal mit frischem Login neu versuchen. */
  private async run<T>(op: (api: BringClient) => Promise<T>): Promise<T> {
    try {
      return await op(await authed(this.email, this.password));
    } catch {
      cache.delete(this.email);
      try {
        return await op(await authed(this.email, this.password));
      } catch (e) {
        throw new Error(`Bring-Anfrage fehlgeschlagen: ${bringErrorMessage(e)}`);
      }
    }
  }

  async list(): Promise<ShoppingItem[]> {
    return this.run(async (api) => {
      const res = await api.getItems(this.listUuid);
      return [
        ...res.purchase.map((i) => ({ name: i.name, quantity: i.specification, done: false })),
        ...res.recently.map((i) => ({ name: i.name, quantity: i.specification, done: true })),
      ];
    });
  }

  async add(name: string, quantity = ""): Promise<void> {
    await this.run((api) => api.saveItem(this.listUuid, name, quantity));
  }

  async remove(name: string): Promise<void> {
    await this.run((api) => api.removeItem(this.listUuid, name));
  }

  /** erledigt → "recently" verschieben; offen → zurück in die Kaufliste schreiben. */
  async setDone(name: string, done: boolean, quantity = ""): Promise<void> {
    await this.run((api) =>
      done ? api.moveToRecentList(this.listUuid, name) : api.saveItem(this.listUuid, name, quantity),
    );
  }

  /** Menge ändern (saveItem) bzw. umbenennen (entfernen + neu anlegen). */
  async update(name: string, opts: { quantity?: string; newName?: string }): Promise<void> {
    const quantity = opts.quantity ?? "";
    await this.run(async (api) => {
      if (opts.newName && opts.newName !== name) {
        await api.removeItem(this.listUuid, name);
        await api.saveItem(this.listUuid, opts.newName, quantity);
      } else {
        await api.saveItem(this.listUuid, name, quantity);
      }
    });
  }
}

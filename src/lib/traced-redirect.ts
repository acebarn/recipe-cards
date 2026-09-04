import { redirect } from "@sveltejs/kit";

/**
 * Wie `redirect()` aus SvelteKit, hinterlässt aber die Aufrufstelle am geworfenen
 * Objekt (`__ursprung`).
 *
 * Hintergrund: Seit Mitte August landet gelegentlich ein Redirect in einem Promise,
 * das niemand abwartet — das hat den Server bis zum Guard in `hooks.server.ts`
 * reihenweise beendet. Redirects tragen von Haus aus keinen Stacktrace, deshalb
 * hängen wir hier einen an. Beim nächsten Vorfall nennt das Log damit die Zeile,
 * die den Redirect erzeugt hat; fehlt die Markierung, stammt er aus SvelteKit
 * selbst und nicht aus unserem Code.
 */
export function tracedRedirect(
  status: Parameters<typeof redirect>[0],
  location: string,
): never {
  try {
    redirect(status, location); // wirft selbst (SvelteKit 2)
  } catch (e) {
    if (e && typeof e === "object") {
      (e as { __ursprung?: string }).__ursprung = new Error("Redirect erzeugt").stack;
    }
    throw e;
  }
  /* c8 ignore next */
  throw new Error("unerreichbar: redirect() hat nicht geworfen");
}

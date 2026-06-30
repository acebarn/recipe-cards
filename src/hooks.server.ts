import { startSyncWorker } from "$core/services/drive-sync.ts";
import { startImportWorker } from "$core/services/import-queue.ts";
import { getUserByEmail, isAdmin } from "$core/services/users.ts";
import { redirect, type Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { authHandle } from "./auth.ts";

// Drive-Sync-Worker beim Server-Start anstoßen (No-op ohne RECIPE_SYNC=1).
startSyncWorker();
// Import-Retry-Worker: nimmt bei Überlastung eingereihte Importe wieder auf.
startImportWorker();

// Routen, die ohne Freigabe erreichbar sind.
const PUBLIC_PATHS = new Set(["/login", "/pending"]);

const authorization: Handle = async ({ event, resolve }) => {
  // Auth.js-Endpunkte (/auth/*) immer durchlassen.
  if (event.url.pathname.startsWith("/auth")) return resolve(event);

  // Dev-Bypass (nur lokal): RECIPE_DEV_USER=<email> umgeht den OAuth-Flow.
  const devEmail = process.env.RECIPE_DEV_USER;
  let user;
  if (devEmail) {
    user = getUserByEmail(devEmail);
  } else {
    const session = await event.locals.auth();
    const email = session?.user?.email ?? null;
    user = email ? getUserByEmail(email) : null;
  }
  event.locals.user = user;

  const path = event.url.pathname;

  if (!user) {
    if (!PUBLIC_PATHS.has(path)) throw redirect(303, "/login");
  } else if (user.status !== "approved") {
    if (path !== "/pending") throw redirect(303, "/pending");
  } else {
    // Freigegebene Nutzer: Login/Pending überspringen, /admin nur für Admins.
    if (path === "/login" || path === "/pending") throw redirect(303, "/");
    if (path.startsWith("/admin") && !isAdmin(user)) throw redirect(303, "/");
  }

  return resolve(event);
};

export const handle = sequence(authHandle, authorization);

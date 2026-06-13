import { getUserByEmail } from "$core/services/users.ts";
import { redirect, type Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { authHandle } from "./auth.ts";

// Routen, die ohne Freigabe erreichbar sind.
const PUBLIC_PATHS = new Set(["/login", "/pending"]);

const authorization: Handle = async ({ event, resolve }) => {
  // Auth.js-Endpunkte (/auth/*) immer durchlassen.
  if (event.url.pathname.startsWith("/auth")) return resolve(event);

  const session = await event.locals.auth();
  const email = session?.user?.email ?? null;
  const user = email ? getUserByEmail(email) : null;
  event.locals.user = user;

  const path = event.url.pathname;

  if (!user) {
    if (!PUBLIC_PATHS.has(path)) throw redirect(303, "/login");
  } else if (user.status !== "approved") {
    if (path !== "/pending") throw redirect(303, "/pending");
  } else {
    // Freigegebene Nutzer: Login/Pending überspringen, Admin nur für Owner.
    if (path === "/login" || path === "/pending") throw redirect(303, "/");
    if (path.startsWith("/admin") && user.role !== "owner") throw redirect(303, "/");
  }

  return resolve(event);
};

export const handle = sequence(authHandle, authorization);

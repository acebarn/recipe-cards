/// <reference lib="webworker" />
// PWA-Service-Worker: App-Shell vorab cachen, besuchte Seiten/Bilder offline lesbar.
// Schreibzugriffe (POST) gehen immer ans Netz.
import { build, files, version } from "$service-worker";

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `rezepte-${version}`;
// JS/CSS (build) + statische Dateien (Fonts, Icons, Manifest, Favicon).
const PRECACHE = new Set([...build, ...files]);

sw.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([...build, ...files]))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

async function cacheFirst(req: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = (await cache.match(req)) ?? (await cache.match("/"));
    if (hit) return hit;
    throw new Error("offline und nicht im Cache");
  }
}

sw.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // Schreibzugriffe nie abfangen

  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // nur eigene Domain
  if (url.pathname.startsWith("/auth")) return; // Auth nie cachen

  // Vorab gecachte Build-/Static-Assets: cache-first (immutable).
  if (PRECACHE.has(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }
  // Aquarell-Bilder: cache-first (ändern sich pro Slug kaum).
  if (url.pathname.startsWith("/images/")) {
    event.respondWith(cacheFirst(req));
    return;
  }
  // Seiten/Navigationen: network-first mit Cache-Fallback (Offline-Lesen).
  event.respondWith(networkFirst(req));
});

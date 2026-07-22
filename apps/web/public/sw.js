/* My Event Planner service worker: cache-first for static assets,
   network-first for PUBLIC pages with offline fallback. API calls and
   authenticated app pages (/app/**) are never cached — caching personalized
   pages on a shared device would leak private data (C8). */
const VERSION = "v3";
const STATIC_CACHE = `mep-static-${VERSION}`;
const PAGE_CACHE = `mep-pages-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)));
  // No automatic skipWaiting: the app prompts the user before activating an
  // update, so a new version never replaces a running session unasked.
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Never cache API calls or cross-origin requests.
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api")) return;

  // Static build assets: cache-first.
  if (url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/icons")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // Pages: network-first, fall back to cache, then offline page.
  if (request.mode === "navigate") {
    // Authenticated app pages are never written to any cache (privacy).
    if (url.pathname.startsWith("/app")) {
      event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
      return;
    }
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Respect cache directives and never cache personalized responses.
          const cc = response.headers.get("cache-control") ?? "";
          if (!cc.includes("no-store") && !cc.includes("private") && !response.headers.get("set-cookie")) {
            const copy = response.clone();
            caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))),
    );
  }
});

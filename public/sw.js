// Gym Floor Planner service worker: the offline shell. It controls only
// its own scope (the folder it is served from), so on a shared site it
// never touches anything else. Data lives in IndexedDB; this only caches
// the page and the files it loads. Works under any base path.
//
//   navigation inside scope   network first (3s budget), cached shell as fallback
//   hashed build assets       cache first (filenames change when content does)
//   other files in scope      stale-while-revalidate

const CACHE = "fit-shell-v3";
const SCOPE = new URL(self.registration.scope).pathname; // e.g. "/fit/" or "/"
const SHELL = [SCOPE, `${SCOPE}manifest.webmanifest`, `${SCOPE}icon.svg`, `${SCOPE}icon-192.png`];
// Next.js puts hashed files under /_next/static/, Vite under <base>assets/.
const isHashed = (path) => path.startsWith("/_next/static/") || path.startsWith(`${SCOPE}assets/`);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("fit-shell-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page posts the URLs it already loaded, so the first visit is enough
// to work offline next time.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "cache" || !Array.isArray(data.urls)) return;
  const urls = data.urls.filter((u) => typeof u === "string" && new URL(u, self.location.origin).origin === self.location.origin);
  event.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(urls.map((u) => c.match(u).then((hit) => hit || c.add(u).catch(() => undefined))))),
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate" && url.pathname.startsWith(SCOPE)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await Promise.race([fetch(req), timeout(3000)]);
        if (res.ok) cache.put(SCOPE, res.clone());
        return res;
      } catch {
        return (await cache.match(SCOPE)) || Response.error();
      }
    })());
    return;
  }

  if (isHashed(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  if (url.pathname.startsWith(SCOPE)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      const fresh = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => hit || Response.error());
      return hit || fresh;
    })());
  }
});

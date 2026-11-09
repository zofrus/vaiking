// Offline shell. After one visit the app opens with no signal.
// The plan lives in localStorage on the phone, so it needs no caching here.
const CACHE = "grace-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const res = await fetch("/", { cache: "reload" });
      const html = await res.clone().text();
      await cache.put("/", res);
      // Precache every built file the page points at (scripts and styles).
      const urls = [...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css|svg|png|webmanifest))"/g)].map((m) => m[1]);
      await cache.addAll(urls);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;

  // Page loads: serve the cached shell first, refresh it in the background.
  if (req.mode === "navigate") {
    event.respondWith(
      caches.match("/").then((hit) => {
        const refresh = fetch("/").then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put("/", res.clone()));
          return res;
        });
        event.waitUntil(refresh.catch(() => {}));
        return hit || refresh;
      }),
    );
    return;
  }

  // Data: use the network, keep the last good answer for when it is gone.
  if (url.pathname === "/api/facilities" || url.pathname === "/api/talks") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || Response.error())),
    );
    return;
  }

  // Built files are fingerprinted: cache first.
  if (!url.pathname.startsWith("/api/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
  }
});

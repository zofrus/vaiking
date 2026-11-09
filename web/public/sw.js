// Offline shell. After one visit the app opens with no signal.
// The plan lives in localStorage on the phone, so it needs no caching here.
// v2: page loads go to the network first. v1 served the cached page first, so after a
// deploy it ran the old build, whose lazy chunks were gone from the server: a blank page.
const CACHE = "grace-shell-v2";
const NAV_TIMEOUT_MS = 3000;

// Keep the page and every built file it points at (scripts and styles). The page is
// stored last, so the cached page never points at files the cache does not have.
async function saveShell(res) {
  const html = await res.clone().text();
  const urls = [
    ...html.matchAll(
      /(?:src|href)="(\/[^"]+\.(?:js|css|svg|png|webmanifest))"/g,
    ),
  ].map((m) => m[1]);
  const cache = await caches.open(CACHE);
  await cache.addAll(urls);
  await cache.put("/", res);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await saveShell(await fetch("/", { cache: "reload" }));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;

  // Page loads: the network first, so a deploy shows on the next visit. The cached page
  // is only for when the network is gone or takes longer than 3 seconds to answer.
  if (req.mode === "navigate") {
    const network = fetch("/", { cache: "no-cache" });
    event.waitUntil(
      network.then((res) => res.ok && saveShell(res.clone())).catch(() => {}),
    );
    event.respondWith(
      (async () => {
        let timer;
        const slow = new Promise((resolve) => {
          timer = setTimeout(resolve, NAV_TIMEOUT_MS);
        });
        try {
          const res = await Promise.race([network, slow]);
          if (res) return res;
          // Slow network: use the cached page, or keep waiting if there is none yet.
          return (await caches.match("/")) || (await network);
        } catch {
          return (await caches.match("/")) || Response.error();
        } finally {
          clearTimeout(timer);
        }
      })(),
    );
    return;
  }

  // Data: use the network, keep the last good answer for when it is gone.
  if (url.pathname === "/api/facilities" || url.pathname === "/api/talks") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
          }
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
            if (res.ok) {
              const copy = res.clone();
              event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
            }
            return res;
          }),
      ),
    );
  }
});

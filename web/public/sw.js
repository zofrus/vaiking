// Offline shell. After one visit the app opens with no signal.
// The plan lives in localStorage on the phone, so it needs no caching here.
// v2: page loads go to the network first. v1 served the cached page first, so after a
// deploy it ran the old build, whose lazy chunks were gone from the server: a blank page.
// v3: one built file that 404s (a pod mid-rollout) no longer fails the whole install.
const CACHE = "grace-shell-v3";
const NAV_TIMEOUT_MS = 3000;

// The built files a page points at (scripts, styles, icons).
function filesIn(html) {
  return [
    ...html.matchAll(
      // (?!\/): a protocol-relative "//host/x.js" is another site, never ours to cache.
      /(?:src|href)="(\/(?!\/)[^"]+\.(?:js|css|svg|png|webmanifest))"/g,
    ),
  ].map((m) => m[1]);
}

// Each file on its own, so one 404 cannot lose the rest. Never rejects.
function addEach(cache, urls) {
  return Promise.allSettled(
    urls.map(async (url) => cache.add(new Request(url, { cache: "reload" }))),
  );
}

async function hasAll(cache, urls) {
  for (const url of urls) if (!(await cache.match(url))) return false;
  return true;
}

// After a good page load: fetch the files not cached yet, then replace the cached page
// only if every file it names is cached. The offline page never points at a missing
// file; until then the previous page stays.
async function refreshShell(res) {
  const html = await res.clone().text();
  const urls = filesIn(html);
  const cache = await caches.open(CACHE);
  const missing = [];
  for (const url of urls) if (!(await cache.match(url))) missing.push(url);
  await addEach(cache, missing);
  if (await hasAll(cache, urls)) await cache.put("/", res);
}

// The page itself is required; its files are best effort. A file that fails here is
// cached the first time the page loads it (the cache-first branch below).
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const res = await fetch("/", { cache: "reload" });
      if (!res.ok) throw new Error(`shell answered ${res.status}`);
      const html = await res.clone().text();
      const cache = await caches.open(CACHE);
      await cache.put("/", res);
      await addEach(cache, filesIn(html));
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
      network.then((res) => res.ok && refreshShell(res.clone())).catch(() => {}),
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

// Service worker install check on the built app. A small proxy in front of
// `vite preview` 404s the worker's first request for the hashed entry script, as a pod
// mid-rollout would. In a fresh profile the worker must still install, control the
// page after one reload, and open the app offline.
// Usage: start `vite preview`, then `node scripts/sw-install.mjs [previewUrl]`.
import http from "node:http";
import { chromium } from "playwright";

const target = new URL(process.argv[2] ?? "http://localhost:4173");
let failedOnce = false;
const proxy = http.createServer((req, res) => {
  // Requests the worker makes itself (fetch, cache.add) carry Sec-Fetch-Dest: empty.
  const fromWorker = req.headers["sec-fetch-dest"] === "empty";
  if (
    !failedOnce &&
    fromWorker &&
    /^\/assets\/index-[^/]+\.js$/.test(req.url)
  ) {
    failedOnce = true;
    res
      .writeHead(404, { "content-type": "application/json" })
      .end('{"error":"not found"}');
    return;
  }
  const upstream = http.request(
    {
      host: target.hostname,
      port: target.port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", () => res.writeHead(502).end());
  req.pipe(upstream);
});
await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${proxy.address().port}`;

const browser = await chromium.launch({
  channel: process.env.AXE_CHANNEL || undefined,
});
let failed = 0;
const check = (ok, message) => {
  console.log(`${ok ? "ok" : "FAIL"}: ${message}`);
  if (!ok) failed++;
};

const context = await browser.newContext();
const page = await context.newPage();
await page.goto(`${base}/`);
await page.waitForSelector("main");
const installed = await page.evaluate(
  "Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 10000))])",
);
check(failedOnce, "the worker's request for the entry script got a 404");
check(installed, "the service worker still installed and activated");

await page.reload();
await page.waitForSelector("main");
check(
  await page.evaluate("navigator.serviceWorker.controller !== null"),
  "it controls the page after one reload",
);

await context.setOffline(true);
// With no worker in control the reload itself fails offline: that is a FAIL, not a crash.
const offline = await page
  .reload()
  .then(() => page.waitForSelector("main", { timeout: 10_000 }))
  .then(
    () => true,
    () => false,
  );
check(offline, "the app opens offline");

await browser.close();
proxy.close();
process.exit(failed ? 1 : 0);

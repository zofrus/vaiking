// Rollout guard check on the built app (the inline script at the top of index.html).
// 1. The entry script 404s once, as when old and new pods briefly serve different
//    builds: the page must reload by itself and render.
// 2. The entry script 404s every time: the page must stop after 2 reloads, not loop.
// Usage: start `vite preview`, then `node scripts/asset-recovery.mjs [baseUrl]`.
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:4173";
const browser = await chromium.launch({
  channel: process.env.AXE_CHANNEL || undefined,
});
let failed = 0;
const check = (ok, message) => {
  console.log(`${ok ? "ok" : "FAIL"}: ${message}`);
  if (!ok) failed++;
};

async function open(shouldFail) {
  // No service worker, so every request reaches the route below.
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  const seen = { entry: 0, documents: 0 };
  page.on("request", (r) => {
    if (r.resourceType() === "document") seen.documents++;
  });
  await page.route(/\/assets\/index-[^/]+\.js$/, (route) => {
    seen.entry++;
    return shouldFail(seen.entry)
      ? route.fulfill({
          status: 404,
          contentType: "application/json",
          body: '{"error":"not found"}',
        })
      : route.continue();
  });
  await page.goto(`${base}/`);
  return { page, context, seen };
}

{
  const { page, context, seen } = await open((n) => n === 1);
  const rendered = await page.waitForSelector("main", { timeout: 10_000 }).then(
    () => true,
    () => false,
  );
  check(rendered, "page renders after the entry script 404s once");
  check(
    seen.documents === 2,
    `reloaded exactly once (page loads: ${seen.documents})`,
  );
  await context.close();
}

{
  const { page, context, seen } = await open(() => true);
  await page.waitForTimeout(7_000);
  check(
    seen.documents === 3,
    `gives up after 2 reloads when the file never comes back (page loads: ${seen.documents})`,
  );
  await context.close();
}

await browser.close();
process.exit(failed ? 1 : 0);

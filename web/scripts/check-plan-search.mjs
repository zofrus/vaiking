// Plan search in a real browser, with /api/search faked so no server is needed:
// a slow older answer cannot replace a newer one, blank and empty-query cases are
// handled, filters use the submitted query, Remove works, and axe is clean.
// Usage: start `vite preview`, then `node scripts/check-plan-search.mjs [baseUrl]`.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const base = process.argv[2] ?? "http://localhost:4173";
const browser = await chromium.launch({ channel: process.env.AXE_CHANNEL || undefined });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
let failed = 0;
const check = (name, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) failed++;
};
const talk = (id, title) => ({ id, title, room: "Salt Palace | Level 2 | 250", starts_at: "2026-11-10T16:00:00-07:00", ends_at: "2026-11-10T16:30:00-07:00" });
const facets = { tracks: [{ value: "Security", count: 3 }], days: [{ value: "2026-11-10", count: 3 }] };
const urls = [];
await page.route("**/api/search*", async (route) => {
  const u = new URL(route.request().url());
  urls.push(u.search);
  const q = u.searchParams.get("q");
  if (q === "") return route.fulfill({ status: 400, body: "{}" });
  if (q === "kubernetes") await new Promise((r) => setTimeout(r, 1500));
  await route.fulfill({ json: { results: [talk(q, `Talk about ${q}`)], took_ms: 5, facets } });
});
const status = () => page.locator("section[aria-labelledby=plan-h] p[role=status]").innerText();
const titles = () => page.locator("section[aria-labelledby=plan-h] li h3").allInnerTexts();

await page.goto(base + "/");
await page.waitForSelector("main");
await page.getByRole("button", { name: "Search for kubernetes" }).click();
await page.getByRole("button", { name: "Search for ebpf" }).click();
await page.waitForTimeout(2500);
check("slow older search does not replace the newest", (await titles()).join() === "Talk about ebpf");

await page.locator("#q").fill("   ");
await page.getByRole("button", { name: "Search talks" }).click();
check("blank submit says what to type", (await status()) === "Type a topic, project or speaker.");
check("blank submit keeps the results", (await titles()).join() === "Talk about ebpf");

await page.locator("#q").fill("");
const before = urls.length;
await page.locator("#f-day").selectOption({ index: 1 });
await page.waitForTimeout(500);
check("filter uses the submitted query, not the empty box", urls.at(-1).includes("q=ebpf") && urls.length === before + 1);
check("no request with an empty query", !urls.some((u) => /[?&]q=(&|$)/.test(u)));
check("no 400 shown", !/not available/.test(await status()));

await page.getByRole("button", { name: /^Must-see: Talk about ebpf/ }).click();
check("saved list has a Remove button", await page.getByRole("button", { name: "Remove Talk about ebpf" }).isVisible());
const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
console.log(`plan with saved talk: ${violations.length} violations`);
for (const v of violations) {
  failed++;
  console.log(`  ${v.id}: ${v.help}`);
  for (const n of v.nodes.slice(0, 3)) console.log(`    ${n.target.join(" ")}`);
}
const box = await page.getByRole("button", { name: "Remove Talk about ebpf" }).boundingBox();
check("Remove target is at least 44px tall", box.height >= 44);
await page.getByRole("button", { name: "Remove Talk about ebpf" }).click();
check("Remove empties the saved list", (await page.getByRole("heading", { name: "Saved on this phone" }).count()) === 0);
check("focus lands on the search box when the list is gone", await page.evaluate(() => document.activeElement?.id === "q"));
await page.reload();
await page.waitForSelector("main");
check("removal survives a reload", (await page.getByRole("heading", { name: "Saved on this phone" }).count()) === 0);
await browser.close();
process.exit(failed ? 1 : 0);

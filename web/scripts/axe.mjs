// Accessibility check on the built app. No keys, no server API: the pages that
// matter here (button, calm screen, staff card, plan, board shell) work alone.
// Usage: start `vite preview`, then `node scripts/axe.mjs [baseUrl]`.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const base = process.argv[2] ?? "http://localhost:4173";
const sample = "/?preview=2026-11-10T15:25:00-07:00&sample=1";
const pages = [
  { name: "home", url: "/" },
  { name: "calm screen", url: "/", press: true },
  { name: "staff card", url: "/#/card" },
  { name: "sample plan, after the button", url: sample, press: true },
  { name: "sample plan, home (calendar button)", url: sample },
  { name: "board", url: "/board" },
];

const browser = await chromium.launch({ channel: process.env.AXE_CHANNEL || undefined });
let failed = 0;
for (const p of pages) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(base + p.url);
  await page.waitForSelector("main");
  if (p.press) await page.getByRole("button", { name: "I need a break" }).click();
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  console.log(`${p.name}: ${violations.length} violations`);
  for (const v of violations) {
    failed++;
    console.log(`  ${v.id} (${v.impact}): ${v.help}`);
    for (const n of v.nodes.slice(0, 3)) console.log(`    ${n.target.join(" ")}`);
  }
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);

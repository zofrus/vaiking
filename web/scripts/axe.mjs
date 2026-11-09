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
  { name: "board", url: "/board" },
  // Focus mode on: saved choice read at startup, as after a reload.
  { name: "home, focus mode on", url: "/", focus: true },
  { name: "calm screen, focus mode on", url: "/", press: true, focus: true },
  { name: "staff card, focus mode on", url: "/#/card", focus: true },
  { name: "home, focus mode and readable font on", url: "/", focus: true, font: true },
  { name: "calm screen, focus mode and readable font on", url: "/", press: true, focus: true, font: true },
];

const browser = await chromium.launch({ channel: process.env.AXE_CHANNEL || undefined });
let failed = 0;
for (const p of pages) {
  const page = await (await browser.newContext()).newPage();
  if (p.focus) await page.addInitScript(() => localStorage.setItem("grace-focus-v1", "1"));
  if (p.font) await page.addInitScript(() => localStorage.setItem("grace-font-v1", "1"));
  await page.goto(base + p.url);
  await page.waitForSelector("main");
  if (p.focus && (await page.locator("html").getAttribute("data-focus")) !== "on") {
    console.log(`  ${p.name}: data-focus was not set at startup`);
    failed++;
  }
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

// Axe on the calm screen and on the open sticker dialog, plus the behaviour the
// card promises: Escape closes it, focus returns, the choice survives a reload
// and works offline. Usage: start `vite preview`, then `node scripts/axe-sticker.mjs [baseUrl]`.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const base = process.argv[2] ?? "http://localhost:4173";
const browser = await chromium.launch({ channel: process.env.AXE_CHANNEL || undefined });
const context = await browser.newContext();
const page = await context.newPage();
let failed = 0;
const check = (name, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) failed++;
};
const axe = async (name) => {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  console.log(`${name}: ${violations.length} violations`);
  for (const v of violations) {
    failed++;
    console.log(`  ${v.id} (${v.impact}): ${v.help}`);
    for (const n of v.nodes.slice(0, 3)) console.log(`    ${n.target.join(" ")}`);
  }
};

await page.goto(base + "/");
await page.waitForSelector("main");
await page.getByRole("button", { name: "I need a break" }).click();
await page.getByRole("button", { name: "Choose my sticker" }).waitFor();
await axe("calm with sticker panel");

await page.getByRole("button", { name: "Choose my sticker" }).click();
await axe("sticker dialog open");
const radios = page.getByRole("radio");
check("three native radios", (await radios.count()) === 3);
await page.getByRole("radio", { name: /Red/ }).check();
await axe("sticker dialog, red chosen");
await page.keyboard.press("Escape");
check("Escape closes the dialog", (await page.locator("dialog[open]").count()) === 0);
check(
  "focus returns to the opener",
  await page.evaluate(() => globalThis.document.activeElement?.textContent?.includes("sticker") ?? false),
);

await page.reload();
await page.waitForSelector("main");
check("choice survives reload", await page.getByText("Your choice: Red.").isVisible());

await context.setOffline(true);
await page.reload().catch(() => {});
await page.waitForSelector("main").catch(() => {});
check("choice shows offline (reload, no network)", await page.getByText("Your choice: Red.").isVisible().catch(() => false));
await browser.close();
process.exit(failed ? 1 : 0);

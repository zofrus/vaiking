/* global document */
// The sticker dialog on a short phone (390x664, like Safari with its toolbars):
// it never outgrows the screen, Close is always on screen, tapping the backdrop
// closes it, and axe is clean. Usage: start `vite preview`, then
// `node scripts/check-dialog-fit.mjs [baseUrl]`.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const base = process.argv[2] ?? "http://localhost:4173";
const W = 390;
const H = 664;
const browser = await chromium.launch({
  channel: process.env.AXE_CHANNEL || undefined,
});
const context = await browser.newContext({
  viewport: { width: W, height: H },
  hasTouch: true,
});
const page = await context.newPage();
let failed = 0;
const check = (name, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) failed++;
};

await page.goto(base + "/");
await page.waitForSelector("main");
await page.getByRole("button", { name: "I need a break" }).first().click();
await page.waitForSelector("#calm-h");
// The sticker panel sits under "More support".
await page.getByText("More support").click();
await page.getByRole("button", { name: "Choose my sticker" }).click();
const dlg = page.locator("dialog[open]");
await dlg.waitFor();

const box = await dlg.boundingBox();
console.log(
  `dialog ${Math.round(box.width)}x${Math.round(box.height)} in a ${W}x${H} viewport`,
);
check("dialog is no taller than the screen", box.height <= H);
const close = dlg.getByRole("button", { name: "Close", exact: true });
const cb = await close.boundingBox();
check(
  "Close is fully on screen without scrolling",
  cb.y >= 0 && cb.y + cb.height <= H,
);
check("Close is at least 44px tall", cb.height >= 44);
const scrolls = await dlg.evaluate((d) => d.scrollHeight > d.clientHeight);
console.log(`dialog content scrolls inside: ${scrolls}`);

// Scroll the body to the top and the bottom: Close must stay put.
await dlg.evaluate((d) => (d.scrollTop = 0));
const top = await close.boundingBox();
await dlg.evaluate((d) => (d.scrollTop = d.scrollHeight));
const bottom = await close.boundingBox();
check(
  "Close stays in view when the dialog is scrolled to the top",
  top.y + top.height <= H && top.y >= 0,
);
check(
  "Close stays in view when the dialog is scrolled to the bottom",
  bottom.y + bottom.height <= H && bottom.y >= 0,
);
await dlg.evaluate((d) => (d.scrollTop = 0));

const { violations } = await new AxeBuilder({ page })
  .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
  .analyze();
console.log(`sticker dialog at ${W}x${H}: ${violations.length} violations`);
for (const v of violations) {
  failed++;
  console.log(`  ${v.id}: ${v.help}`);
  for (const n of v.nodes.slice(0, 3)) console.log(`    ${n.target.join(" ")}`);
}

// A tap just inside the dialog's own edge (its padding) must NOT close it.
await page.touchscreen.tap(box.x + 4, box.y + box.height / 2);
check(
  "a tap on the dialog's own padding does not close it",
  (await dlg.count()) === 1,
);
// A tap on the backdrop closes it, and focus goes back to the opener.
await page.touchscreen.tap(3, 3);
check("a tap on the backdrop closes the dialog", (await dlg.count()) === 0);
check(
  "focus returns to the button that opened it",
  await page.evaluate(() =>
    /sticker/i.test(document.activeElement?.textContent ?? ""),
  ),
);

// Choosing a sticker then Close still works, and Escape too.
await page.getByRole("button", { name: /sticker$/ }).click();
await page.getByRole("radio", { name: /Red/ }).check();
await dlg.getByRole("button", { name: "Close", exact: true }).click();
check("Close button closes it", (await dlg.count()) === 0);
check(
  "the choice is kept",
  await page.getByText(/^Your choice: Red\./).isVisible(),
);
await page.getByRole("button", { name: /sticker$/ }).click();
await page.keyboard.press("Escape");
check("Escape still closes it", (await dlg.count()) === 0);

await browser.close();
process.exit(failed ? 1 : 0);

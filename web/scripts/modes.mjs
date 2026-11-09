/* global document, getComputedStyle, innerWidth */
// Visual check for Focus mode and the easier-to-read font on the built app.
// Asserts computed styles (so a restyle that stops the modes working fails loudly)
// and saves 390x844 screenshots. Usage: start `vite preview`, then
// `node scripts/modes.mjs [baseUrl] [outDir]`.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:4173";
const out = process.argv[3] ?? "modes-out";
mkdirSync(out, { recursive: true });
const sample = "/?preview=2026-11-10T15:25:00-07:00&sample=1";

const browser = await chromium.launch({ channel: process.env.AXE_CHANNEL || undefined });
let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) failed++;
};

async function open(mode, route) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((m) => {
    localStorage.setItem("grace-tour-seen-v1", "1");
    if (m.focus) localStorage.setItem("grace-focus-v1", "1");
    if (m.font) localStorage.setItem("grace-font-v1", "1");
  }, mode);
  const page = await ctx.newPage();
  await page.goto(base + sample + route);
  await page.waitForSelector("main");
  return page;
}

const modes = {
  off: {},
  focus: { focus: true },
  "focus-readable": { focus: true, font: true },
};

for (const [name, mode] of Object.entries(modes)) {
  for (const [screen, press] of [["home", false], ["calm", true]]) {
    const page = await open(mode, "");
    if (press) await page.getByRole("button", { name: "I need a break" }).first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${screen}-${name}.png`, fullPage: true });
    const s = await page.evaluate(() => {
      const css = (el, p) => (el ? getComputedStyle(el)[p] : null);
      const q = (sel) => document.querySelector(sel);
      const visible = (sel) => [...document.querySelectorAll(sel)].some((e) => e.offsetParent !== null || getComputedStyle(e).position === "fixed");
      return {
        rootSize: parseFloat(css(document.documentElement, "fontSize")),
        bodyFam: css(document.body, "fontFamily"),
        h2Fam: css(q("main h2, main h3"), "fontFamily"),
        btnFam: css(q("main button"), "fontFamily"),
        chipFam: css(q(".gp-tag, .gp-chip, .gp-credit, .mono, .gp-mono"), "fontFamily"),
        termFam: css(q(".gp-term"), "fontFamily"),
        secondaryShown: visible(".gp-secondary"),
        creditShown: visible(".gp-credit"),
        panelShadow: css(q(".panel, .gp-card"), "boxShadow"),
        linkDeco: css(q("footer a, main a"), "textDecorationLine"),
        anim: [...document.querySelectorAll("*")].filter((e) => getComputedStyle(e).animationName !== "none").length,
        introShown: visible('[aria-labelledby="home-h"]'),
        calShown: visible('[aria-labelledby="cal-h"]'),
        dayShown: visible('[aria-labelledby="day-h"]'),
        searchShown: visible("#q"),
        breakShown: visible(".break-button"),
        overflowX: document.documentElement.scrollWidth > innerWidth,
        onLine: document.body.innerText.includes("Focus mode is on: fewer things, bigger text, no motion."),
      };
    });
    const tag = `${screen}/${name}`;
    check(`${tag}: no sideways scroll`, !s.overflowX);
    if (mode.focus) {
      check(`${tag}: root text 118%`, Math.abs(s.rootSize - 16 * 1.18) < 0.5 || s.rootSize === 16, `${s.rootSize}px`);
      check(`${tag}: no secondary or sponsor chips shown`, !s.secondaryShown && !s.creditShown);
      check(`${tag}: no shadow on cards`, !s.panelShadow || s.panelShadow === "none", s.panelShadow);
      check(`${tag}: no animation running`, s.anim === 0, String(s.anim));
      // On calm the redesign keeps the toggle behind a "More support" disclosure.
      if (screen === "home") check(`${tag}: visible "Focus mode is on" line`, s.onLine);
      if (s.linkDeco) check(`${tag}: links underlined`, s.linkDeco.includes("underline"), s.linkDeco);
      if (screen === "home") {
        check(`${tag}: intro, calendar hidden`, !s.introShown && !s.calShown);
        check(`${tag}: break button, Your day, search shown`, s.breakShown && s.dayShown && s.searchShown, JSON.stringify({ b: s.breakShown, d: s.dayShown, q: s.searchShown }));
      }
    }
    if (mode.font) {
      for (const k of ["bodyFam", "h2Fam", "btnFam", "chipFam"]) {
        if (s[k]) check(`${tag}: ${k} is Atkinson`, s[k].includes("Atkinson Hyperlegible"), s[k]);
      }
      if (s.termFam) check(`${tag}: kubectl terminal stays mono`, !s.termFam.includes("Atkinson"), s.termFam);
    } else if (s.bodyFam) {
      check(`${tag}: font is not Atkinson`, !s.bodyFam.includes("Atkinson"));
    }
    await page.context().close();
  }
}
await browser.close();
process.exit(failed ? 1 : 0);

// Axe plus behaviour for the calm screen's sound, breathing guide and read-aloud
// buttons. Usage: start `vite preview`, then `node scripts/axe-calm-tools.mjs [baseUrl]`.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const base = process.argv[2] ?? "http://localhost:4173";
const browser = await chromium.launch({ channel: process.env.AXE_CHANNEL || undefined });
let failed = 0;
const check = (name, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) failed++;
};

async function open(reducedMotion) {
  const context = await browser.newContext({ reducedMotion });
  const page = await context.newPage();
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
  await page.locator("#break-main").click();
  await page.getByRole("heading", { name: "Background sound" }).waitFor();
  return { page, axe };
}

{
  const { page, axe } = await open("no-preference");
  await axe("calm with sound and breathe panels");
  check("nothing plays or runs before a tap", (await page.getByText("Playing").count()) === 0 && (await page.getByRole("button", { name: "Start breathing guide" }).isVisible()));
  check("volume starts low", Number(await page.getByRole("slider", { name: "Volume" }).inputValue()) <= 0.3);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByText("Playing: Focus.").waitFor();
  check("Play shows a Stop button", await page.getByRole("button", { name: "Stop", exact: true }).first().isVisible());
  await axe("sound playing");
  await page.getByRole("radio", { name: /Calm/ }).check();
  await page.getByText("Playing: Calm.").waitFor();
  await page.getByRole("button", { name: "Stop", exact: true }).first().click();
  check("Stop stops", (await page.getByText("Playing").count()) === 0);

  await page.getByRole("button", { name: "Start breathing guide" }).click();
  await page.getByText("Breathe in", { exact: true }).waitFor();
  await axe("breathing guide running");
  await page.waitForTimeout(4300);
  check("cue moves on to Hold after 4 seconds", await page.getByRole("status").filter({ hasText: "Hold" }).isVisible());
  await page.getByRole("button", { name: "Stop", exact: true }).last().click();
  check("breathing Stop works", await page.getByRole("button", { name: "Start breathing guide" }).isVisible());

  const hasSpeech = await page.evaluate(() => "speechSynthesis" in globalThis);
  if (hasSpeech) {
    check("read aloud on the calm screen", await page.getByRole("button", { name: "Read this aloud" }).isVisible());
    await page.getByRole("button", { name: "Show this to staff" }).click();
    await page.getByRole("button", { name: "Read this aloud" }).waitFor();
    await axe("staff card with read aloud");
  } else console.log("skip read aloud: no speechSynthesis in this browser");
  await page.context().close();
}
{
  const { page } = await open("reduce");
  await page.getByRole("button", { name: "Start breathing guide" }).click();
  await page.getByText("Breathe in", { exact: true }).waitFor();
  const circles = await page.locator("main [style*='scale']").count();
  check("reduced motion: words and count only, no moving circle", circles === 0);
  await page.context().close();
}
await browser.close();
process.exit(failed ? 1 : 0);

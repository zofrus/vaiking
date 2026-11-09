// Axe plus behaviour for the Medical help card: home, calm, the open dialog and the
// staff card. Also checks focus, Escape, that info stays on the phone, and that
// nothing is sent. Usage: start `vite preview`, then
// `node scripts/axe-emergency.mjs [baseUrl]`.
/* global document, getComputedStyle, location */
// (Those run inside the browser, in page.evaluate callbacks.)
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const base = process.argv[2] ?? "http://localhost:4173";
const browser = await chromium.launch({
  channel: process.env.AXE_CHANNEL || undefined,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage();
let failed = 0;
const check = (name, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) failed++;
};
const axe = async (name) => {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  console.log(`${name}: ${violations.length} violations`);
  for (const v of violations) {
    failed++;
    console.log(`  ${v.id} (${v.impact}): ${v.help}`);
    for (const n of v.nodes.slice(0, 3))
      console.log(`    ${n.target.join(" ")}`);
  }
};

// Everything the page sends, to prove the saved info never leaves the phone.
const sent = [];
page.on("request", (r) =>
  sent.push(`${r.method()} ${r.url()} ${r.postData() ?? ""}`),
);
page.on(
  "console",
  (m) => m.type() === "error" && console.log("console.error:", m.text()),
);

const SECRET = [
  "Sam Rivera",
  "Epilepsy zq",
  "Penicillin zq",
  "Alex Rivera",
  "8015550134",
];
const helpButton = () =>
  page.getByRole("button", { name: "Medical help" }).first();

await page.goto(base + "/?preview=2026-11-10T15%3A25%3A00-07%3A00");
await page.waitForSelector("main");
await axe("home");

// Directly under the break button, and always visible.
const order = await page.evaluate(() => {
  const b = document.getElementById("break-main");
  const next = b?.nextElementSibling;
  return (
    next?.tagName === "BUTTON" && /Medical help/.test(next.textContent ?? "")
  );
});
check("Medical help sits directly under the break button on home", order);
const box = await helpButton().boundingBox();
check("Medical help is at least 44px tall", box.height >= 44);

// Opening the card.
await helpButton().click();
const dlg = page.locator("dialog[open]");
check("opens a modal dialog", (await dlg.count()) === 1);
check(
  "focus goes to the card's heading",
  await page.evaluate(
    () =>
      document.activeElement?.tagName === "H2" &&
      /medical help/.test(document.activeElement.textContent),
  ),
);
check(
  "the page behind is inert while open",
  await page.evaluate(
    () =>
      document.querySelector("#break-main")?.matches(":modal, :not(:modal)") &&
      !document
        .querySelector("dialog[open]")
        .contains(document.querySelector("#break-main")),
  ),
);
await axe("emergency dialog open (nothing saved)");
check(
  "Call 911 link is tel:911",
  (await dlg.getByRole("link", { name: "Call 911" }).getAttribute("href")) ===
    "tel:911",
);
check(
  "says the app calls nobody",
  await dlg
    .getByText("This app does not call or text anyone by itself.")
    .isVisible(),
);
check(
  "venue first aid with its source line",
  (await dlg.getByText("Level 1, by Room 150").count()) > 0 &&
    (await dlg.getByText(/^Source: KubeCon/).count()) > 0,
);
check(
  "CDC steps with their source",
  (await dlg.getByText("Stay with the person.").count()) === 1 &&
    (await dlg.getByText(/^Source: Centers for Disease Control/).count()) === 1,
);
const size = await dlg
  .getByText("Stay with the person.")
  .evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
check("card text is 24px or larger", size >= 24);
await page.keyboard.press("Escape");
check("Escape closes the card", (await dlg.count()) === 0);
check(
  "focus returns to Medical help",
  await page.evaluate(
    () =>
      document.activeElement?.textContent?.includes("Medical help") ?? false,
  ),
);

// Enter info, then reload.
await helpButton().click();
await page.getByRole("button", { name: "Edit my info" }).click();
await page.getByLabel("Name to call me").fill("Sam Rivera");
await page.getByLabel("Conditions").fill("Epilepsy zq");
await page.getByLabel("Medications and allergies").fill("Penicillin zq");
await page.getByLabel("Emergency contact name").fill("Alex Rivera");
await page.getByLabel("Emergency contact phone").fill("(801) 555-0134");
await page.getByLabel("I wear a medical ID bracelet").check();
await axe("emergency dialog, editing");
const sms = await dlg
  .getByRole("link", { name: /^Text Alex Rivera/ })
  .getAttribute("href");
check(
  "Text link uses the person's own contact number and message",
  sms.startsWith("sms:8015550134?&body=") &&
    decodeURIComponent(sms).includes(
      "This is Sam Rivera. I need help at KubeCon, Salt Palace. Please call me.",
    ),
);
check(
  "Call contact link is tel:8015550134",
  (await dlg
    .getByRole("link", { name: /^Call Alex Rivera/ })
    .getAttribute("href")) === "tel:8015550134",
);
check(
  "bracelet line shows",
  await dlg.getByText("Please check my medical ID bracelet.").isVisible(),
);
await axe("emergency dialog with info saved");
await page.keyboard.press("Escape");
await page.reload();
await page.waitForSelector("main");
await helpButton().click();
check(
  "info survives a reload",
  (await dlg.getByText("Epilepsy zq").count()) === 1,
);
check(
  "info is only in localStorage",
  await page.evaluate(
    () =>
      Object.keys(localStorage).filter((k) => /medical|aboutme/.test(k))
        .length === 1,
  ),
);

// About-me card.
await dlg.getByRole("radio", { name: "Tourette syndrome" }).check();
check(
  "about-me card shows large",
  await dlg
    .getByRole("region", { name: "Card to show" })
    .getByText(
      "I have Tourette syndrome. My tics are involuntary. I'm OK and don't need help.",
    )
    .isVisible(),
);
await dlg.getByRole("radio", { name: "Write my own" }).check();
await dlg.getByLabel("Your words").fill("Please be patient with me.");
check(
  "own words card shows",
  await dlg
    .getByRole("region", { name: "Card to show" })
    .getByText("Please be patient with me.")
    .isVisible(),
);
await axe("emergency dialog with about-me card");

// Sound alert starts only on a tap and stops on Stop.
check(
  "sound is off until tapped",
  (await dlg.getByText("The sound alert is on.").count()) === 0,
);
await dlg.getByRole("button", { name: "Sound alert (loud)" }).click();
await dlg.getByText("The sound alert is on.").waitFor();
check(
  "two Stop buttons while ringing, one in the footer above Close",
  (await dlg.getByRole("button", { name: "Stop sound alert" }).count()) === 2 &&
    (await dlg.locator("footer").getByRole("button", { name: "Stop sound alert" }).isVisible()),
);
const stopBox = await dlg.locator("footer").getByRole("button", { name: "Stop sound alert" }).boundingBox();
const closeBox = await dlg.locator("footer").getByRole("button", { name: "Close" }).boundingBox();
check("footer Stop is above Close and on screen", stopBox.y + stopBox.height <= closeBox.y && closeBox.y + closeBox.height <= 844);
check("card is exactly the screen height", (await dlg.boundingBox()).height === 844);
await dlg.locator("footer").getByRole("button", { name: "Stop sound alert" }).click();
check("footer Stop turns the alert off and the footer button goes", (await dlg.getByText("The sound alert is on.").count()) === 0 && (await dlg.getByRole("button", { name: "Stop sound alert" }).count()) === 0);
check(
  "Stop turns the alert off",
  (await dlg.getByText("The sound alert is on.").count()) === 0,
);
await dlg.getByRole("button", { name: "Sound alert (loud)" }).click();
await dlg.getByText("The sound alert is on.").waitFor();
await page.keyboard.press("Escape");
await helpButton().click();
check(
  "closing the card stops the alert",
  (await dlg.getByText("The sound alert is on.").count()) === 0,
);

// Delete.
await dlg.getByRole("button", { name: "Delete my info" }).click();
await dlg.getByRole("button", { name: "Yes, delete it" }).click();
check(
  "delete says so",
  await dlg.getByText("Deleted. Nothing is saved on this phone.").isVisible(),
);
check(
  "delete empties localStorage",
  await page.evaluate(
    () =>
      Object.keys(localStorage).filter((k) => /medical|aboutme/.test(k))
        .length === 0,
  ),
);
check(
  "delete clears the card",
  (await dlg.getByText("Epilepsy zq").count()) === 0,
);
await page.keyboard.press("Escape");

// Calm and the staff card.
await page.getByRole("button", { name: "I need a break" }).first().click();
await page.waitForSelector("#calm-h");
check(
  "calm has Medical help at the top, under the break button",
  await page.evaluate(() =>
    /Medical help/.test(
      document.getElementById("break-main")?.nextElementSibling?.textContent ??
        "",
    ),
  ),
);
await axe("calm with Medical help");
await page.getByRole("button", { name: "Show this to staff" }).click();
await page.waitForSelector("section[role=dialog]");
const onCard = page
  .locator("section[role=dialog]")
  .getByRole("button", { name: "Medical help" });
check("staff card has Medical help", await onCard.isVisible());
await axe("staff card with Medical help");
await onCard.click();
check("it opens above the staff card", (await dlg.count()) === 1);
await axe("emergency dialog opened from the staff card");
await page.keyboard.press("Escape");
check(
  "Escape closes only the emergency card, not the staff card",
  (await dlg.count()) === 0 &&
    (await page.evaluate(() => location.hash)) === "#/card" &&
    (await page.locator("section[role=dialog]").isVisible()),
);
await page.getByRole("button", { name: "Close card" }).click();

// Focus mode must not hide it.
await page.getByRole("button", { name: "Back to the start" }).click();
await page.getByRole("switch", { name: "Focus mode" }).first().click();
const focusOn = await page.evaluate(
  () => document.documentElement.getAttribute("data-focus") === "on",
);
check("Focus mode turned on", focusOn);
if (focusOn) {
  check(
    "Focus mode: Medical help still visible on home",
    await helpButton().isVisible(),
  );
  await helpButton().click();
  await axe("emergency dialog in Focus mode");
  check(
    "Focus mode: Call 911 still visible",
    await dlg.getByRole("link", { name: "Call 911" }).isVisible(),
  );
  check(
    "Focus mode: card borders stay 4px",
    (await dlg.locator("footer").getByRole("button", { name: "Close" }).evaluate((e) => getComputedStyle(e).borderTopWidth)) === "4px",
  );
  await page.keyboard.press("Escape");
} else console.log("skip Focus mode: toggle not found");

// Nothing sent anywhere with the info, and the URL never holds it.
check(
  "no request carried any saved info",
  !sent.some((s) =>
    SECRET.some((x) => s.includes(x) || s.includes(encodeURIComponent(x))),
  ),
);
check(
  "the URL never holds saved info",
  !SECRET.some(
    (x) => page.url().includes(x) || page.url().includes(encodeURIComponent(x)),
  ),
);
await browser.close();
process.exit(failed ? 1 : 0);

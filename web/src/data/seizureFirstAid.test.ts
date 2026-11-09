import { describe, expect, it } from "vitest";
import fixture from "./seizureFirstAid.fixture.txt?raw";
import { SEIZURE_BLOCKS, SEIZURE_SOURCE_LINE } from "./seizureFirstAid";

// The fixture is the CDC page's own text. Every line we show must be on it, word
// for word, and in the same order within its list.
const page = fixture.split("\n").map((l: string) => l.trim());

describe("seizure first aid", () => {
  it("quotes the CDC page word for word, with nothing added", () => {
    expect(SEIZURE_BLOCKS.length).toBeGreaterThan(0);
    for (const block of SEIZURE_BLOCKS) {
      for (const line of [block.intro, block.heading, ...block.items].filter(
        (l): l is string => Boolean(l),
      ))
        expect(page, line).toContain(line);
      const at = block.items.map((i) => page.indexOf(i));
      expect([...at].sort((a, b) => a - b)).toEqual(at);
    }
  });

  it("includes the steps, when to call 911, and what to avoid", () => {
    const headings = SEIZURE_BLOCKS.map((b) => b.heading);
    expect(headings).toContain(
      "Steps to keeping a person safe during a seizure",
    );
    expect(headings).toContain(
      "But you should call 911 if one or more of these things happen:",
    );
    expect(headings).toContain("Don't take these actions");
  });

  it("opens the call-911 list with the sentence the CDC puts before it", () => {
    const block = SEIZURE_BLOCKS.find((b) => b.heading.startsWith("But you should call 911"))!;
    expect(block.intro).toBe("Seizures don\u2019t usually require emergency medical attention.");
    // It sits on the page directly before that heading.
    expect(page.indexOf(block.intro!) + 1).toBe(page.indexOf(block.heading));
  });

  it("names the source, its address and the date it was checked", () => {
    expect(SEIZURE_SOURCE_LINE).toBe(
      "Source: Centers for Disease Control and Prevention, https://www.cdc.gov/epilepsy/first-aid-for-seizures/index.html, checked Nov 9, 2026",
    );
  });
});

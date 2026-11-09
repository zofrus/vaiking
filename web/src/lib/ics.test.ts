import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  // clock.ts reads location at import time; node has none.
  (globalThis as { location?: unknown }).location = { search: "" };
});
import { buildIcs, escapeText, foldLine } from "./ics";
import { samplePlan } from "./clock";

const STAMP = new Date("2026-11-09T20:00:00Z");

// Built independently of ics.ts (a separate script), then checked by eye:
// 15:40 MST is 22:40Z, and KServe's long title wraps at 75 octets.
const GOLDEN = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Effulgent Point//Grace Period//EN",
  "CALSCALE:GREGORIAN",
  "METHOD:PUBLISH",
  "BEGIN:VEVENT",
  "UID:grace-period-1289641@effulgentpoint.com",
  "DTSTAMP:20261109T200000Z",
  "DTSTART:20261110T224000Z",
  "DTEND:20261110T231000Z",
  "SUMMARY:Cortex: Surviving High Cardinality Metrics",
  "LOCATION:Salt Palace | Level 2 | 251 A-C",
  "BEGIN:VALARM",
  "ACTION:DISPLAY",
  "DESCRIPTION:Popular rooms fill early. Seating is first come\\, first served:",
  "  head to Salt Palace | Level 2 | 251 A-C now.",
  "TRIGGER:-PT20M",
  "END:VALARM",
  "BEGIN:VALARM",
  "ACTION:DISPLAY",
  "DESCRIPTION:Next talk in 10 minutes: Cortex: Surviving High Cardinality Met",
  " rics\\, Salt Palace | Level 2 | 251 A-C",
  "TRIGGER:-PT10M",
  "END:VALARM",
  "BEGIN:VALARM",
  "ACTION:DISPLAY",
  "DESCRIPTION:Time to head to Salt Palace | Level 2 | 251 A-C",
  "TRIGGER:-PT2M",
  "END:VALARM",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:grace-period-1289645@effulgentpoint.com",
  "DTSTAMP:20261109T200000Z",
  "DTSTART:20261110T234000Z",
  "DTEND:20261111T001000Z",
  "SUMMARY:Lima as the Universal AI Sandbox",
  "LOCATION:Salt Palace | Level 2 | 250 D-F",
  "BEGIN:VALARM",
  "ACTION:DISPLAY",
  "DESCRIPTION:Popular rooms fill early. Seating is first come\\, first served:",
  "  head to Salt Palace | Level 2 | 250 D-F now.",
  "TRIGGER:-PT20M",
  "END:VALARM",
  "BEGIN:VALARM",
  "ACTION:DISPLAY",
  "DESCRIPTION:Next talk in 10 minutes: Lima as the Universal AI Sandbox\\, Sal",
  " t Palace | Level 2 | 250 D-F",
  "TRIGGER:-PT10M",
  "END:VALARM",
  "BEGIN:VALARM",
  "ACTION:DISPLAY",
  "DESCRIPTION:Time to head to Salt Palace | Level 2 | 250 D-F",
  "TRIGGER:-PT2M",
  "END:VALARM",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:grace-period-1248185@effulgentpoint.com",
  "DTSTAMP:20261109T200000Z",
  "DTSTART:20261111T003000Z",
  "DTEND:20261111T010000Z",
  "SUMMARY:Who Ran Up the Inference Bill? AI Traffic Control with KServe and G",
  " ateway API In",
  "LOCATION:Salt Palace | Level 2 | 255 EF",
  "BEGIN:VALARM",
  "ACTION:DISPLAY",
  "DESCRIPTION:Popular rooms fill early. Seating is first come\\, first served:",
  "  head to Salt Palace | Level 2 | 255 EF now.",
  "TRIGGER:-PT20M",
  "END:VALARM",
  "BEGIN:VALARM",
  "ACTION:DISPLAY",
  "DESCRIPTION:Next talk in 10 minutes: Who Ran Up the Inference Bill? AI Traf",
  " fic Control with KServe and Gateway API In\\, Salt Palace | Level 2 | 255 E",
  " F",
  "TRIGGER:-PT10M",
  "END:VALARM",
  "BEGIN:VALARM",
  "ACTION:DISPLAY",
  "DESCRIPTION:Time to head to Salt Palace | Level 2 | 255 EF",
  "TRIGGER:-PT2M",
  "END:VALARM",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n") + "\r\n";

const unfold = (s: string) => s.replace(/\r\n /g, "");

describe("buildIcs", () => {
  it("matches the golden file for the sample plan", () => {
    expect(buildIcs([...samplePlan], STAMP)).toBe(GOLDEN);
  });

  it("uses CRLF only, and no physical line is over 75 octets", () => {
    const out = buildIcs([...samplePlan], STAMP);
    expect(out.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    for (const line of out.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("has one event and three reminders per talk", () => {
    const out = buildIcs([...samplePlan], STAMP);
    expect(out.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(out.match(/TRIGGER:-PT20M/g)).toHaveLength(3);
    expect(out.match(/TRIGGER:-PT10M/g)).toHaveLength(3);
    expect(out.match(/TRIGGER:-PT2M/g)).toHaveLength(3);
    expect(out.match(/ACTION:DISPLAY/g)).toHaveLength(9);
  });

  it("keeps the same UID for the same talk, whatever the time or order", () => {
    const a = buildIcs([...samplePlan], STAMP);
    const b = buildIcs([...samplePlan].reverse(), new Date("2026-11-10T01:00:00Z"));
    const uids = (s: string) => unfold(s).match(/UID:.*/g)!.sort();
    expect(uids(b)).toEqual(uids(a));
  });

  it("puts a moved talk at its new time", () => {
    const moved = { ...samplePlan[2], starts_at: "2026-11-10T17:15:00-07:00", ends_at: "2026-11-10T17:45:00-07:00" };
    const out = buildIcs([moved], STAMP);
    expect(out).toContain("DTSTART:20261111T001500Z");
    expect(out).toContain("DTEND:20261111T004500Z");
  });

  it("is a valid empty calendar for an empty plan", () => {
    const out = buildIcs([], STAMP);
    expect(out).toContain("BEGIN:VCALENDAR");
    expect(out).not.toContain("VEVENT");
    expect(out.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("escapes commas, semicolons, backslashes and newlines in titles and rooms", () => {
    const item = {
      id: "x1", title: "Tips; tricks, and \\ more\nline two", room: "Hall A, Booth 2",
      starts_at: "2026-11-10T09:00:00-07:00", ends_at: "2026-11-10T09:30:00-07:00", priority: "nice" as const,
    };
    const out = unfold(buildIcs([item], STAMP));
    expect(out).toContain("SUMMARY:Tips\\; tricks\\, and \\\\ more\\nline two");
    expect(out).toContain("LOCATION:Hall A\\, Booth 2");
    expect(out).toContain("Next talk in 10 minutes: Tips\\; tricks\\, and \\\\ more\\nline two\\, Hall A\\, Booth 2");
  });
});

describe("escapeText", () => {
  it("escapes backslash first, then the rest", () => {
    expect(escapeText("a\\b;c,d\r\ne\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
  });
});

describe("foldLine", () => {
  it("leaves a short line alone", () => {
    expect(foldLine("SUMMARY:short")).toBe("SUMMARY:short");
  });
  it("never splits a multi-byte character, and unfolds back to the original", () => {
    const long = "SUMMARY:" + "\u00e9\u{1F600}".repeat(40);
    const folded = foldLine(long);
    expect(unfold(folded)).toBe(long);
    for (const part of folded.split("\r\n")) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
      expect(part).not.toContain("\uFFFD");
    }
  });
});


describe("UID", () => {
  it("keeps only safe characters, so an id with CRLF cannot add a line", () => {
    const item = {
      id: "7\r\nATTENDEE:mailto:x@example.com", title: "T", room: "R",
      starts_at: "2026-11-10T09:00:00-07:00", ends_at: "2026-11-10T09:30:00-07:00", priority: "nice" as const,
    };
    const out = buildIcs([item], STAMP);
    expect(out).toContain("UID:grace-period-7ATTENDEEmailtoxexample.com@effulgentpoint.com\r\n");
    expect(out).not.toMatch(/^ATTENDEE/m);
  });
});

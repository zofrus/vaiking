import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VenueHelp } from "../VenueHelp";
import { quietRoom, restrooms, venueFacts, VENUE_SOURCE_LINE } from "./facilities";

const all = [quietRoom, ...restrooms, ...venueFacts];

describe("facility data", () => {
  it("gives every entry a source and a checked date", () => {
    for (const e of all) {
      expect(e.source, e.id).toMatch(/^https:\/\/events\.linuxfoundation\.org\//);
      expect(e.checkedOn, e.id).toBe("2026-11-09");
    }
  });

  it("lists no hours anywhere, because none are published", () => {
    for (const e of all) if ("hours" in e) expect(e.hours, e.id).toBeNull();
    for (const f of venueFacts) expect(Object.keys(f)).not.toContain("hours");
  });

  it("uses the KubeCon page's own words", () => {
    const byId = Object.fromEntries(venueFacts.map((f) => [f.id, f]));
    expect(byId["first-aid"].text).toBe(
      "First Aid stations located in the Salt Palace Convention Center, Level 1, by Room 150 or outside Halls 2 + 3. For emergencies, please dial 911.",
    );
    expect(byId["prayer-room"].text).toBe("Hyatt Regency | Level 5 | Zion");
    expect(byId["nursing-room"].text).toBe(
      "For location information, please check with registration or information desk staff onsite.",
    );
    expect(byId["captions"].text).toBe(
      "Captioning will be available for attendees in 60+ languages through Wordly. See instructions in each breakout room to utilize captioning.",
    );
    expect(byId["reserved-seating"].text).toBe(
      "Reserved seating is available in each session for those who have accessibility needs. If you need assistance onsite, please ask a staff member.",
    );
    expect(byId["quiet-rule"].text).toBe(
      "Please refrain from conversation, interaction, or work in these spaces.",
    );
    expect(VENUE_SOURCE_LINE).toBe(
      "Source: KubeCon + CloudNativeCon NA 2026 Inclusion + Accessibility page, checked Nov 9, 2026",
    );
  });
});

describe("VenueHelp", () => {
  const html = renderToStaticMarkup(VenueHelp());

  it("renders every fact and the source line from bundled data", () => {
    for (const f of venueFacts) {
      expect(html).toContain(f.title.replace("&", "&amp;"));
      expect(html).toContain(f.text.replace(/&/g, "&amp;"));
    }
    expect(html).toContain(VENUE_SOURCE_LINE);
  });

  it("shows no hours", () => {
    expect(html).not.toMatch(/hours/i);
  });
});

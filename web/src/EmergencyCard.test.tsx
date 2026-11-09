import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmergencyButton } from "./EmergencyCard";
import { venueFacts, VENUE_SOURCE_LINE } from "./data/facilities";
import { saveMedicalInfo } from "./lib/medicalInfo";

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}
afterEach(() => vi.unstubAllGlobals());

const html = () =>
  renderToStaticMarkup(createElement(EmergencyButton)).replace(/&#x27;/g, "'");

describe("EmergencyButton", () => {
  it("is a real button, labelled Medical help, that opens a native dialog", () => {
    const h = html();
    expect(h).toMatch(/<button[^>]*type="button"[^>]*>/);
    expect(h).toContain("Medical help");
    expect(h).toMatch(/<dialog[^>]*aria-labelledby=/);
    expect(h).not.toMatch(/<dialog[^>]*\sopen(=|>|\s)/);
  });

  it("is never marked secondary, so Focus mode cannot hide it", () => {
    expect(html()).not.toContain("gp-secondary");
  });

  it("says what it is and that the app calls nobody", () => {
    const h = html();
    expect(h).toContain("I need medical help. I may not be able to speak.");
    expect(h).toContain("This app does not call or text anyone by itself.");
  });

  it("offers a Call 911 link", () => {
    expect(html()).toContain('href="tel:911"');
  });

  it("shows the venue first aid wording and its source line", () => {
    const h = html();
    const aid = venueFacts.find((f) => f.id === "first-aid")!;
    expect(h).toContain(aid.text);
    expect(h).toContain(VENUE_SOURCE_LINE);
  });

  it("quotes the CDC steps with their source", () => {
    const h = html();
    expect(h).toContain("Stay with the person.");
    expect(h).toContain("Source: Centers for Disease Control and Prevention");
  });

  it("shows nothing about a person who has saved nothing", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    const h = html();
    expect(h).not.toContain("Please check my medical ID bracelet");
    expect(h).not.toContain("Text my contact");
  });

  it("shows the person's own info, bracelet line and contact links when saved", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    saveMedicalInfo({
      callMe: "Sam",
      conditions: "Epilepsy",
      meds: "None",
      contactName: "Alex",
      contactPhone: "801-555-0134",
      bracelet: true,
    });
    const h = html().replace(/&amp;/g, "&");
    expect(h).toContain("Sam");
    expect(h).toContain("Epilepsy");
    expect(h).toContain("Please check my medical ID bracelet");
    expect(h).toContain('href="sms:8015550134?&body=');
    expect(h).toContain('href="tel:8015550134"');
  });

  it("never puts saved info in an attribute other than its own links", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    saveMedicalInfo({
      callMe: "Sam",
      conditions: "Epilepsy",
      meds: "",
      contactName: "Alex",
      contactPhone: "",
      bracelet: false,
    });
    expect(html()).not.toMatch(/(data-|id=|class=|href=|aria-)[^>]*Epilepsy/);
  });

  it("has a sound alert that does not start by itself, and a clear delete", () => {
    const h = html();
    expect(h).toContain("Sound alert");
    expect(h).toContain("Delete my info");
  });
});

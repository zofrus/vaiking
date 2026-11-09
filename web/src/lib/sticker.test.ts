import { afterEach, describe, expect, it, vi } from "vitest";
import { countPress } from "./grace";
import {
  STICKER_CHECKED,
  STICKER_OPTIONS,
  STICKER_SOURCE_LINE,
  loadSticker,
  saveSticker,
} from "./sticker";

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    dump: () => [...m.entries()],
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("sticker copy", () => {
  it("uses the KubeCon page's words, checked Nov 9, 2026", () => {
    expect(STICKER_OPTIONS.map((o) => [o.id, o.word, o.meaning])).toEqual([
      ["green", "Green", "Open to communicate."],
      ["yellow", "Yellow", "Only if you know me, please."],
      [
        "red",
        "Red",
        "I’m not interested in communicating (or being videotaped or photographed) at this time.",
      ],
    ]);
    expect(STICKER_SOURCE_LINE).toBe(
      "Source: KubeCon + CloudNativeCon NA 2026 Inclusion + Accessibility page, checked Nov 9, 2026",
    );
    expect(STICKER_CHECKED).toBe("2026-11-09");
  });
});

describe("sticker choice", () => {
  it("is empty until chosen, then survives a reload", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    expect(loadSticker()).toBeNull();
    saveSticker("yellow");
    expect(loadSticker()).toBe("yellow");
    saveSticker(null);
    expect(loadSticker()).toBeNull();
  });

  it("ignores a damaged value", () => {
    const s = fakeStorage();
    s.setItem("grace-sticker-v1", "purple");
    vi.stubGlobal("localStorage", s);
    expect(loadSticker()).toBeNull();
  });

  it("never throws when storage is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    vi.stubGlobal("localStorage", blocked);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(loadSticker()).toBeNull();
    expect(() => saveSticker("red")).not.toThrow();
  });
});

describe("the sticker stays on the phone", () => {
  it("leaves the press body at exactly scheduled_floor and mode", async () => {
    vi.stubGlobal("localStorage", fakeStorage());
    saveSticker("red");
    const sendBeacon = vi.fn<(url: string, body: Blob) => boolean>(() => true);
    vi.stubGlobal("navigator", { sendBeacon });
    countPress("live", [], new Date("2026-11-10T15:25:00-07:00"));
    const body = JSON.parse(await sendBeacon.mock.calls[0][1].text());
    expect(Object.keys(body).sort()).toEqual(["mode", "scheduled_floor"]);
    expect(JSON.stringify(body)).not.toMatch(/red|sticker/i);
  });
});

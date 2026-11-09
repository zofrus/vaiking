import { afterEach, describe, expect, it, vi } from "vitest";
import { countPress } from "./grace";
import { initReadableFont, isReadableFont, setReadableFont } from "./readableFont";

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

function stubEnv(storage = fakeStorage()) {
  const attrs = new Map<string, string>();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("document", {
    documentElement: {
      setAttribute: (k: string, v: string) => void attrs.set(k, v),
      removeAttribute: (k: string) => void attrs.delete(k),
    },
  });
  return { storage, attrs };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("easier-to-read font", () => {
  it("is off by default", () => {
    const { attrs } = stubEnv();
    initReadableFont();
    expect(isReadableFont()).toBe(false);
    expect(attrs.get("data-font")).toBeUndefined();
  });

  it("sets data-font=readable on, clears it off", () => {
    const { attrs } = stubEnv();
    setReadableFont(true);
    expect(attrs.get("data-font")).toBe("readable");
    setReadableFont(false);
    expect(attrs.get("data-font")).toBeUndefined();
  });

  it("survives a reload", () => {
    const first = stubEnv();
    setReadableFont(true);
    const second = stubEnv(first.storage);
    initReadableFont();
    expect(isReadableFont()).toBe(true);
    expect(second.attrs.get("data-font")).toBe("readable");
  });

  it("does not throw when storage is blocked", () => {
    stubEnv();
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => initReadableFont()).not.toThrow();
    expect(() => setReadableFont(true)).not.toThrow();
    expect(isReadableFont()).toBe(true);
  });

  it("leaves the press body at exactly scheduled_floor and mode", async () => {
    stubEnv();
    setReadableFont(true);
    const sendBeacon = vi.fn<(url: string, body: Blob) => boolean>(() => true);
    vi.stubGlobal("navigator", { sendBeacon });
    countPress("live", [], new Date("2026-11-10T15:25:00-07:00"));
    const body = JSON.parse(await sendBeacon.mock.calls[0][1].text());
    expect(Object.keys(body).sort()).toEqual(["mode", "scheduled_floor"]);
  });
});

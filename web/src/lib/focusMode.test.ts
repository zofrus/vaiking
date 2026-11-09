import { afterEach, describe, expect, it, vi } from "vitest";
import { countPress } from "./grace";
import { initFocus, isFocusOn, setFocus } from "./focusMode";

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

function fakeDocument() {
  const attrs = new Map<string, string>();
  return {
    attrs,
    documentElement: {
      setAttribute: (k: string, v: string) => void attrs.set(k, v),
      removeAttribute: (k: string) => void attrs.delete(k),
    },
  };
}

function stubEnv(opts: { reduced?: boolean; storage?: ReturnType<typeof fakeStorage> } = {}) {
  const storage = opts.storage ?? fakeStorage();
  const doc = fakeDocument();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: !!opts.reduced && q.includes("reduce") }));
  vi.stubGlobal("dispatchEvent", () => true);
  return { storage, doc };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("focus mode", () => {
  it("is off by default and sets no attribute", () => {
    const { doc } = stubEnv();
    initFocus();
    expect(isFocusOn()).toBe(false);
    expect(doc.attrs.get("data-focus")).toBeUndefined();
  });

  it("sets data-focus=on when turned on, and clears it when turned off", () => {
    const { doc } = stubEnv();
    setFocus(true);
    expect(doc.attrs.get("data-focus")).toBe("on");
    setFocus(false);
    expect(doc.attrs.get("data-focus")).toBeUndefined();
  });

  it("survives a reload", () => {
    const first = stubEnv();
    setFocus(true);
    const second = stubEnv({ storage: first.storage });
    initFocus();
    expect(isFocusOn()).toBe(true);
    expect(second.doc.attrs.get("data-focus")).toBe("on");
  });

  it("suggests on when the phone asks for reduced motion, but the saved choice wins", () => {
    const a = stubEnv({ reduced: true });
    initFocus();
    expect(a.doc.attrs.get("data-focus")).toBe("on");
    setFocus(false);
    const b = stubEnv({ reduced: true, storage: a.storage });
    initFocus();
    expect(isFocusOn()).toBe(false);
    expect(b.doc.attrs.get("data-focus")).toBeUndefined();
  });

  it("does not throw when storage is blocked", () => {
    stubEnv();
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => initFocus()).not.toThrow();
    expect(() => setFocus(true)).not.toThrow();
    expect(isFocusOn()).toBe(true);
  });

  it("leaves the press body at exactly scheduled_floor and mode", async () => {
    stubEnv();
    setFocus(true);
    const sendBeacon = vi.fn<(url: string, body: Blob) => boolean>(() => true);
    vi.stubGlobal("navigator", { sendBeacon });
    countPress("live", [], new Date("2026-11-10T15:25:00-07:00"));
    const body = JSON.parse(await sendBeacon.mock.calls[0][1].text());
    expect(Object.keys(body).sort()).toEqual(["mode", "scheduled_floor"]);
    expect(JSON.stringify(body)).not.toMatch(/focus/i);
  });
});

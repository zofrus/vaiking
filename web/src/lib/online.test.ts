import { describe, expect, it } from "vitest";
import { chipState, chipText } from "./online";

describe("offline chip state", () => {
  it("says ready only when online and a service worker controls the page", () => {
    expect(chipState(true, true)).toBe("ready");
  });
  it("says nothing when online but not yet controlled", () => {
    expect(chipState(true, false)).toBe("none");
    expect(chipText("none")).toBe("");
  });
  it("says the button still works when offline, controlled or not", () => {
    expect(chipState(false, true)).toBe("offline");
    expect(chipState(false, false)).toBe("offline");
  });
  it("uses the exact wording", () => {
    expect(chipText("ready")).toBe("Ready offline");
    expect(chipText("offline")).toBe("Offline. The break button still works.");
  });
});

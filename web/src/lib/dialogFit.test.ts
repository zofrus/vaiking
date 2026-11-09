import { describe, expect, it } from "vitest";
import { clickedOutside } from "./dialogFit";

const rect = { left: 20, right: 370, top: 40, bottom: 620 };

describe("clickedOutside", () => {
  it("is true for a tap on the dimmed backdrop, on any side", () => {
    expect(clickedOutside(rect, 5, 300)).toBe(true);
    expect(clickedOutside(rect, 380, 300)).toBe(true);
    expect(clickedOutside(rect, 200, 10)).toBe(true);
    expect(clickedOutside(rect, 200, 640)).toBe(true);
  });

  it("is false for a tap inside the dialog, including its padding", () => {
    expect(clickedOutside(rect, 200, 300)).toBe(false);
    expect(clickedOutside(rect, 21, 41)).toBe(false);
    expect(clickedOutside(rect, 20, 40)).toBe(false);
    expect(clickedOutside(rect, 370, 620)).toBe(false);
  });

  it("is false for a keyboard-made click with no position", () => {
    expect(clickedOutside(rect, 0, 0)).toBe(false);
  });
});

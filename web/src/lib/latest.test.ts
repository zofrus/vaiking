import { describe, expect, it } from "vitest";
import { latestOnly } from "./latest";

describe("latestOnly", () => {
  it("is current until a newer request starts", () => {
    const turn = latestOnly();
    const first = turn();
    expect(first()).toBe(true);
    const second = turn();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { checkedLine, getChecked, markChecked, subscribeChecked } from "./checked";

describe("checkedLine", () => {
  it("says when changes were last checked, in MST", () => {
    expect(checkedLine("2026-11-10T15:42:10-07:00", true)).toBe("Changes last checked 3:42 PM MST.");
  });
  it("adds the offline warning", () => {
    expect(checkedLine("2026-11-10T15:42:10-07:00", false)).toBe(
      "Changes last checked 3:42 PM MST. May be out of date: you're offline.",
    );
  });
  it("is silent while online and not yet checked", () => {
    expect(checkedLine(null, true)).toBeNull();
  });
  it("still warns when offline and never checked", () => {
    expect(checkedLine(null, false)).toBe("Changes not checked yet. May be out of date: you're offline.");
  });
});

describe("markChecked", () => {
  it("stores the time and tells listeners, and ignores junk", () => {
    let calls = 0;
    const off = subscribeChecked(() => calls++);
    markChecked("not a time");
    expect(getChecked()).toBeNull();
    markChecked("2026-11-10T15:42:10-07:00");
    expect(getChecked()).toBe("2026-11-10T15:42:10-07:00");
    expect(calls).toBe(1);
    off();
    markChecked("2026-11-10T15:43:10-07:00");
    expect(calls).toBe(1);
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReadAloud } from "../ReadAloud";
import { canSpeak } from "./speech";

afterEach(() => vi.unstubAllGlobals());

describe("read aloud", () => {
  it("hides the button when the phone cannot speak", () => {
    expect(canSpeak()).toBe(false);
    expect(renderToStaticMarkup(createElement(ReadAloud, { text: "Hello" }))).toBe("");
  });

  it("shows a real button when speechSynthesis exists", () => {
    vi.stubGlobal("speechSynthesis", { speak() {}, cancel() {} });
    vi.stubGlobal("SpeechSynthesisUtterance", class {});
    expect(canSpeak()).toBe(true);
    const html = renderToStaticMarkup(createElement(ReadAloud, { text: "Hello" }));
    expect(html).toContain("<button");
    expect(html).toContain("Read this aloud");
  });
});

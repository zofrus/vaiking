import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FocusToggle } from "./FocusToggle";
import { setFocus } from "./lib/focusMode";

const HINT = "Fewer things on screen, no motion, larger text";

describe("FocusToggle", () => {
  it("shows the full label and a visible hint by default", () => {
    const html = renderToStaticMarkup(<FocusToggle />);
    expect(html).toContain("Focus mode");
    expect(html).toContain(HINT);
    expect(html).not.toContain("sr-only");
    expect(html).toContain('role="switch"');
    expect(html).toContain("aria-describedby");
  });

  it("compact: visible label is Focus, name stays Focus mode, hint is screen-reader only", () => {
    const html = renderToStaticMarkup(<FocusToggle compact />);
    expect(html).toContain('aria-label="Focus mode"');
    expect(html).toMatch(/<span class="focus-switch-label">Focus<\/span>/);
    expect(html).toMatch(new RegExp(`<p id="[^"]+" class="sr-only">${HINT}</p>`));
    expect(html).toContain("aria-describedby");
  });

  it("says so in a visible line when on, and not when off", () => {
    expect(renderToStaticMarkup(<FocusToggle />)).not.toContain("Focus mode is on");
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
    vi.stubGlobal("document", { documentElement: { setAttribute: () => {}, removeAttribute: () => {} } });
    setFocus(true);
    for (const compact of [false, true]) {
      const html = renderToStaticMarkup(<FocusToggle compact={compact} />);
      expect(html).toContain("Focus mode is on: fewer things, bigger text, no motion.");
      expect(html).toContain('aria-checked="true"');
      expect(html).toContain("Easier-to-read font");
    }
    setFocus(false);
  });
});

afterEach(() => vi.unstubAllGlobals());

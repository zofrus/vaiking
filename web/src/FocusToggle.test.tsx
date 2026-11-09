import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FocusToggle } from "./FocusToggle";

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
});

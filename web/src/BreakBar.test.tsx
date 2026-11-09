import { describe, expect, it, vi } from "vitest";

// No DOM here: hooks are stubbed so the component can be called as a function
// and its tree walked, as Plan.test.tsx does.
vi.mock("react", async (importOriginal) => {
  const real = await importOriginal<typeof import("react")>();
  return { ...real, useState: (init: unknown) => [init, vi.fn()], useEffect: () => {} };
});

import { BreakBar } from "./BreakBar";

interface El {
  type: unknown;
  props: Record<string, unknown>;
}
function walk(node: unknown, out: El[] = []): El[] {
  if (Array.isArray(node)) node.forEach((n) => walk(n, out));
  else if (node && typeof node === "object" && "props" in node) {
    out.push(node as El);
    walk((node as El).props.children, out);
  }
  return out;
}

describe("BreakBar", () => {
  it("calls the very same press handler it is given", () => {
    const press = vi.fn();
    const tree = BreakBar({ onPress: press }) as unknown;
    const button = walk(tree).find((e) => e.type === "button");
    expect(button).toBeDefined();
    expect(button!.props.onClick).toBe(press);
    (button!.props.onClick as () => void)();
    expect(press).toHaveBeenCalledTimes(1);
  });

  it("starts hidden, so it never doubles the main button on first paint", () => {
    const tree = BreakBar({ onPress: () => {} }) as unknown as El;
    expect(tree.props.hidden).toBe(true);
  });
});

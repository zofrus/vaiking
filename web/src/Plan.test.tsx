import { afterEach, describe, expect, it, vi } from "vitest";

// No DOM in these tests: useState hands back the initial value and a spy, so the
// component can be called as a plain function and its buttons pressed by hand.
const { setters } = vi.hoisted(() => ({
  setters: [] as ReturnType<typeof vi.fn>[],
}));
vi.mock("react", async (importOriginal) => {
  const real = await importOriginal<typeof import("react")>();
  return {
    ...real,
    useState: (init: unknown) => {
      const set = vi.fn();
      setters.push(set);
      return [init, set];
    },
  };
});

import { PlanSection, SEARCH_EXAMPLES } from "./Plan";

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

function render() {
  setters.length = 0;
  return walk(
    PlanSection({
      plan: [],
      setPlan: () => {},
      buffer: 15,
      setBuffer: () => {},
    }),
  );
}

describe("search hints", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ties the hint to the search box", () => {
    const els = render();
    const input = els.find((e) => e.props.id === "q")!;
    const hint = els.find(
      (e) => e.props.id === input.props["aria-describedby"],
    )!;
    expect(hint.props.children).toBe("Topic, project or speaker.");
  });

  it("offers each example as a real button that does not submit the form", () => {
    const buttons = render().filter(
      (e) =>
        e.type === "button" &&
        SEARCH_EXAMPLES.includes(e.props.children as string),
    );
    expect(buttons.map((b) => b.props.children)).toEqual(SEARCH_EXAMPLES);
    for (const b of buttons) expect(b.props.type).toBe("button");
  });

  it("an example fills the box and runs the search", async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(
      async () => new Response(JSON.stringify({ results: [] })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const ebpf = render().find(
      (e) => e.type === "button" && e.props.children === "ebpf",
    )!;
    (ebpf.props.onClick as () => void)();
    // setters[0] is the search box text: the first useState in PlanSection.
    expect(setters[0]).toHaveBeenCalledWith("ebpf");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /^\/api\/search\?q=ebpf&limit=8$/,
    );
  });

  it("leaves the search status region as it was", () => {
    const status = render().find((e) => e.props.role === "status")!;
    expect(status.props["aria-live"]).toBe("polite");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Same trick as Plan.test.tsx: no DOM. useState hands back the initial value (or a
// preset for one slot) plus a spy, so PlanSection can be called as a plain function.
const { setters, presets } = vi.hoisted(() => ({
  setters: [] as ReturnType<typeof vi.fn>[],
  presets: {} as Record<number, unknown>,
}));
vi.mock("react", async (importOriginal) => {
  const real = await importOriginal<typeof import("react")>();
  return {
    ...real,
    useState: (init: unknown) => {
      const i = setters.length;
      const set = vi.fn();
      setters.push(set);
      return [i in presets ? presets[i] : init, set];
    },
  };
});

import { PlanSection } from "./Plan";
import type { PlanItem } from "./lib/reconcile";

// useState order in PlanSection: q, results, status, facets, track, day, draft, submitted.
const Q = 0, RESULTS = 1, STATUS = 2, TRACK = 4, DAY = 5;

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
function render(plan: PlanItem[] = [], preset: Record<number, unknown> = {}) {
  setters.length = 0;
  for (const k of Object.keys(presets)) delete presets[Number(k)];
  Object.assign(presets, preset);
  const setPlan = vi.fn();
  const els = walk(PlanSection({ plan, setPlan, buffer: 15, setBuffer: () => {} }));
  return { els, setPlan };
}
const talk = (id: string) => ({ id, title: `Talk ${id}`, room: "Salt Palace | Level 2 | 250", starts_at: "2026-11-10T16:00:00-07:00", ends_at: "2026-11-10T16:30:00-07:00" });
const item = (id: string, starts: string): PlanItem => ({ ...talk(id), starts_at: starts, priority: "must" });
const ok = (results: unknown[]) => new Response(JSON.stringify({ results }));

beforeEach(() => vi.stubGlobal("document", undefined));
afterEach(() => vi.unstubAllGlobals());

describe("search race", () => {
  it("shows the newest search even when an older one answers last", async () => {
    const A = [talk("slow")];
    const B = [talk("fast")];
    let n = 0;
    const fetchMock = vi.fn(async () => {
      n++;
      if (n === 1) {
        await new Promise((r) => setTimeout(r, 60));
        return ok(A);
      }
      return ok(B);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { els } = render();
    const click = (name: string) => (els.find((e) => e.type === "button" && e.props.children === name)!.props.onClick as () => void)();
    click("kubernetes");
    click("ebpf");
    await vi.waitFor(() => expect(setters[RESULTS]).toHaveBeenCalledWith(B));
    await new Promise((r) => setTimeout(r, 120));
    expect(setters[RESULTS]).not.toHaveBeenCalledWith(A);
    expect(setters[STATUS].mock.calls.at(-1)?.[0]).toMatch(/talks found/);
  });

  it("ignores an older search that fails after a newer one worked", async () => {
    let n = 0;
    vi.stubGlobal("fetch", async () => {
      n++;
      if (n === 1) {
        await new Promise((r) => setTimeout(r, 60));
        throw new Error("offline");
      }
      return ok([talk("fast")]);
    });
    const { els } = render();
    const click = (name: string) => (els.find((e) => e.type === "button" && e.props.children === name)!.props.onClick as () => void)();
    click("kubernetes");
    click("ebpf");
    await new Promise((r) => setTimeout(r, 150));
    expect(setters[RESULTS]).not.toHaveBeenCalledWith(null);
    expect(setters[STATUS].mock.calls.at(-1)?.[0]).not.toMatch(/not available/);
  });
});

describe("blank search", () => {
  it("says what to type and sends nothing", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { els } = render();
    const form = els.find((e) => e.type === "form")!;
    (form.props.onSubmit as (e: unknown) => void)({ preventDefault() {} });
    expect(setters[STATUS]).toHaveBeenCalledWith("Type a topic, project or speaker.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("also treats spaces as blank", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { els } = render([], { [Q]: "   " });
    (els.find((e) => e.type === "form")!.props.onSubmit as (e: unknown) => void)({ preventDefault() {} });
    expect(setters[STATUS]).toHaveBeenCalledWith("Type a topic, project or speaker.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("filters", () => {
  const facets = { tracks: [{ value: "Security", count: 3 }], days: [{ value: "2026-11-10", count: 3 }] };

  it("use the last submitted query, not what is typed now", async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () => ok([]));
    vi.stubGlobal("fetch", fetchMock);
    const { els } = render([], { [Q]: "grafana", 1: [talk("a")], 3: facets, 7: "ebpf" });
    const day = els.find((e) => e.props.id === "f-day")!;
    (day.props.onChange as (e: unknown) => void)({ target: { value: "2026-11-10" } });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/search?q=ebpf&limit=8&day=2026-11-10");
  });

  it("do nothing, and keep the results, when no search has been submitted", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { els } = render([], { [Q]: "", 1: [talk("a")], 3: facets, 7: "" });
    const track = els.find((e) => e.props.id === "f-track")!;
    (track.props.onChange as (e: unknown) => void)({ target: { value: "Security" } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(setters[RESULTS]).not.toHaveBeenCalled();
    expect(setters[TRACK]).not.toHaveBeenCalled();
    expect(setters[DAY]).not.toHaveBeenCalled();
  });
});

describe("Saved on this phone", () => {
  const plan = [item("a", "2026-11-10T16:00:00-07:00"), item("b", "2026-11-10T17:00:00-07:00")];

  it("has a real Remove button per talk, named for the talk", () => {
    const { els } = render(plan);
    const buttons = els.filter((e) => e.type === "button" && String(e.props["aria-label"] ?? "").startsWith("Remove "));
    expect(buttons.map((b) => b.props["aria-label"])).toEqual(["Remove Talk a", "Remove Talk b"]);
    for (const b of buttons) {
      expect(b.props.type).toBe("button");
      expect(b.props.children).toBe("Remove");
    }
  });

  it("removes only that talk, through the plan setter", () => {
    const { els, setPlan } = render(plan);
    const b = els.find((e) => e.props["aria-label"] === "Remove Talk a")!;
    (b.props.onClick as () => void)();
    expect(setPlan).toHaveBeenCalledTimes(1);
    expect(setPlan).toHaveBeenCalledWith([plan[1]]);
  });

  it("can empty the plan", () => {
    const { els, setPlan } = render([plan[0]]);
    (els.find((e) => e.props["aria-label"] === "Remove Talk a")!.props.onClick as () => void)();
    expect(setPlan).toHaveBeenCalledWith([]);
  });
});

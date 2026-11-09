import { afterEach, describe, expect, it, vi } from "vitest";
import swSource from "../../public/sw.js?raw";
import { reloadOnceForNewBuild } from "./staleBuild";

function memoryStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

describe("reloadOnceForNewBuild", () => {
  it("reloads the first time and never again in the same tab", () => {
    const store = memoryStore();
    const reload = vi.fn();
    expect(reloadOnceForNewBuild(() => store, reload)).toBe(true);
    expect(reloadOnceForNewBuild(() => store, reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload when storage is blocked, since nothing could stop a loop", () => {
    const reload = vi.fn();
    const blocked = () => {
      throw new Error("SecurityError");
    };
    expect(reloadOnceForNewBuild(blocked, reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

// Runs public/sw.js against a fake cache and network.
function loadWorker(network: () => Promise<Response>) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const stored = new Map<string, Response>();
  const cache = {
    put: async (k: string, r: Response) => void stored.set(k, r),
    addAll: async () => {},
  };
  const caches = {
    open: async () => cache,
    match: async (k: string) => stored.get(k)?.clone(),
    keys: async () => [],
    delete: async () => true,
  };
  const self = {
    addEventListener: (type: string, fn: (event: unknown) => void) =>
      (handlers[type] = fn),
  };
  new Function("self", "caches", "fetch", "location", swSource)(
    self,
    caches,
    network,
    new URL("https://grace.test"),
  );

  return {
    stored,
    navigate() {
      let page: Promise<Response> | undefined;
      const waits: Promise<unknown>[] = [];
      handlers.fetch({
        request: {
          method: "GET",
          url: "https://grace.test/demo",
          mode: "navigate",
        },
        respondWith: (p: Promise<Response>) => (page = p),
        waitUntil: (p: Promise<unknown>) => waits.push(p),
      });
      return { page: page!, settled: () => Promise.all(waits) };
    },
  };
}

const html = (build: string) =>
  new Response(`<script src="/assets/index-${build}.js"></script>`);

describe("service worker page loads", () => {
  afterEach(() => vi.useRealTimers());

  it("serves the deployed page from the network, not the cached old one", async () => {
    const sw = loadWorker(async () => html("new"));
    sw.stored.set("/", html("old"));
    const nav = sw.navigate();
    expect(await (await nav.page).text()).toContain("index-new.js");
    await nav.settled();
    expect(await sw.stored.get("/")!.clone().text()).toContain("index-new.js");
  });

  it("serves the cached page when there is no network", async () => {
    const sw = loadWorker(() => Promise.reject(new TypeError("offline")));
    sw.stored.set("/", html("old"));
    expect(await (await sw.navigate().page).text()).toContain("index-old.js");
  });

  it("serves the cached page when the network takes longer than 3 seconds", async () => {
    vi.useFakeTimers();
    const sw = loadWorker(() => new Promise(() => {}));
    sw.stored.set("/", html("old"));
    const { page } = sw.navigate();
    await vi.advanceTimersByTimeAsync(3000);
    expect(await (await page).text()).toContain("index-old.js");
  });
});

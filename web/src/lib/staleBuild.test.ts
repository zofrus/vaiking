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

const BUILD_A = "https://grace.test/assets/index-AAAA.js";
const BUILD_B = "https://grace.test/assets/index-BBBB.js";

describe("reloadOnceForNewBuild", () => {
  it("reloads once for a build and never again for that same build", () => {
    const store = memoryStore();
    const reload = vi.fn();
    expect(reloadOnceForNewBuild(() => store, reload, BUILD_A)).toBe(true);
    expect(reloadOnceForNewBuild(() => store, reload, BUILD_A)).toBe(false);
    expect(reloadOnceForNewBuild(() => store, reload, BUILD_A)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads once more after a second deploy in the same tab", () => {
    const store = memoryStore();
    const reload = vi.fn();
    expect(reloadOnceForNewBuild(() => store, reload, BUILD_A)).toBe(true);
    // A later deploy removes build B's chunks while the tab is still open.
    expect(reloadOnceForNewBuild(() => store, reload, BUILD_B)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("never loops when a rolling deploy serves two builds in turn", () => {
    const store = memoryStore();
    const reload = vi.fn();
    const results = [BUILD_A, BUILD_B, BUILD_A, BUILD_B, BUILD_A].map((b) =>
      reloadOnceForNewBuild(() => store, reload, b),
    );
    expect(results).toEqual([true, true, false, false, false]);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("treats a damaged or old-format value as no builds yet, so it still recovers", () => {
    for (const old of ["1", "{not json", '{"a":1}']) {
      const store = memoryStore();
      store.setItem("grace-reloaded-builds-v1", old);
      const reload = vi.fn();
      expect(reloadOnceForNewBuild(() => store, reload, BUILD_A)).toBe(true);
      expect(reloadOnceForNewBuild(() => store, reload, BUILD_A)).toBe(false);
    }
  });

  it("does not reload when storage is blocked, since nothing could stop a loop", () => {
    const reload = vi.fn();
    const blocked = () => {
      throw new Error("SecurityError");
    };
    expect(reloadOnceForNewBuild(blocked, reload, BUILD_A)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

// Runs public/sw.js against a fake cache and network.
function loadWorker(
  network: () => Promise<Response>,
  failing = new Set<string>(),
) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const stored = new Map<string, Response>();
  const cache = {
    put: async (k: string, r: Response) => void stored.set(k, r),
    // Like Cache.add: rejects when the file does not answer 200.
    add: async (req: { url: string }) => {
      if (failing.has(req.url)) throw new TypeError(`404 ${req.url}`);
      stored.set(req.url, new Response("file"));
    },
    match: async (k: string) => stored.get(k)?.clone(),
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
  // The worker resolves "/assets/x.js" against its own origin; this stand-in keeps the path.
  class FakeRequest {
    url: string;
    constructor(url: string) {
      this.url = url;
    }
  }
  new Function("self", "caches", "fetch", "location", "Request", swSource)(
    { ...self, skipWaiting: async () => {} },
    caches,
    network,
    new URL("https://grace.test"),
    FakeRequest,
  );

  return {
    stored,
    install() {
      const waits: Promise<unknown>[] = [];
      handlers.install({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
      return Promise.all(waits);
    },
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

const shell = (...files: string[]) =>
  new Response(files.map((f) => `<script src="${f}"></script>`).join(""));

describe("service worker install", () => {
  it("still installs when one built file 404s, keeping the page and the other files", async () => {
    const sw = loadWorker(
      async () => shell("/assets/index-new.js", "/assets/index-new.css"),
      new Set(["/assets/index-new.css"]),
    );
    await sw.install();
    expect(await sw.stored.get("/")!.clone().text()).toContain("index-new.js");
    expect(sw.stored.has("/assets/index-new.js")).toBe(true);
    expect(sw.stored.has("/assets/index-new.css")).toBe(false);
  });

  it("fails the install only when the page itself does not answer", async () => {
    const sw = loadWorker(async () => new Response("down", { status: 502 }));
    await expect(sw.install()).rejects.toThrow();
  });

  it("keeps the old cached page until every file of the new one is cached", async () => {
    const failing = new Set(["/assets/index-new.js"]);
    const sw = loadWorker(async () => shell("/assets/index-new.js"), failing);
    sw.stored.set("/", html("old"));
    const first = sw.navigate();
    await first.page;
    await first.settled();
    expect(await sw.stored.get("/")!.clone().text()).toContain("index-old.js");
    failing.clear();
    const second = sw.navigate();
    await second.page;
    await second.settled();
    expect(await sw.stored.get("/")!.clone().text()).toContain("index-new.js");
  });
});

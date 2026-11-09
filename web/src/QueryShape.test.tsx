import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => {
  const real = await importOriginal<typeof import("react")>();
  return { ...real, useSyncExternalStore: (_s: unknown, get: () => unknown) => get() };
});
vi.stubGlobal("location", { search: "" });
const { QueryShape } = await import("./QueryShape");
const { getShape } = await import("./lib/live");

describe("QueryShape", () => {
  it("renders nothing until the server has answered (so nothing offline)", () => {
    expect(getShape()).toBeNull();
    expect(QueryShape()).toBeNull();
  });
});

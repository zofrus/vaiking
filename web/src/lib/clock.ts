// Preview mode: ?preview=<ISO time> starts the clock at that moment and lets it
// run. &sample=1 loads a labelled sample plan. Nothing here touches the server.
const params = new URLSearchParams(location.search);
const start = Date.parse(params.get("preview") ?? "");
const loadedAt = Date.now();

export const isPreview = Number.isFinite(start);
export const useSample = isPreview && params.get("sample") === "1";

export const now = (): Date => (isPreview ? new Date(start + (Date.now() - loadedAt)) : new Date());

// Real Tuesday slots from the real schedule (Salt Palace Level 2). The clock
// starts at 3:25 PM, just after the 2:50 to 3:20 talks end.
const slot = (id: string, title: string, room: string, s: string, e: string, priority: "must" | "nice") => ({
  id, title, room, starts_at: `2026-11-10T${s}:00-07:00`, ends_at: `2026-11-10T${e}:00-07:00`, priority,
});
export const samplePlan = [
  slot("1289641", "Cortex: Surviving High Cardinality Metrics", "Salt Palace | Level 2 | 251 A-C", "15:40", "16:10", "nice"),
  slot("1289645", "Lima as the Universal AI Sandbox", "Salt Palace | Level 2 | 250 D-F", "16:40", "17:10", "nice"),
  slot("1248185", "Who Ran Up the Inference Bill? AI Traffic Control with KServe and Gateway API In", "Salt Palace | Level 2 | 255 EF", "17:30", "18:00", "must"),
] as const;

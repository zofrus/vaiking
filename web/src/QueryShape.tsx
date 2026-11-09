import { useSyncExternalStore } from "react";
import { getShape, subscribeShape } from "./lib/live";
import { formatTime } from "./lib/reconcile";

// "How this was found": a collapsed note under a similar-talk suggestion. It
// shows only how the lookup was built. It renders nothing until the server has
// answered, so it is absent offline.
export function QueryShape() {
  const shape = useSyncExternalStore(subscribeShape, getShape, () => null);
  if (!shape) return null;
  const { after, before } = shape.window;
  return (
    <details className="text-sm text-ink-soft">
      <summary className="cursor-pointer font-semibold">How this was found</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Searched by {shape.method}: the words in {shape.keyword_fields.join(", ")}, and the meaning of the talk.</li>
        <li>It started from {shape.seed}.</li>
        <li>Left out: {shape.excludes.join(", ")}.</li>
        {after && before && <li>Only talks starting between {formatTime(after)} and {formatTime(before)} MST.</li>}
        <li>Shows up to {shape.limit} talks. The meaning part uses Elastic's embeddings, the only AI in this app.</li>
      </ul>
    </details>
  );
}

import { useSyncExternalStore } from "react";
import { checkedLine, getChecked, subscribeChecked } from "./lib/checked";

const subscribeOnline = (cb: () => void) => {
  addEventListener("online", cb);
  addEventListener("offline", cb);
  return () => {
    removeEventListener("online", cb);
    removeEventListener("offline", cb);
  };
};

// A quiet line under Your day. Deliberately not a live region: it changes every
// minute and a screen reader should not chatter about it.
export function ChangesChecked() {
  const checked = useSyncExternalStore(subscribeChecked, getChecked, () => null);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const line = checkedLine(checked, online);
  return line ? <p className="text-xs text-ink-soft">{line}</p> : null;
}

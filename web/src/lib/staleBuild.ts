// A tab still running an old build asks for lazy chunks a deploy has removed, and the
// page goes blank. Reloading picks up the new build.
//
// The guard remembers, in sessionStorage, every build this tab has already reloaded
// for. Each new deploy gets one reload, so a tab left open across two deploys still
// recovers. The same build never reloads twice, so an offline tab whose cached page
// is old can never loop. Neither can a tab that sees two builds in turn while a
// rolling deploy has both live.
const KEY = "grace-reloaded-builds-v1";
const MAX_BUILDS = 20;

type FlagStore = Pick<Storage, "getItem" | "setItem">;

function readBuilds(s: FlagStore): string[] {
  try {
    const raw: unknown = JSON.parse(s.getItem(KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((b): b is string => typeof b === "string")
      : [];
  } catch {
    return []; // a damaged value only costs one more reload
  }
}

// build identifies the running build: the entry script's URL, which changes with
// every deploy because its file name carries a content hash.
export function reloadOnceForNewBuild(
  store: () => FlagStore,
  reload: () => void,
  build: string,
): boolean {
  try {
    const s = store();
    const done = readBuilds(s);
    if (done.includes(build)) return false;
    s.setItem(KEY, JSON.stringify([...done, build].slice(-MAX_BUILDS)));
  } catch {
    // Storage is blocked, so there is no guard against a loop: do not reload.
    return false;
  }
  reload();
  return true;
}

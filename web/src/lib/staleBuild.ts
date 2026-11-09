// A tab still running an old build asks for lazy chunks a deploy has removed, and the
// page goes blank. Reloading picks up the new build. The flag lives in sessionStorage,
// so it survives the reload and each tab reloads at most once: an offline tab whose
// cached page is old can never reload in a loop.
const KEY = "grace-reloaded-for-new-build";

type FlagStore = Pick<Storage, "getItem" | "setItem">;

export function reloadOnceForNewBuild(
  store: () => FlagStore,
  reload: () => void,
): boolean {
  try {
    const s = store();
    if (s.getItem(KEY)) return false;
    s.setItem(KEY, "1");
  } catch {
    // Storage is blocked, so there is no guard against a loop: do not reload.
    return false;
  }
  reload();
  return true;
}

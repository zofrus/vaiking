// For async work where only the newest request may change the screen. Each call
// starts a new request and returns a check; the check says false once a newer
// request has started, so a slow older answer can be ignored.
export function latestOnly(): () => () => boolean {
  let newest = 0;
  return () => {
    const mine = ++newest;
    return () => mine === newest;
  };
}

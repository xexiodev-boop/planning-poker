const DISPLAY_NAME_KEY = "point-taken:display-name";

// The name is stamped with a random suffix server-side, so we persist only what
// the person typed — trimmed and capped to the same 32-char limit the inputs use.
export function readDisplayName() {
  try {
    return (localStorage.getItem(DISPLAY_NAME_KEY) ?? "").slice(0, 32);
  } catch {
    return "";
  }
}

export function rememberDisplayName(name) {
  const trimmed = String(name ?? "").trim().slice(0, 32);
  try {
    if (trimmed) localStorage.setItem(DISPLAY_NAME_KEY, trimmed);
  } catch {
    // Private-mode or storage-disabled browsers simply won't prefill next time.
  }
}

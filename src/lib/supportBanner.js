const DISMISSED_UNTIL_KEY = "point-taken:support-dismissed-until";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function isSupportBannerHidden() {
  try {
    const until = Number(localStorage.getItem(DISMISSED_UNTIL_KEY));
    if (!until || until <= Date.now()) {
      if (until) localStorage.removeItem(DISMISSED_UNTIL_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function dismissSupportBanner() {
  try {
    localStorage.setItem(DISMISSED_UNTIL_KEY, String(Date.now() + WEEK_MS));
  } catch {
    // Storage unavailable (private mode / blocked) — the banner simply
    // reappears next load, which is acceptable.
  }
}

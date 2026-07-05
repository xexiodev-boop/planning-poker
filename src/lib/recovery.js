const RECOVERY_PREFIX = "point-taken:recovery:";

// The facilitator recovery code is returned once at room creation. We stash it
// in sessionStorage (per-tab, cleared on close) so the room can surface it once
// after the post-create navigation, then hand it out for the user to save.
export function stashRecoveryCode(roomId, code) {
  if (!code) return;
  try {
    sessionStorage.setItem(`${RECOVERY_PREFIX}${roomId}`, code);
  } catch {
    // sessionStorage unavailable (e.g. private mode) — the banner just won't show.
  }
}

// Reads and removes the code so it is shown exactly once.
export function takeRecoveryCode(roomId) {
  try {
    const key = `${RECOVERY_PREFIX}${roomId}`;
    const code = sessionStorage.getItem(key);
    if (code) sessionStorage.removeItem(key);
    return code;
  } catch {
    return null;
  }
}

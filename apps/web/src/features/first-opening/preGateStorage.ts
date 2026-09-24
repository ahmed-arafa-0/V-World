const SEEN_KEY = 'vw_gate_opening_seen';

/**
 * Tracks whether the unseen-VAR-then-reveal opening sequence has already
 * played once in this browser tab/session. Living Bible §18J describes this
 * as a bootstrap sequence, not something that replays on every visit to the
 * Gate (e.g. after a deliberate logout) — `sessionStorage` (not
 * `localStorage`) is intentional: a genuinely new browser session sees the
 * opening again, but repeated logout/retry within one open tab does not.
 * Wrapped in try/catch: a private-browsing tab that blocks storage must
 * never crash the Gate — it just replays the opening every time, which is
 * a safe, harmless fallback.
 */
export function hasSeenGateOpening(): boolean {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markGateOpeningSeen(): void {
  try {
    window.sessionStorage.setItem(SEEN_KEY, 'true');
  } catch {
    // Storage unavailable — the opening will simply replay; not fatal.
  }
}

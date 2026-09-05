const DEVICE_ID_STORAGE_KEY = 'vw_device_id';

/**
 * One anonymous, non-secret device identifier, generated once and persisted
 * in localStorage so it stays stable across page loads on this browser.
 * This is not a credential and not a session identifier — it only scopes
 * server-side rate limiting and session/device metadata, exactly like the
 * `device_id` column already used throughout `06_SESSIONS`/`05_ENTRY_LOGS`.
 */
export function getOrCreateDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
    return created;
  } catch {
    // localStorage unavailable (private browsing, disabled storage, etc.) —
    // fall back to a per-call ID rather than throwing.
    return crypto.randomUUID();
  }
}

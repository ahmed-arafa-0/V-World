/**
 * Whether an Arcade game is currently in progress, anywhere in the app —
 * mirrors `actionPending` in `worldClient.ts` (a tiny external store read via
 * `useSyncExternalStore`). `ArcadeView` is the only writer; the birthday
 * invitation reads it to defer itself while a game is being played, per the
 * approved scope ("Defer the invitation while inside either Church view or
 * an active game").
 */
let active = false;
const listeners = new Set<() => void>();

export const activeGameStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  isActive: () => active,
  setActive(value: boolean): void {
    if (active === value) return;
    active = value;
    listeners.forEach((l) => l());
  },
};

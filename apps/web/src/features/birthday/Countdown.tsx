import { useEffect, useRef, useState } from 'react';
import styles from './birthday.module.css';

const TICK_MS = 200;
const REPLAY_SECONDS = 20;

export interface CountdownProps {
  /** `live`: counts down to the real `targetAt` against the authoritative server clock — the
   * player is genuinely watching the boundary happen. `replay`: an explicitly labelled cinematic
   * replay of the same last 20 seconds, entirely local, that never reads or writes the server
   * clock, the Cottage countdown, or any content schedule. */
  mode: 'live' | 'replay';
  /** Required for `mode: 'live'` — the real target instant (ISO). */
  targetAt?: string;
  /** Required for `mode: 'live'` — the server's own clock at the moment this state was fetched
   * (ISO), so the countdown is never computed from the device's own clock. */
  serverNow?: string;
  /** Called exactly once, the instant the countdown reaches zero. */
  onZero: () => void;
  /** Ahmed's given text ("Live the surprise moment") is specifically the replay heading — shown
   * only in `mode: 'replay'`, never during the genuine live countdown. */
  replayLabel: string;
  replayBadge?: string;
  secondsLabel: string;
}

/**
 * Always recalculates the remaining time from the target instant on every tick — never an
 * increment/decrement counter — so backgrounding, reloading, or a slow tab can never produce a
 * negative number or a stuck display: the very next tick simply recomputes the true remainder.
 */
export function Countdown({
  mode,
  targetAt,
  serverNow,
  onZero,
  replayLabel,
  replayBadge,
  secondsLabel,
}: CountdownProps) {
  // Captured once per mount: the offset between the authoritative server clock and this device's
  // clock (live mode), or a purely local synthetic 20s target (replay mode) — never written anywhere.
  const basis = useRef<{ targetMs: number; clockOffsetMs: number }>();
  if (!basis.current) {
    if (mode === 'live' && targetAt && serverNow) {
      basis.current = {
        targetMs: Date.parse(targetAt),
        clockOffsetMs: Date.parse(serverNow) - Date.now(),
      };
    } else {
      basis.current = { targetMs: Date.now() + REPLAY_SECONDS * 1000, clockOffsetMs: 0 };
    }
  }
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, basis.current!.targetMs - (Date.now() + basis.current!.clockOffsetMs)),
  );
  const zeroFired = useRef(false);

  useEffect(() => {
    const tick = () => {
      const correctedNow = Date.now() + basis.current!.clockOffsetMs;
      const remaining = Math.max(0, basis.current!.targetMs - correctedNow);
      setRemainingMs(remaining);
      if (remaining === 0 && !zeroFired.current) {
        zeroFired.current = true;
        onZero();
      }
    };
    tick();
    const timer = window.setInterval(tick, TICK_MS);
    // Recompute immediately on resume (backgrounding never leaves a stale/negative number).
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seconds = Math.ceil(remainingMs / 1000);

  return (
    <div className={styles.countdown} data-testid="birthday-countdown" data-mode={mode}>
      {mode === 'replay' && (
        <>
          {replayBadge && (
            <span className={styles.replayBadge} data-testid="birthday-countdown-replay-badge">
              {replayBadge}
            </span>
          )}
          <p className={styles.countdownLabel}>{replayLabel}</p>
        </>
      )}
      <p
        className={styles.countdownNumber}
        aria-live="polite"
        aria-label={`${seconds} ${secondsLabel}`}
        data-testid="birthday-countdown-number"
      >
        {seconds}
      </p>
    </div>
  );
}

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useSessionAccess } from '../../hooks/useSessionAccess';
import { isNetworkFailure } from '../../services/accessApiClient';
import { gateLogin } from '../../services/accessClient';
import { generateClientId } from '../../services/clientIds';
import { getOrCreateDeviceId } from '../../services/deviceId';
import { LoadingState } from '../../components/LoadingState';
import { ContentRuntimeLab } from '../content-lab/ContentRuntimeLab';
import { DigitDial } from './DigitDial';
import styles from './GatePage.module.css';

type GateFeedback =
  | { kind: 'idle' }
  | { kind: 'invalid'; remainingAttempts: number | null }
  | { kind: 'rateLimited'; secondsLeft: number }
  | { kind: 'offline' };

const DIGIT_LABELS = ['First digit', 'Second digit', 'Third digit', 'Fourth digit'];

export function GatePage() {
  const { status, session, markAuthenticated, logout } = useSessionAccess('owner');
  const [digits, setDigits] = useState<[number, number, number, number]>([0, 0, 0, 0]);
  // How many of the four digits have been explicitly typed via the global
  // sequential keyboard flow (independent of a single dial's own value —
  // never combined into a string, only counted).
  const [filledCount, setFilledCount] = useState(0);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<GateFeedback>({ kind: 'idle' });
  const countdownRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (countdownRef.current !== null) window.clearInterval(countdownRef.current);
    };
  }, []);

  // Land keyboard focus on the Gate as soon as the unauthenticated form is
  // shown (first resolution, or right after logout) so digits can be typed
  // without clicking or tabbing to a dial first.
  useEffect(() => {
    if (status === 'unauthenticated') {
      containerRef.current?.focus();
    }
  }, [status]);

  const isBlocked = feedback.kind === 'rateLimited';
  const disabled = pending || isBlocked;

  function setDigitAt(index: number, value: number) {
    setDigits((prev) => {
      const next = [...prev] as [number, number, number, number];
      next[index] = value;
      return next;
    });
  }

  function startCooldownCountdown(seconds: number) {
    if (countdownRef.current !== null) window.clearInterval(countdownRef.current);
    setFeedback({ kind: 'rateLimited', secondsLeft: seconds });
    countdownRef.current = window.setInterval(() => {
      setFeedback((current) => {
        if (current.kind !== 'rateLimited') return current;
        if (current.secondsLeft <= 1) {
          if (countdownRef.current !== null) window.clearInterval(countdownRef.current);
          return { kind: 'idle' };
        }
        return { kind: 'rateLimited', secondsLeft: current.secondsLeft - 1 };
      });
    }, 1000);
  }

  async function handleSubmit() {
    if (pending || feedback.kind === 'rateLimited') return;
    setPending(true);

    const attemptId = generateClientId();
    const deviceId = getOrCreateDeviceId();
    const submittedDigits = digits.map(String);

    const result = await gateLogin({
      digits: submittedDigits,
      deviceId,
      attemptId,
      language: navigator.language,
    });

    setPending(false);
    // Never keep the entered digits in state any longer than the request needed.
    setDigits([0, 0, 0, 0]);
    setFilledCount(0);

    if (isNetworkFailure(result)) {
      setFeedback({ kind: 'offline' });
      containerRef.current?.focus();
      return;
    }
    if (result.ok) {
      markAuthenticated(result.session);
      setFeedback({ kind: 'idle' });
      return;
    }
    if (result.code === 'RATE_LIMITED') {
      const seconds =
        result.rateLimit?.retryAfterSeconds ?? result.rateLimit?.cooldownSeconds ?? 10;
      startCooldownCountdown(seconds);
      containerRef.current?.focus();
      return;
    }
    setFeedback({
      kind: 'invalid',
      remainingAttempts: result.rateLimit?.remainingAttempts ?? null,
    });
    containerRef.current?.focus();
  }

  function handleContainerKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    // An individual dial (arrows/Home/End/direct digit) already handled and
    // preventDefault()-ed this event — never double-handle it here.
    if (event.defaultPrevented || disabled) return;

    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      if (filledCount >= 4) return;
      setDigitAt(filledCount, Number(event.key));
      setFilledCount(filledCount + 1);
      return;
    }

    if (event.key === 'Backspace') {
      event.preventDefault();
      if (filledCount === 0) return;
      const previousIndex = filledCount - 1;
      setDigitAt(previousIndex, 0);
      setFilledCount(previousIndex);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (filledCount === 4) void handleSubmit();
    }
  }

  if (status === 'resolving') {
    return (
      <div className={styles.page}>
        <LoadingState label="Checking for a saved Gate session…" />
      </div>
    );
  }

  if (status === 'offline') {
    return (
      <div className={styles.page}>
        <h1>Veoulla&apos;s World</h1>
        <p role="alert">Could not reach the backend. Please check your connection and reload.</p>
      </div>
    );
  }

  if (status === 'authenticated' && session) {
    return (
      <div className={styles.page}>
        <h1>Veoulla&apos;s World</h1>
        <p className={styles.grantedTitle} role="status">
          Access granted
        </p>
        <ContentRuntimeLab />
        <button type="button" className={styles.logoutButton} onClick={() => void logout()}>
          Log out
        </button>
      </div>
    );
  }

  return (
    <div
      className={styles.page}
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={handleContainerKeyDown}
      data-testid="gate-root"
    >
      <h1>Veoulla&apos;s World</h1>
      <p className={styles.subtitle}>The Gate</p>

      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
      >
        <div className={styles.dials} role="group" aria-label="Four-digit Gate code">
          {digits.map((digit, index) => (
            <DigitDial
              key={index}
              label={DIGIT_LABELS[index]!}
              value={digit}
              onChange={(value) => setDigitAt(index, value)}
              disabled={disabled}
            />
          ))}
        </div>

        <button type="submit" className={styles.submitButton} disabled={disabled}>
          {pending ? 'Checking…' : 'Enter'}
        </button>
      </form>

      <div className={styles.feedbackArea} aria-live="polite">
        {feedback.kind === 'invalid' && (
          <p className={styles.invalid} role="alert">
            Incorrect code. Please try again.
            {feedback.remainingAttempts !== null && (
              <> {feedback.remainingAttempts} attempt(s) remaining before a short cooldown.</>
            )}
          </p>
        )}
        {feedback.kind === 'rateLimited' && (
          <p className={styles.cooldown} role="alert">
            Too many attempts. Try again in {feedback.secondsLeft} second
            {feedback.secondsLeft === 1 ? '' : 's'}.
          </p>
        )}
      </div>
    </div>
  );
}

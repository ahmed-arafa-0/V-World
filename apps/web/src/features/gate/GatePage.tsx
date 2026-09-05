import { useEffect, useRef, useState } from 'react';
import { useSessionAccess } from '../../hooks/useSessionAccess';
import { isNetworkFailure } from '../../services/accessApiClient';
import { gateLogin } from '../../services/accessClient';
import { generateClientId } from '../../services/clientIds';
import { getOrCreateDeviceId } from '../../services/deviceId';
import { LoadingState } from '../../components/LoadingState';
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
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<GateFeedback>({ kind: 'idle' });
  const countdownRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (countdownRef.current !== null) window.clearInterval(countdownRef.current);
    };
  }, []);

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

    if (isNetworkFailure(result)) {
      setFeedback({ kind: 'offline' });
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
      return;
    }
    setFeedback({
      kind: 'invalid',
      remainingAttempts: result.rateLimit?.remainingAttempts ?? null,
    });
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
        <div className={styles.granted} role="status">
          <p className={styles.grantedTitle}>Access granted</p>
          <p>World loading…</p>
        </div>
        <button type="button" className={styles.logoutButton} onClick={() => void logout()}>
          Log out
        </button>
      </div>
    );
  }

  const isBlocked = feedback.kind === 'rateLimited';
  const disabled = pending || isBlocked;

  return (
    <div className={styles.page}>
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

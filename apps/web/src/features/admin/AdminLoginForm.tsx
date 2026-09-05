import { useRef, useState } from 'react';
import type { SafeSessionSummary } from '@veoullas-world/contracts';
import { isNetworkFailure } from '../../services/accessApiClient';
import { adminLogin } from '../../services/accessClient';
import { generateClientId } from '../../services/clientIds';
import { getOrCreateDeviceId } from '../../services/deviceId';
import styles from './AdminLoginForm.module.css';

type AdminLoginFeedback =
  | { kind: 'idle' }
  | { kind: 'invalid'; remainingAttempts: number | null }
  | { kind: 'rateLimited'; secondsLeft: number }
  | { kind: 'offline' };

interface AdminLoginFormProps {
  onSuccess: (session: SafeSessionSummary) => void;
}

export function AdminLoginForm({ onSuccess }: AdminLoginFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<AdminLoginFeedback>({ kind: 'idle' });
  const countdownRef = useRef<number | null>(null);

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
    const submittedPassword = password;

    const result = await adminLogin({
      username,
      password: submittedPassword,
      deviceId,
      attemptId,
      language: navigator.language,
    });

    setPending(false);
    // Never preserve or repopulate the password after submission, success or failure.
    setPassword('');

    if (isNetworkFailure(result)) {
      setFeedback({ kind: 'offline' });
      return;
    }
    if (result.ok) {
      setFeedback({ kind: 'idle' });
      onSuccess(result.session);
      return;
    }
    if (result.code === 'RATE_LIMITED') {
      const seconds =
        result.rateLimit?.retryAfterSeconds ?? result.rateLimit?.cooldownSeconds ?? 30;
      startCooldownCountdown(seconds);
      return;
    }
    setFeedback({
      kind: 'invalid',
      remainingAttempts: result.rateLimit?.remainingAttempts ?? null,
    });
  }

  const disabled = pending || feedback.kind === 'rateLimited';

  return (
    <div className={styles.page}>
      <h1>Admin</h1>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
      >
        <label className={styles.field}>
          <span>Username</span>
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={disabled}
            required
          />
        </label>
        <label className={styles.field}>
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={disabled}
            required
          />
        </label>
        <button type="submit" className={styles.submitButton} disabled={disabled}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {feedback.kind === 'invalid' && (
        <p className={styles.invalid} role="alert">
          Incorrect username or password.
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
      {feedback.kind === 'offline' && (
        <p className={styles.invalid} role="alert">
          Could not reach the backend. Please check your connection and try again.
        </p>
      )}
    </div>
  );
}

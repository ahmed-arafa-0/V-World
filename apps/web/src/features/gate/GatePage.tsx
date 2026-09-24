import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type {
  RuntimeAssetStatus,
  RuntimeIconEntry,
  RuntimeUiTextEntry,
} from '@veoullas-world/contracts';
import { useSessionAccess } from '../../hooks/useSessionAccess';
import { isNetworkFailure } from '../../services/accessApiClient';
import { gateLogin } from '../../services/accessClient';
import { generateClientId } from '../../services/clientIds';
import { getOrCreateDeviceId } from '../../services/deviceId';
import { mobileMediaRef } from '../../services/mediaVariant';
import { fetchPreGateContent } from '../../services/preGateContentClient';
import { LoadingState } from '../../components/LoadingState';
import { useGateFrame } from '../first-opening/coverFrame';
import { FirstOpeningFlow } from '../first-opening/FirstOpeningFlow';
import { PreGateSequence } from '../first-opening/PreGateSequence';
import { hasSeenGateOpening, markGateOpeningSeen } from '../first-opening/preGateStorage';
import { PlayerSettings } from '../player/PlayerSettings';
import { useLocaleStore } from '../../i18n/localeStore';
import { playerText, type PlayerTextKey } from '../../i18n/playerText';
import { DigitDial } from './DigitDial';
import styles from './GatePage.module.css';

/**
 * Real `10_ASSETS` id for the closed-Gate dial-entry background — public,
 * pre-authentication (this screen renders before any owner session exists).
 * Served through the narrow `/api/public-media/:assetId` allowlist per
 * Ahmed's 2026-09-18 explicit authorization; see
 * docs/assets/PHASE_1_ASSET_HANDOFF.md §6.
 */
const GATE_CLOSED_BACKGROUND_ASSET_ID = 'gate_closed_bg';

type GateFeedback =
  | { kind: 'idle' }
  | { kind: 'invalid'; remainingAttempts: number | null }
  | { kind: 'rateLimited'; secondsLeft: number }
  | { kind: 'offline' };

const DIGIT_LABELS: PlayerTextKey[] = ['digit1', 'digit2', 'digit3', 'digit4'];

export function GatePage() {
  const locale = useLocaleStore((s) => s.locale);
  const [uiText, setUiText] = useState<RuntimeUiTextEntry[]>([]);
  const [icons, setIcons] = useState<RuntimeIconEntry[]>([]);
  const t = (key: PlayerTextKey) => playerText(key, locale, uiText);
  const { status, session, markAuthenticated, logout } = useSessionAccess('owner');
  const [digits, setDigits] = useState<[number, number, number, number]>([0, 0, 0, 0]);
  // How many of the four digits have been explicitly typed via the global
  // sequential keyboard flow (independent of a single dial's own value —
  // never combined into a string, only counted).
  const [filledCount, setFilledCount] = useState(0);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<GateFeedback>({ kind: 'idle' });
  const [preGateDone, setPreGateDone] = useState(() => hasSeenGateOpening());
  const [gateBackground, setGateBackground] = useState<RuntimeAssetStatus | null>(null);
  const countdownRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [formHeight, setFormHeight] = useState(0);
  const gate = useGateFrame();
  // True only immediately after a fresh, successful Gate submission in this
  // tab — never true for a resumed session (page refresh) — so
  // FirstOpeningFlow knows whether to play the one-time doors/VAR-jump
  // transition or skip straight to a checkpoint-based resume.
  const justAuthenticatedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (countdownRef.current !== null) window.clearInterval(countdownRef.current);
    };
  }, []);

  // Non-blocking, public (no session needed) — a missing/offline/not-yet-
  // registered background simply leaves gateBackground null and the dial
  // screen renders exactly as it always has.
  useEffect(() => {
    let cancelled = false;
    fetchPreGateContent().then((result) => {
      if (cancelled || result.status !== 'online') return;
      setUiText(result.data.uiText);
      setIcons(result.data.icons ?? []);
      setGateBackground(
        result.data.assets.find((a) => a.assetId === GATE_CLOSED_BACKGROUND_ASSET_ID) ?? null,
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Land keyboard focus on the Gate as soon as the dial form is actually
  // shown (first resolution past the opening sequence, or right after
  // logout) so digits can be typed without clicking or tabbing to a dial
  // first.
  useEffect(() => {
    if (status === 'unauthenticated' && preGateDone) {
      const gateRoot = containerRef.current;
      if (gateRoot && !gateRoot.contains(document.activeElement)) {
        gateRoot.focus();
      }
    }
  }, [status, preGateDone]);

  useLayoutEffect(() => {
    if (formRef.current) setFormHeight(formRef.current.offsetHeight);
  }, [status, preGateDone, pending]);

  // The dials sit centred on the door, directly beneath the painted lock, so the
  // illustrated knobs and keyhole stay visible. Without the art, the CSS default applies.
  const formStyle: CSSProperties | undefined = gateBackground
    ? {
        top: Math.max(
          8,
          Math.min(
            gate.frame.top + gate.frame.height * gate.layout.lockBottom + 8,
            window.innerHeight - formHeight - 12,
          ),
        ),
        bottom: 'auto',
      }
    : undefined;

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
      justAuthenticatedRef.current = true;
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
    // preventDefault()-ed this event — never double-handle it here. Also a
    // no-op while the pre-Gate opening sequence is still showing — the
    // dials don't exist yet.
    if (event.defaultPrevented || disabled || !preGateDone) return;

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
        <LoadingState label={t('loading')} />
      </div>
    );
  }

  if (status === 'offline') {
    return (
      <div className={styles.page}>
        <h1>Veoulla&apos;s World</h1>
        <p role="alert">{t('offline')}</p>
      </div>
    );
  }

  if (status === 'authenticated' && session) {
    return (
      <div className={styles.page}>
        <PlayerSettings uiText={uiText} icons={icons} onLogout={() => void logout()} />
        <FirstOpeningFlow
          justAuthenticated={justAuthenticatedRef.current}
          userId={session.userId}
        />
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
      <PlayerSettings uiText={uiText} icons={icons} />
      {preGateDone && gateBackground && (
        <picture>
          {mobileMediaRef(gateBackground) && (
            <source media="(max-aspect-ratio: 1/1)" srcSet={mobileMediaRef(gateBackground)!} />
          )}
          <img
            className={styles.pageBackgroundImg}
            src={gateBackground.mediaRef}
            alt=""
            data-testid="gate-closed-background"
          />
        </picture>
      )}

      {!preGateDone && (
        <PreGateSequence
          onComplete={() => {
            markGateOpeningSeen();
            setPreGateDone(true);
          }}
        />
      )}

      {preGateDone && (
        <>
          <form
            ref={formRef}
            className={styles.form}
            style={formStyle}
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
          >
            <div className={styles.dials} role="group" aria-label={t('code')}>
              {digits.map((digit, index) => (
                <DigitDial
                  key={index}
                  label={t(DIGIT_LABELS[index]!)}
                  value={digit}
                  onChange={(value) => setDigitAt(index, value)}
                  disabled={disabled}
                />
              ))}
            </div>

            <button type="submit" className={styles.submitButton} disabled={disabled}>
              {pending ? t('loading') : t('enter')}
            </button>
          </form>

          <div className={styles.feedbackArea} aria-live="polite">
            {feedback.kind === 'offline' && <p role="alert">{t('offline')}</p>}
            {feedback.kind === 'invalid' && (
              <p className={styles.invalid} role="alert">
                {t('invalid')}
                {feedback.remainingAttempts !== null && (
                  <> {t('attempts').replace('{count}', String(feedback.remainingAttempts))}</>
                )}
              </p>
            )}
            {feedback.kind === 'rateLimited' && (
              <p className={styles.cooldown} role="alert">
                {t('cooldown').replace('{count}', String(feedback.secondsLeft))}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { BirthdayStateResponse } from '@veoullas-world/contracts';
import { useWorld } from '../world/WorldContext';
import { ActionButton, TextBlock } from '../world/ui';
import { birthdayApi } from './birthdayClient';
import { Confetti } from './Confetti';
import { Countdown } from './Countdown';
import styles from './birthday.module.css';

type Step =
  | 'idle'
  | 'invitation'
  | 'countdown'
  | 'reveal'
  | 'garden'
  | 'cake_wish'
  | 'letter'
  | 'gifts'
  /** The persistent birthday-entry menu, offered once the player has completed at least once. */
  | 'menu'
  /** "أعيدي آخر ٢٠ ثانية": the final-20-seconds cinematic alone — never touches gifts/completion. */
  | 'countdown_replay_only';

/** Three candle bodies, each with its own flame overlay, anchored on the back/top icing (clear of
 * the sunflower + blueberries decoration painted into the cake art). Percentages are the candle's
 * own base (where it meets the icing), calibrated against `birthday_cake_base_v2.png`'s 1254×1254
 * canvas — recalibrate if a future cake derivative changes the icing layout. */
const CANDLE_ANCHORS = [
  { x: 61, y: 30 },
  { x: 71, y: 31 },
  { x: 80, y: 34 },
];

/** How long a "Later" tap keeps the invitation from reappearing in this session — never permanent. */
const LATER_COOLDOWN_MS = 90_000;
/** While nothing is offered yet, how often the window is rechecked (catches the countdown opening). */
const POLL_MS = 5_000;

function hasBlockingDialog() {
  return [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].some(
    (node) => !node.closest('[data-birthday-overlay]'),
  );
}

function TemporaryVisual({ label }: { label: string }) {
  return (
    <div className={styles.temporaryVisual} data-testid="birthday-temporary-visual">
      {label}
    </div>
  );
}

export interface BirthdayOverlayProps {
  /** Suppresses the invitation prompt only — never interrupts an already-open celebration. */
  deferred: boolean;
}

/**
 * birthday_2026 (M16 narrow scope): a self-contained overlay, fetching and mutating its own state
 * independently of the ordinary world/journey flow — see `apps/functions/src/world/birthday.ts`.
 * Mounting/unmounting this component never touches `place`/`journey`, so closing it (Skip, Later,
 * or finishing) always returns the player to exactly the ordinary screen they were already on.
 */
export function BirthdayOverlay({ deferred }: BirthdayOverlayProps) {
  const env = useWorld();
  const locale = env.locale;
  const [birthday, setBirthday] = useState<BirthdayStateResponse | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [celebrating, setCelebrating] = useState(false);
  const [wishText, setWishText] = useState('');
  const [wishSaved, setWishSaved] = useState(false);
  const [replayCandleOut, setReplayCandleOut] = useState(false);
  const [blockingDialog, setBlockingDialog] = useState(false);
  const isDeferred = deferred || blockingDialog;
  useEffect(() => {
    const update = () => setBlockingDialog(hasBlockingDialog());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['role', 'aria-modal'],
    });
    return () => observer.disconnect();
  }, []);
  const laterUntil = useRef(0);
  const automaticInvitation = useRef(false);
  const completeCalled = useRef(false);
  /** Set only when the player explicitly starts "نحتفل تاني" from the menu — a fresh id per replay,
   * so `completeCelebration` counts exactly that one replay and never a retry of it. */
  const replayOpRef = useRef<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    const r = await birthdayApi.get(locale);
    if (r.status === 'online') setBirthday(r.data);
    return r.status === 'online' ? r.data : null;
  }, [locale]);

  // Initial load, then a light poll only while nothing is being shown yet — stops the moment the
  // player is actually inside the flow, so an in-progress countdown/garden/cake step is never
  // interrupted by a background refetch.
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (step !== 'idle' && step !== 'invitation') return;
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [step, refresh]);

  /**
   * Automatic invitations stop at the end of the event. Late first-time arrivals keep manual
   * access through the persistent entry control. A player who has already
   * completed at least once is never auto-interrupted again — they reach the celebration through
   * the persistent entry control instead (see `showEntryButton`/`menu` below).
   */
  const offerable = Boolean(
    birthday?.enabled &&
    !birthday.stage?.giftsClaimed &&
    (birthday.window === 'countdown' || birthday.window === 'live'),
  );
  const isReplayEntry = Boolean(
    birthday?.enabled && birthday.window === 'after' && Boolean(birthday.stage?.completedAt),
  );
  /** The persistent birthday-entry control: visible once the event has opened at all, never only
   * while the invitation happens to be showing, and hidden under the same deferral as the invitation. */
  const showEntryButton = Boolean(
    birthday?.enabled && birthday.window !== 'before' && step === 'idle' && !isDeferred,
  );
  const canReplay = Boolean(birthday?.stage?.completedAt);

  // Offering the invitation is a state transition (never a render-time side effect): it only
  // happens once the player is not deferred and not on a "Later" cooldown, re-checked on every
  // poll tick or prop change.
  useEffect(() => {
    if (step !== 'idle' || !offerable || isDeferred || hasBlockingDialog()) return;
    if (Date.now() < laterUntil.current) return;
    automaticInvitation.current = true;
    setStep('invitation');
  }, [step, offerable, isDeferred, birthday]);

  useEffect(() => {
    if (step === 'invitation' && (isDeferred || (automaticInvitation.current && !offerable)))
      setStep('idle');
  }, [step, isDeferred, offerable]);

  if (!birthday?.enabled) return null;
  if (step === 'idle') {
    if (!showEntryButton) return null;
    return (
      <button
        type="button"
        className={styles.entryButton}
        data-testid="birthday-entry"
        aria-label={env.t(canReplay ? 'birthday_entry_replay_label' : 'birthday_entry_label')}
        title={env.t(canReplay ? 'birthday_entry_replay_label' : 'birthday_entry_label')}
        onClick={() => {
          automaticInvitation.current = false;
          setStep(canReplay ? 'menu' : 'invitation');
        }}
      >
        <span aria-hidden="true">🎂</span>
      </button>
    );
  }

  async function accept() {
    const accepted = await birthdayApi.accept(locale);
    if (accepted.status !== 'online') return;
    setBirthday(accepted.data);
    setStep('countdown');
  }
  async function later() {
    await birthdayApi.dismiss(locale);
    laterUntil.current = Date.now() + LATER_COOLDOWN_MS;
    setStep('idle');
  }
  /** Jumps straight to the letter/gifts — the cinematic parts (confetti, garden, cake, wish) are
   * skippable, never the reward-bearing steps themselves. */
  function skip() {
    setStep('letter');
  }
  async function finishAndClose() {
    if (completeCalled.current) return;
    completeCalled.current = true;
    const next = await birthdayApi.complete(locale, replayOpRef.current);
    if (next.status !== 'online') {
      completeCalled.current = false;
      return;
    }
    setBirthday(next.data);
    closeOverlay();
  }
  function closeOverlay() {
    setCelebrating(false);
    completeCalled.current = false;
    replayOpRef.current = undefined;
    setStep('idle');
  }
  /** "نحتفل تاني": replays the full celebration visuals. Gifts are already claimed, so the gifts
   * step simply shows them as claimed; `completeCelebration` gets a fresh id so this one replay —
   * and only this one — is counted. */
  function replayCelebration() {
    setCelebrating(true);
    setReplayCandleOut(false);
    completeCalled.current = false;
    replayOpRef.current =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `replay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setStep('reveal');
  }

  const backdrop = (children: ReactNode, testId: string) =>
    createPortal(
      <div
        className={styles.overlayBackdrop}
        data-testid={testId}
        data-birthday-overlay
        dir={locale === 'ar-EG' ? 'rtl' : 'ltr'}
      >
        {celebrating && <Confetti />}
        <div className={styles.overlayCard} role="dialog" aria-modal="true">
          {children}
        </div>
      </div>,
      document.body,
    );

  if (step === 'invitation') {
    return backdrop(
      <>
        <TextBlock
          text={env.t(isReplayEntry ? 'birthday_replay_celebration' : 'birthday_invite')}
          dir={env.locale === 'ar-EG' ? 'rtl' : 'ltr'}
          testId="birthday-invite-text"
        />
        <div className={styles.row}>
          <ActionButton testId="birthday-celebrate-now" onClick={() => void accept()}>
            {env.t('birthday_celebrate_now')}
          </ActionButton>
          <ActionButton quiet testId="birthday-later" onClick={() => void later()}>
            {env.t('birthday_later')}
          </ActionButton>
        </div>
      </>,
      'birthday-invitation',
    );
  }

  if (step === 'menu') {
    return backdrop(
      <>
        <TextBlock
          text={env.t('birthday_menu_intro')}
          dir={env.locale === 'ar-EG' ? 'rtl' : 'ltr'}
          testId="birthday-menu-intro"
        />
        <div className={styles.row}>
          <ActionButton testId="birthday-replay-celebration" onClick={replayCelebration}>
            {env.t('birthday_replay_celebration_cta')}
          </ActionButton>
          <ActionButton
            quiet
            testId="birthday-replay-countdown-only"
            onClick={() => setStep('countdown_replay_only')}
          >
            {env.t('birthday_replay_countdown_cta')}
          </ActionButton>
        </div>
        <ActionButton quiet testId="birthday-menu-close" onClick={closeOverlay}>
          {env.t('close')}
        </ActionButton>
      </>,
      'birthday-menu-step',
    );
  }

  if (step === 'countdown_replay_only') {
    return backdrop(
      <>
        <Countdown
          mode="replay"
          targetAt={birthday.targetAt}
          serverNow={birthday.serverNow}
          onZero={() => setCelebrating(true)}
          replayLabel={env.t('birthday_replay_countdown')}
          replayBadge={env.t('birthday_replay_badge')}
          secondsLabel={env.t('birthday_seconds_label')}
        />
        <div className={styles.row}>
          <ActionButton quiet testId="birthday-replay-countdown-only-close" onClick={closeOverlay}>
            {env.t('birthday_skip')}
          </ActionButton>
        </div>
      </>,
      'birthday-countdown-replay-step',
    );
  }

  const footer = (
    <div className={styles.row}>
      <ActionButton quiet testId="birthday-skip" onClick={skip}>
        {env.t('birthday_skip')}
      </ActionButton>
    </div>
  );

  if (step === 'countdown') {
    return backdrop(
      <>
        <Countdown
          mode={birthday.window === 'countdown' ? 'live' : 'replay'}
          targetAt={birthday.targetAt}
          serverNow={birthday.serverNow}
          onZero={() => {
            setCelebrating(true);
            setStep('reveal');
          }}
          replayLabel={env.t('birthday_replay_countdown')}
          replayBadge={env.t('birthday_replay_badge')}
          secondsLabel={env.t('birthday_seconds_label')}
        />
        {footer}
      </>,
      'birthday-countdown-step',
    );
  }

  if (step === 'reveal') {
    return backdrop(
      <>
        <p
          className={styles.greeting}
          dir={env.locale === 'ar-EG' ? 'rtl' : 'ltr'}
          data-testid="birthday-greeting"
        >
          {env.t('birthday_greeting')}
        </p>
        <ActionButton testId="birthday-continue-reveal" onClick={() => setStep('garden')}>
          {env.t('birthday_continue')}
        </ActionButton>
      </>,
      'birthday-reveal-step',
    );
  }

  if (step === 'garden') {
    const isPortrait = window.matchMedia?.('(max-aspect-ratio: 1/1)').matches ?? false;
    const gardenRef =
      (isPortrait ? birthday.media.gardenPortraitRef : birthday.media.gardenDesktopRef) ??
      birthday.media.gardenDesktopRef;
    const catRef = env.assetRef('var_idle_collar');
    const marcelinoRef = env.assetRef('marcelino_idle');
    return backdrop(
      <>
        <div
          className={styles.gardenStage}
          data-testid="birthday-garden"
          style={{ aspectRatio: isPortrait ? '941 / 1672' : '1672 / 941' }}
        >
          {gardenRef ? (
            <img src={gardenRef} alt="" className={styles.gardenImage} />
          ) : (
            <TemporaryVisual label={env.t('temporary_visual')} />
          )}
          <div className={styles.gardenCat} data-testid="birthday-garden-cat">
            {catRef ? (
              <img src={catRef} alt="" className={styles.gardenSpriteImg} />
            ) : (
              <span aria-hidden="true">🐈</span>
            )}
            {birthday.cat.name && (
              <span className={styles.gardenCaption} data-testid="birthday-garden-cat-name">
                {birthday.cat.name}
              </span>
            )}
          </div>
          <div className={styles.gardenMarcelino} data-testid="birthday-garden-marcelino">
            {marcelinoRef ? (
              <img src={marcelinoRef} alt="" className={styles.gardenSpriteImg} />
            ) : (
              <span aria-hidden="true">🐥</span>
            )}
          </div>
        </div>
        {footer}
        <ActionButton testId="birthday-continue-garden" onClick={() => setStep('cake_wish')}>
          {env.t('birthday_continue')}
        </ActionButton>
      </>,
      'birthday-garden-step',
    );
  }

  if (step === 'cake_wish') {
    const litOut = replayOpRef.current ? replayCandleOut : birthday.stage.candleExtinguished;
    return backdrop(
      <>
        <div className={styles.cakeStage} data-testid="birthday-cake">
          {birthday.media.cakeRef ? (
            <img src={birthday.media.cakeRef} alt="" className={styles.cakeImage} />
          ) : (
            <TemporaryVisual label={env.t('temporary_visual')} />
          )}
          {CANDLE_ANCHORS.map((anchor, i) => (
            <div
              key={i}
              className={styles.candleSlot}
              style={{ left: `${anchor.x}%`, top: `${anchor.y}%` }}
              data-testid={`birthday-candle-${i + 1}`}
            >
              {birthday.media.candleUnlitRef ? (
                <svg viewBox="418 156 214 1245" className={styles.candleBody} aria-hidden="true">
                  <image href={birthday.media.candleUnlitRef} width="1060" height="1484" />
                </svg>
              ) : (
                <span aria-hidden="true" className={styles.candleBodyFallback}>
                  🕯️
                </span>
              )}
              {!litOut &&
                (birthday.media.candleFlameRef ? (
                  <svg
                    viewBox="160 190 720 1200"
                    className={styles.candleFlameImg}
                    aria-hidden="true"
                    data-testid={`birthday-flame-${i + 1}`}
                  >
                    <image href={birthday.media.candleFlameRef} width="1024" height="1536" />
                  </svg>
                ) : (
                  <span aria-hidden="true" className={styles.candleFlameFallback}>
                    🔥
                  </span>
                ))}
            </div>
          ))}
          <button
            type="button"
            className={styles.extinguishButton}
            data-testid="birthday-candle"
            data-lit={litOut ? 'false' : 'true'}
            aria-label={env.t('birthday_extinguish_candle')}
            disabled={litOut}
            onClick={async () => {
              if (replayOpRef.current) {
                setReplayCandleOut(true);
                return;
              }
              const next = await birthdayApi.extinguishCandle(locale);
              if (next.status === 'online') setBirthday(next.data);
            }}
          >
            {env.t('birthday_extinguish_candle')}
          </button>
        </div>
        <TextBlock
          text={env.t('birthday_wish_prompt')}
          dir={env.locale === 'ar-EG' ? 'rtl' : 'ltr'}
          testId="birthday-wish-prompt"
        />
        {!wishSaved && !birthday.stage.wishSkippedAt && !birthday.stage.wish && (
          <>
            <textarea
              className={styles.wishInput}
              data-testid="birthday-wish-input"
              placeholder={env.t('birthday_wish_placeholder')}
              maxLength={500}
              value={wishText}
              onChange={(e) => setWishText(e.target.value)}
              dir={env.locale === 'ar-EG' ? 'rtl' : 'ltr'}
            />
            <div className={styles.row}>
              <ActionButton
                testId="birthday-wish-save"
                disabled={!wishText.trim()}
                onClick={async () => {
                  const next = await birthdayApi.saveWish(locale, wishText.trim());
                  if (next.status === 'online') setBirthday(next.data);
                  setWishSaved(true);
                }}
              >
                {env.t('birthday_wish_save')}
              </ActionButton>
              <ActionButton
                quiet
                testId="birthday-wish-skip"
                onClick={async () => {
                  const next = await birthdayApi.skipWish(locale);
                  if (next.status === 'online') setBirthday(next.data);
                  setWishSaved(true);
                }}
              >
                {env.t('birthday_skip')}
              </ActionButton>
            </div>
          </>
        )}
        {(wishSaved || birthday.stage.wish || birthday.stage.wishSkippedAt) && (
          <TextBlock text={env.t('birthday_wish_saved')} testId="birthday-wish-confirmed" />
        )}
        {footer}
        <ActionButton
          testId="birthday-continue-cake"
          disabled={!litOut}
          onClick={() => setStep('letter')}
        >
          {env.t('birthday_continue')}
        </ActionButton>
      </>,
      'birthday-cake-step',
    );
  }

  if (step === 'letter') {
    const letter = birthday.letter;
    return backdrop(
      <>
        <h2 className={styles.letterTitle}>{env.t('birthday_letter_title')}</h2>
        {!letter || letter.contentPending ? (
          <TextBlock text={env.t('birthday_letter_pending')} testId="birthday-letter-pending" />
        ) : (
          <p
            className={styles.letterBody}
            dir={letter.direction}
            data-testid="birthday-letter-text"
          >
            {letter.text}
          </p>
        )}
        {footer}
        <ActionButton testId="birthday-continue-letter" onClick={() => setStep('gifts')}>
          {env.t('birthday_continue')}
        </ActionButton>
      </>,
      'birthday-letter-step',
    );
  }

  if (step === 'gifts') {
    const claimed = birthday.stage.giftsClaimed;
    return backdrop(
      <>
        <TextBlock
          text={env.t('birthday_gifts_intro')}
          dir={env.locale === 'ar-EG' ? 'rtl' : 'ltr'}
          testId="birthday-gifts-intro"
        />
        <ul className={styles.giftList}>
          <li data-testid="birthday-gift-letter">{env.t('birthday_gift_letter_label')}</li>
          <li data-testid="birthday-gift-decoration">
            {birthday.media.decorationRef && (
              <img src={birthday.media.decorationRef} alt="" className={styles.giftIcon} />
            )}
            {env.t('birthday_gift_decoration_label')}
            {!birthday.media.decorationRef && <TemporaryVisual label={env.t('temporary_visual')} />}
            {claimed && (
              <TextBlock
                text={env.t('birthday_gift_decoration_placed_hint')}
                testId="birthday-gift-decoration-hint"
              />
            )}
          </li>
          <li data-testid="birthday-gift-achievement">
            {claimed && birthday.achievement?.iconRef && (
              <img
                src={birthday.achievement.iconRef}
                alt=""
                className={styles.giftIcon}
                data-testid="birthday-achievement-badge"
              />
            )}
            {env.t('birthday_gift_achievement_label')}
            {claimed && birthday.achievement?.title ? ` — ${birthday.achievement.title}` : ''}
          </li>
        </ul>
        {!claimed ? (
          <ActionButton
            testId="birthday-gifts-claim"
            onClick={async () => {
              const next = await birthdayApi.claimGifts(locale);
              if (next.status === 'online') setBirthday(next.data);
            }}
          >
            {env.t('birthday_gift_claim')}
          </ActionButton>
        ) : (
          <TextBlock text={env.t('birthday_gift_claimed')} testId="birthday-gifts-claimed" />
        )}
        <ActionButton
          testId="birthday-continue-gifts"
          disabled={!claimed}
          onClick={() => void finishAndClose()}
        >
          {env.t('birthday_continue')}
        </ActionButton>
      </>,
      'birthday-gifts-step',
    );
  }

  return null;
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  JourneyStateResponse,
  CottageStateResponse,
  CountdownView,
  MailboxDeliveryResponse,
  MailboxMessageView,
} from '@veoullas-world/contracts';
import { useWorld } from '../WorldContext';
import { worldApi } from '../worldClient';
import {
  ActionButton,
  CaptionedHotspot,
  Companion,
  CompanionHint,
  Hotspot,
  MarcelinoSprite,
  Panel,
  PlaceTitle,
  Stage,
  TextBlock,
  useAnchorStyle,
  useStageGeometry,
} from '../ui';
import { decorAnchor, paintedRect } from '../placeComposition';
import styles from '../world.module.css';

/** Display-text key for a permanently owned (never-consumed) decoration id, e.g. the birthday
 * sunflower vase. New owned-decoration ids added by a future gift reuse this same routing. */
function ownedDecorationLabelKey(decorationId: string): never {
  if (decorationId === 'birthday_cottage_decoration')
    return 'birthday_gift_decoration_label' as never;
  return 'cottage_decor' as never;
}

function useCottageState() {
  const env = useWorld();
  const [state, storeState] = useState<CottageStateResponse | null>(null);
  const revision = useRef(0);
  const setState: typeof storeState = useCallback((next) => {
    revision.current += 1;
    storeState(next);
  }, []);
  const [failed, setFailed] = useState(false);
  const reload = useCallback(async () => {
    const requestedAt = ++revision.current;
    const r = await worldApi.get<CottageStateResponse>('/cottage');
    if (requestedAt !== revision.current) return;
    // A partial answer must never crash the scene; keep whatever was last shown.
    if (r.status === 'online' && r.data?.decor) {
      setState(r.data);
      setFailed(false);
    } else if (r.status !== 'online') setFailed(true);
  }, [setState]);
  useEffect(() => {
    void reload();
  }, [reload, env.locale]);
  return { state, setState, reload, failed };
}

/** Remaining time split into whole days/hours/minutes/seconds. Pure, so it is testable without timers. */
export function splitRemaining(targetMs: number, nowMs: number) {
  const total = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

function Countdown({ countdown, serverNow }: { countdown: CountdownView; serverNow: string }) {
  const env = useWorld();
  // The device clock only supplies the ticking; the offset from server time is fixed at load.
  const [offset] = useState(() => Date.parse(serverNow) - Date.now());
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + offset), 1000);
    return () => window.clearInterval(id);
  }, [offset]);
  const done = countdown.completed || now >= Date.parse(countdown.targetAt);
  if (done) {
    return (
      <div className={styles.frame} data-testid="countdown-frame">
        <p>{env.t('cottage_memory_frame')}</p>
        <strong>{countdown.completedDate ?? countdown.targetAt.slice(0, 10)}</strong>
        {countdown.name ? <p>{countdown.name}</p> : null}
      </div>
    );
  }
  const parts = splitRemaining(Date.parse(countdown.targetAt), now);
  return (
    <div className={styles.countdown} data-testid="countdown">
      {(['days', 'hours', 'minutes', 'seconds'] as const).map((unit) => (
        <div key={unit}>
          <strong data-testid={`countdown-${unit}`}>{parts[unit]}</strong>
          {env.t(`cottage_${unit}`)}
        </div>
      ))}
    </div>
  );
}

/**
 * The live countdown drawn into the four blank display fields painted on the mantel (days, hours, minutes,
 * seconds). Real ticking text over the painting; the painting itself carries no numbers. Same server-anchored clock
 * as the countdown panel, which stays the readable, always-available view.
 */
function MantelCountdown({
  countdown,
  serverNow,
  onOpen,
}: {
  countdown: CountdownView;
  serverNow: string;
  onOpen: () => void;
}) {
  const env = useWorld();
  const [offset] = useState(() => Date.parse(serverNow) - Date.now());
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + offset), 1000);
    return () => window.clearInterval(id);
  }, [offset]);
  if (countdown.completed || now >= Date.parse(countdown.targetAt)) return null;
  const parts = splitRemaining(Date.parse(countdown.targetAt), now);
  return (
    <div data-testid="mantel-countdown" role="group" aria-label={env.t('cottage_countdown')}>
      {(['days', 'hours', 'minutes', 'seconds'] as const).map((unit) => (
        <MantelField
          key={unit}
          unit={unit}
          value={unit === 'days' ? String(parts[unit]) : String(parts[unit]).padStart(2, '0')}
          label={env.t(`cottage_${unit}`)}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function MantelField({
  unit,
  value,
  label,
  onOpen,
}: {
  unit: string;
  value: string;
  label: string;
  onOpen: () => void;
}) {
  const geometry = useStageGeometry();
  const labelRef = useRef<HTMLSpanElement>(null);
  const [labelScale, setLabelScale] = useState(1);
  const entry = geometry?.composition?.boxes?.[`countdown-${unit}`];
  const box =
    geometry?.plane && entry
      ? paintedRect(geometry.plane, entry[geometry.mobile ? 'mobile' : 'desktop'])
      : null;
  const width = box?.width ?? 0;
  const labelSize = box ? box.height * 0.23 : 0;
  useLayoutEffect(() => {
    const el = labelRef.current;
    if (!el || !width) return;
    // Measure actual localized glyphs, including Arabic shaping, before paint.
    el.style.fontSize = `${labelSize}px`;
    const scale = Math.min(1, (width * 0.96) / Math.max(1, el.scrollWidth));
    el.style.fontSize = `${labelSize * scale}px`;
    setLabelScale(scale);
  }, [label, labelSize, width]);
  if (!box) return null;
  const digitSize = Math.min(box.height * 0.53, (box.width * 0.92) / (value.length * 0.65));
  return (
    <button
      type="button"
      className={styles.mantelField}
      style={{ ...box, transform: 'skewY(-3deg)' }}
      onClick={onOpen}
      aria-label={`${label}: ${value}`}
      data-testid={`mantel-${unit}`}
    >
      <span className={styles.mantelDigits} style={{ fontSize: digitSize }}>
        {value}
      </span>
      <span
        ref={labelRef}
        className={styles.mantelUnit}
        style={{ fontSize: labelSize * labelScale }}
        data-testid={`mantel-unit-${unit}`}
      >
        {label}
      </span>
    </button>
  );
}

function MessageDetail({
  message,
  onOpened,
  onBack,
}: {
  message: MailboxMessageView;
  onOpened: (state: CottageStateResponse) => void;
  onBack: () => void;
}) {
  const env = useWorld();
  const [voice, setVoice] = useState<HTMLAudioElement | null>(null);

  async function translate(locale: string) {
    const r = await worldApi.post<CottageStateResponse>('/mailbox/translate', {
      messageId: message.messageId,
      targetLocale: locale,
    });
    if (r.status === 'online') onOpened(r.data);
  }

  return (
    <>
      <p className={styles.muted}>
        {env.t('cottage_from')}:{' '}
        {message.senderId === 'admin_ahmed' ? env.t('cottage_sender_arafa') : message.senderId}
      </p>
      {message.imageRefs.map((src) => (
        <img key={src} src={src} alt="" style={{ maxWidth: '100%', borderRadius: 10 }} />
      ))}
      <TextBlock text={message.text} dir={message.direction} testId="message-text" />
      <div
        className={styles.row}
        data-testid="message-ribbon"
        aria-label={env.t('cottage_translate')}
      >
        {message.availableLocales.map((l) => (
          <ActionButton
            key={l}
            quiet
            testId={`translate-${l}`}
            disabled={l === message.shownLocale}
            onClick={() => void translate(l)}
          >
            {l === message.initialLocale ? `${l} · ${env.t('cottage_original')}` : l}
          </ActionButton>
        ))}
      </div>
      {message.voiceNoteRef && (
        <>
          <ActionButton
            testId="voice-note"
            onClick={() => {
              const audio = voice ?? new Audio(message.voiceNoteRef!);
              setVoice(audio);
              void audio.play().catch(() => undefined);
            }}
          >
            {env.t('cottage_voice_note')}
          </ActionButton>
        </>
      )}
      <ActionButton quiet testId="message-back" onClick={onBack}>
        {env.t('back')}
      </ActionButton>
    </>
  );
}

export function MailboxPanel({
  state,
  onState,
  onClose,
}: {
  state: CottageStateResponse;
  onState: (s: CottageStateResponse) => void;
  onClose: () => void;
}) {
  const env = useWorld();
  const [openId, setOpenId] = useState<string | null>(null);
  const current = state.messages.find((m) => m.messageId === openId) ?? null;

  async function open(message: MailboxMessageView) {
    const r = await worldApi.post<CottageStateResponse>('/mailbox/open', {
      messageId: message.messageId,
    });
    if (r.status === 'online') {
      onState(r.data);
      env.showRewards(r.data.rewards);
      await env.refreshJourney();
    } else env.notify(env.t('saving_retry'));
    setOpenId(message.messageId);
  }

  const unread = state.messages.filter((m) => m.readStatus === 'unread');
  const archived = state.messages.filter((m) => m.readStatus !== 'unread');
  const item = (m: MailboxMessageView) => (
    <li
      key={m.messageId}
      className={styles.card}
      data-testid={`mail-${m.messageId}`}
      data-status={m.readStatus}
    >
      <div className={styles.row}>
        <span className={styles.cardTitle}>
          {m.messageType} · {m.deliveredAt.slice(0, 10)}
        </span>
        <ActionButton quiet testId={`mail-open-${m.messageId}`} onClick={() => void open(m)}>
          {env.t('cottage_open')}
        </ActionButton>
      </div>
    </li>
  );
  return (
    <Panel
      title={env.t('cottage_mailbox')}
      onClose={onClose}
      testId="mailbox-panel"
      wide
      dir={current?.direction}
    >
      {current ? (
        <MessageDetail message={current} onOpened={onState} onBack={() => setOpenId(null)} />
      ) : state.messages.length === 0 ? (
        <TextBlock text={env.t('cottage_no_mail')} testId="mailbox-empty" />
      ) : (
        <>
          {unread.length > 0 && (
            <>
              <h3 className={styles.muted}>
                {env.t('cottage_unread')} ({unread.length})
              </h3>
              <ul className={styles.list}>{unread.map(item)}</ul>
            </>
          )}
          {archived.length > 0 && (
            <>
              <h3 className={styles.muted}>{env.t('cottage_archive')}</h3>
              <ul className={styles.list}>{archived.map(item)}</ul>
            </>
          )}
        </>
      )}
    </Panel>
  );
}

/** Live window: time of day and weather come from the server; its position follows the painted plane. */
function WindowIndicator({ state, label }: { state: CottageStateResponse | null; label: string }) {
  const position = useAnchorStyle('window-state', 90, 20);
  return (
    <span
      data-testid="window-state"
      data-time={state?.window.timeOfDay}
      data-weather={state?.window.weather}
      style={{
        position: 'absolute',
        ...position,
        transform: 'translate(-50%, -50%)',
        zIndex: 3,
        fontSize: '1.6rem',
      }}
      aria-label={label}
    >
      {state?.window.weather === 'rain' ? '🌧️' : state?.window.timeOfDay === 'night' ? '🌙' : '☀️'}
    </span>
  );
}

/** A configured decoration slot; any number of slots spreads along one shelf of the painted plane. */
function DecorHotspot({
  index,
  count,
  slotId,
  label,
  lit,
  onClick,
  ownedAssetId,
}: {
  index: number;
  count: number;
  slotId: string;
  label: string;
  lit: boolean;
  onClick: () => void;
  ownedAssetId?: string;
}) {
  const env = useWorld();
  const ownedRef = env.assetRef(ownedAssetId);
  const geometry = useStageGeometry();
  const [x, y] = decorAnchor(index, count, geometry?.mobile ?? false);
  if (ownedRef && geometry?.plane) {
    const plane = geometry.plane;
    return (
      <button
        type="button"
        className={styles.ownedDecor}
        style={{
          left: plane.left + (plane.width * x) / 100,
          top: plane.top + (plane.height * (y + (geometry.mobile ? 0 : 3))) / 100,
          width: (plane.width * (geometry.mobile ? 7 : 4.5)) / 100,
        }}
        data-testid={`decor-${slotId}`}
        data-lit="true"
        aria-label={label}
        title={label}
        onClick={onClick}
      >
        <img src={ownedRef} alt="" data-testid={`placed-decor-${slotId}`} />
      </button>
    );
  }
  // Short landscape crops leave no room for four captions between the shelf boards.
  // Keep each target on the hutch instead of clamping both rows onto the title clearance.
  if (geometry?.plane && !geometry.mobile && geometry.viewport.height < 500) {
    const perRow = Math.max(1, Math.ceil(count / 2));
    const shelfY = index < perRow ? 37 : 45;
    return (
      <div
        className={styles.compactDecor}
        style={{
          left: geometry.plane.left + (geometry.plane.width * x) / 100,
          top: geometry.plane.top + (geometry.plane.height * shelfY) / 100,
        }}
      >
        <Hotspot
          testId={`decor-${slotId}`}
          x={50}
          y={50}
          label={label}
          lit={lit}
          onClick={onClick}
        />
      </div>
    );
  }
  return (
    <CaptionedHotspot
      testId={`decor-${slotId}`}
      x={x}
      y={y}
      label={label}
      lit={lit}
      hideCaption={geometry?.mobile && count > 3}
      onClick={onClick}
    />
  );
}

/** Veoulla's Cottage interior (M11): living room + reading/memory corner. No bedroom. */
export function CottageView({ onLeave }: { onLeave: () => void }) {
  const env = useWorld();
  const { state, setState, reload, failed } = useCottageState();
  const [panel, setPanel] = useState<'mail' | 'countdown' | 'decor' | 'corner' | null>(null);
  const [decorSlot, setDecorSlot] = useState<string | null>(null);
  const [batches, setBatches] = useState<MailboxMessageView[][]>([]);
  // Walking in is only movement. The story's "arrive at the Cottage" step is confirmed by the player here.
  const arriving =
    env.journey.currentBeat?.requiredInteractionId === 'cottage_enter' &&
    env.journey.phase !== 'free';

  const arrivalGroup = env.journey.currentBeat?.dialogueGroupId ?? '';
  const arrivalText = arrivalGroup
    ? env.dialogue
        .filter((d) => d.groupId === arrivalGroup && d.locale === env.locale && d.text.trim())
        .map((d) => d.text)
        .join(' ') ||
      env.dialogue
        .filter((d) => d.groupId === arrivalGroup && d.locale === 'en' && d.text.trim())
        .map((d) => d.text)
        .join(' ')
    : '';

  async function confirmArrival() {
    const r = await worldApi.post<JourneyStateResponse>('/journey/ack', {
      interactionId: 'cottage_enter',
    });
    if (r.status === 'online') env.applyJourney(r.data);
    else env.notify(r.message);
  }

  useEffect(() => {
    let cancelled = false;
    void worldApi.postIdempotent<MailboxDeliveryResponse>('/cottage/enter').then((r) => {
      if (cancelled || r.status !== 'online') return;
      if (r.data.state?.decor) setState(r.data.state);
      setBatches(r.data.batches ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [setState]);

  async function place(slotId: string, cropId: string | null) {
    const r = await worldApi.post<CottageStateResponse>('/cottage/decor', { slotId, cropId });
    if (r.status === 'online') setState(r.data);
    setDecorSlot(null);
  }

  const slots = state?.decor.slots ?? [];
  return (
    <Stage
      theme="cottage"
      assetId="cottage_interior_scene"
      testId="cottage-interior"
      tone={state?.window.timeOfDay}
    >
      <PlaceTitle text={env.t('place_cottage')} />
      <Companion />
      <CompanionHint locationId="cottage" />
      <CaptionedHotspot
        testId="cottage-mailbox"
        x={14}
        y={62}
        label={env.t('cottage_mailbox')}
        badge={state?.unreadCount ? String(state.unreadCount) : undefined}
        onClick={() => {
          void reload();
          setPanel('mail');
        }}
      />
      {state?.countdown && (
        <MantelCountdown
          countdown={state.countdown}
          serverNow={state.serverNow}
          onOpen={() => setPanel('countdown')}
        />
      )}
      <CaptionedHotspot
        testId="cottage-countdown"
        x={50}
        y={26}
        label={env.t('cottage_countdown')}
        onClick={() => setPanel('countdown')}
      />
      <CaptionedHotspot
        testId="cottage-corner"
        x={22}
        y={34}
        label={env.t('cottage_reading_corner')}
        onClick={() => setPanel('corner')}
      />
      <CaptionedHotspot
        testId="cottage-var-place"
        x={34}
        y={82}
        label={env.t('cottage_var_place')}
        onClick={() => undefined}
      />
      <CaptionedHotspot
        testId="cottage-marcelino-place"
        x={66}
        y={82}
        label={
          state?.marcelino.visible
            ? env.t('cottage_marcelino_here')
            : env.t('cottage_marcelino_away')
        }
        onClick={() => undefined}
      />
      <WindowIndicator state={state} label={env.t('cottage_window')} />
      {state?.marcelino.visible && <MarcelinoSprite pose="idle" testId="marcelino-home-sprite" />}
      {slots.map((slotId, i) => (
        <DecorHotspot
          key={slotId}
          index={i}
          count={slots.length}
          slotId={slotId}
          label={
            state?.decor.placed[slotId]
              ? state.decor.owned.includes(state.decor.placed[slotId]!)
                ? env.t(ownedDecorationLabelKey(state.decor.placed[slotId]!))
                : env.t(`farm_crop_${state.decor.placed[slotId]}` as never)
              : `${env.t('cottage_decor')} ${i + 1}`
          }
          lit={Boolean(state?.decor.placed[slotId])}
          ownedAssetId={
            state?.decor.owned.includes(state.decor.placed[slotId] ?? '')
              ? state.decor.placed[slotId]
              : undefined
          }
          onClick={() => {
            // An overlay can grant permanent decor while this Cottage stays mounted.
            // Refresh ownership when opening the picker so the new gift is immediately placeable.
            void reload();
            setDecorSlot(slotId);
            setPanel('decor');
          }}
        />
      ))}
      <CaptionedHotspot
        testId="cottage-leave"
        x={50}
        y={92}
        slot="walk_back"
        label={env.t('leave')}
        onClick={onLeave}
      />

      {arriving &&
        (arrivalText ? (
          <Panel title={env.t('place_cottage')} onClose={() => undefined} testId="cottage-arrival">
            <TextBlock text={arrivalText} testId="cottage-arrival-text" />
            <ActionButton testId="cottage-arrival-continue" onClick={() => void confirmArrival()}>
              {env.t('continue')}
            </ActionButton>
          </Panel>
        ) : (
          // No approved arrival text exists: never an empty titled modal, just the deliberate Continue.
          <div className={styles.bareContinue} data-testid="cottage-arrival">
            <ActionButton testId="cottage-arrival-continue" onClick={() => void confirmArrival()}>
              {env.t('continue')}
            </ActionButton>
          </div>
        ))}
      {batches.length > 0 && panel === null && !arriving && (
        <Panel
          title={env.t('cottage_mailbox')}
          onClose={() => setBatches([])}
          testId="delivery-panel"
        >
          <TextBlock text={`${env.t('cottage_deliveries')}: ${batches.length}`} />
          <ActionButton
            testId="delivery-open-mailbox"
            onClick={() => {
              setBatches([]);
              setPanel('mail');
            }}
          >
            {env.t('cottage_open')}
          </ActionButton>
        </Panel>
      )}
      {(panel === 'mail' || panel === 'corner') && !state && (
        <Panel
          title={env.t(panel === 'mail' ? 'cottage_mailbox' : 'cottage_reading_corner')}
          onClose={() => setPanel(null)}
          testId="cottage-load-panel"
        >
          {failed ? (
            <div role="alert" data-testid="cottage-load-failed">
              <TextBlock text={env.t('load_failed')} />
              <ActionButton testId="cottage-retry" onClick={() => void reload()}>
                {env.t('try_again')}
              </ActionButton>
            </div>
          ) : (
            <TextBlock text={env.t('working')} />
          )}
        </Panel>
      )}
      {panel === 'mail' && state && (
        <MailboxPanel
          state={state}
          onState={setState}
          onClose={() => {
            setPanel(null);
            void reload();
          }}
        />
      )}
      {panel === 'countdown' && state && (
        <Panel
          title={env.t('cottage_countdown')}
          onClose={() => setPanel(null)}
          testId="countdown-panel"
        >
          {state?.countdown ? (
            <Countdown countdown={state.countdown} serverNow={state.serverNow} />
          ) : (
            <TextBlock text={env.t('not_available_yet')} />
          )}
        </Panel>
      )}
      {panel === 'corner' && (
        <Panel
          title={env.t('cottage_reading_corner')}
          onClose={() => setPanel(null)}
          testId="corner-panel"
        >
          {state?.countdown?.completed ? (
            <Countdown countdown={state.countdown} serverNow={state.serverNow} />
          ) : (
            // Loaded, but no memory has been unlocked yet: empty, not broken.
            <TextBlock text={env.t('not_available_yet')} testId="corner-empty" />
          )}
        </Panel>
      )}
      {panel === 'decor' && decorSlot && state && (
        <Panel
          title={env.t('cottage_decor')}
          onClose={() => {
            setPanel(null);
            setDecorSlot(null);
          }}
          testId="decor-panel"
        >
          {Object.entries(state.produce)
            .filter(([, qty]) => qty > 0)
            .map(([crop, qty]) => (
              <ActionButton
                key={crop}
                testId={`decor-place-${crop}`}
                onClick={() => void place(decorSlot, crop)}
              >
                {env.t('cottage_place')} {env.t(`farm_crop_${crop}` as never)} ({qty})
              </ActionButton>
            ))}
          {state.decor.owned
            .filter((id) => state.decor.placed[decorSlot] !== id)
            .map((id) => (
              <ActionButton
                key={id}
                testId={`decor-place-${id}`}
                onClick={() => void place(decorSlot, id)}
              >
                {env.t('cottage_place')} {env.t(ownedDecorationLabelKey(id))}
              </ActionButton>
            ))}
          {state.decor.placed[decorSlot] && (
            <ActionButton quiet testId="decor-clear" onClick={() => void place(decorSlot, null)}>
              {env.t('cottage_clear')}
            </ActionButton>
          )}
          {Object.values(state.produce).every((q) => q === 0) &&
            state.decor.owned.length === 0 &&
            !state.decor.placed[decorSlot] && <TextBlock text={env.t('not_available_yet')} />}
        </Panel>
      )}
    </Stage>
  );
}

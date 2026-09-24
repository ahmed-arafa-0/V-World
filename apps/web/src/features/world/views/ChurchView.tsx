import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  ChurchAnswerResponse,
  ChurchStateResponse,
  ChurchTextView,
} from '@veoullas-world/contracts';
import { SceneIcon } from '../../../components/SceneIcon';
import { useWorld } from '../WorldContext';
import { worldApi } from '../worldClient';
import { layoutCandleTray } from '../candleTray';
import {
  candleEffectSaved,
  readCandleOperation,
  rememberCandleOperation,
  type CandleOperation,
} from '../candleRecovery';
import {
  ActionButton,
  CaptionedHotspot,
  Panel,
  PlaceTitle,
  Stage,
  TextBlock,
  useStageGeometry,
} from '../ui';
import { paintedRect } from '../placeComposition';
import styles from '../world.module.css';

type Open = 'corner' | 'verse' | 'story' | 'gallery' | 'photo' | 'quiz' | 'silence' | null;

function ChurchText({ view }: { view: ChurchTextView }) {
  const env = useWorld();
  return (
    <>
      {view.title ? (
        <p className={styles.cardTitle} dir={view.direction}>
          {view.title}
        </p>
      ) : null}
      {view.imageRefs.map((src) => (
        <img key={src} src={src} alt="" style={{ maxWidth: '100%', borderRadius: 10 }} />
      ))}
      <TextBlock text={view.text} dir={view.direction} testId="church-text" />
      <p className={styles.muted} dir={view.direction}>
        {env.t('church_reference')}: {view.reference}
      </p>
    </>
  );
}

/**
 * The candle tray itself. Deliberately a separate component nested INSIDE `<Stage>` (not rendered by the
 * same component that creates the Stage): `usePlaneRect` reads the plane geometry `Stage` provides to its
 * own React children, so the reader must actually be one of those children, not the Stage's creator —
 * otherwise the box never resolves, however long the art has been loaded (`useContext` only ever sees a
 * provider that is genuinely above it in the tree). Present candles are placed on the sand tray with a
 * simple perspective (a smaller, higher back row and a larger, lower front row) and grounded contact
 * shadows; each shows exactly the saved state. Until the close-up painting is registered, a graceful
 * flex-row fallback shows instead (no crash).
 */
function CandleTray({
  slots,
  lit,
  preserved,
  selected,
  disabled,
  onToggle,
}: {
  slots: string[];
  lit: string[];
  preserved: string[];
  selected: string | null;
  disabled: boolean;
  onToggle: (id: string) => void;
}) {
  const env = useWorld();
  const geometry = useStageGeometry();
  const entry = geometry?.composition?.boxes?.candles;
  const box =
    geometry?.plane && entry
      ? paintedRect(geometry.plane, entry[geometry.mobile ? 'mobile' : 'desktop'])
      : undefined;
  const litArt = env.assetRef('candle_lit');
  const unlitArt = env.assetRef('candle_unlit');

  const boxWidth = (box?.width as number | undefined) ?? 0;
  const boxHeight = (box?.height as number | undefined) ?? 0;
  const trayLayout = useMemo(
    () => (box ? layoutCandleTray(slots.length, { width: boxWidth, height: boxHeight }) : []),
    [box, slots.length, boxWidth, boxHeight],
  );
  // A nominal candle height at full (front-row) scale, clamped so it stays legible without ever
  // dwarfing the scene; the natural sprite is tall and thin (~1:6.9), so its width follows from this.
  const nominalHeight = Math.max(70, Math.min(boxWidth * 0.28 || 140, 230));

  return (
    <div
      className={box ? styles.candleTray : styles.candleTrayFallback}
      style={
        box ? { left: box.left, top: box.top, width: box.width, height: box.height } : undefined
      }
      data-testid="candle-tray"
    >
      {slots.map((id, i) => {
        const placement = box ? trayLayout[i] : undefined;
        if (box && !placement) return null;
        const isLit = lit.includes(id);
        const isSelected = selected === id;
        const label = isLit ? env.t('church_extinguish_candle') : env.t('church_light_candle');
        const height = placement ? nominalHeight * placement.scale : 140;
        const width = height * (93 / 640);
        return (
          <div
            key={id}
            className={placement ? styles.candlePlaced : styles.candlePlacedFallback}
            style={placement ? { left: placement.left, top: placement.top } : undefined}
            data-selected={isSelected ? 'true' : undefined}
            data-testid={`candle-group-${id}`}
          >
            {placement && (
              <span
                className={styles.candleShadow}
                aria-hidden="true"
                style={{ width: width * 2.1, height: width * 2.1 * 0.34 }}
              />
            )}
            <button
              type="button"
              className={styles.candleSlot}
              style={{ height }}
              aria-label={label}
              title={label}
              aria-pressed={isLit}
              data-testid={`candle-${id}`}
              data-lit={isLit ? 'true' : undefined}
              data-preserved={preserved.includes(id) ? 'true' : undefined}
              disabled={disabled}
              onClick={() => onToggle(id)}
            >
              {litArt && unlitArt ? (
                <img src={isLit ? litArt : unlitArt} alt="" />
              ) : (
                <span
                  className={styles.candleStandIn}
                  data-flame={isLit ? 'on' : 'off'}
                  aria-hidden="true"
                />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The focused candle corner: a close-up with its own Back control (which also suits phones). Selecting a
 * candle (a numbered chip in the control bar below the tray, never overlapping a candle's own tap
 * target) and "Remove selected candle" are a deliberately separate action from the ordinary
 * light/extinguish tap, so neither can accidentally remove a candle; the selected candle also glows in
 * the tray itself, so the selection is visible in both places. No cat here.
 */
function CandleCorner({
  slots,
  lit,
  preserved,
  capacity,
  disabled,
  onToggle,
  onAdd,
  onRemove,
  onBack,
  feedback,
}: {
  slots: string[];
  lit: string[];
  preserved: string[];
  capacity: number;
  disabled: boolean;
  onToggle: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onBack: () => void;
  feedback?: ReactNode;
}) {
  const env = useWorld();
  const [selected, setSelected] = useState<string | null>(null);
  const full = slots.length >= capacity;

  useEffect(() => {
    if (selected && !slots.includes(selected)) setSelected(null);
  }, [selected, slots]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <Stage theme="church" assetId="church_candle_corner_scene" testId="church-candle-corner">
      <PlaceTitle text={env.t('church_candle_corner')} />
      {feedback}
      <CandleTray
        slots={slots}
        lit={lit}
        preserved={preserved}
        selected={selected}
        disabled={disabled}
        onToggle={onToggle}
      />
      <div className={styles.candleControls} data-testid="candle-controls">
        <button
          type="button"
          className={styles.candleActionBtn}
          aria-label={env.t('church_add_candle')}
          title={env.t('church_add_candle')}
          data-testid="candle-add"
          disabled={disabled || full}
          onClick={onAdd}
        >
          <SceneIcon slot="add" icons={env.icons} className={styles.candleActionIcon} />
        </button>
        {slots.length > 0 && (
          <div
            className={styles.candleChips}
            role="group"
            aria-label={env.t('church_select_candle')}
            data-testid="candle-chips"
          >
            {slots.map((id, i) => {
              const isSelected = selected === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={styles.candleChip}
                  aria-pressed={isSelected}
                  aria-label={`${env.t('church_select_candle')} ${i + 1}${isSelected ? ` — ${env.t('church_candle_selected')}` : ''}`}
                  data-testid={`candle-select-${id}`}
                  data-lit={lit.includes(id) ? 'true' : undefined}
                  disabled={disabled}
                  onClick={() => setSelected((s) => (s === id ? null : id))}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        )}
        <button
          type="button"
          className={styles.candleActionBtn}
          aria-label={env.t('church_remove_candle')}
          title={env.t('church_remove_candle')}
          data-testid="candle-remove"
          disabled={disabled || !selected}
          onClick={() => {
            if (selected) onRemove(selected);
          }}
        >
          <SceneIcon slot="remove" icons={env.icons} className={styles.candleActionIcon} />
        </button>
      </div>
      <CaptionedHotspot
        testId="church-candle-back"
        x={50}
        y={90}
        slot="walk_back"
        label={env.t('back')}
        onClick={onBack}
      />
    </Stage>
  );
}

/** The Church interior (M08): silent by design — the Walkman is held completely still while inside. */
export function ChurchView({ onLeave }: { onLeave: () => void }) {
  const env = useWorld();
  const [state, setState] = useState<ChurchStateResponse | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const [acting, setActing] = useState(false);
  const [pending, setPending] = useState<CandleOperation | null>(() =>
    readCandleOperation(env.userId),
  );
  const [candleFeedback, setCandleFeedback] = useState<
    'candle_unknown' | 'candle_saved_followup' | 'candle_not_saved' | 'candle_refresh_failed' | null
  >(() => (readCandleOperation(env.userId) ? 'candle_unknown' : null));
  const { walkman, locale } = env;

  useEffect(() => {
    walkman.silence(true);
    return () => walkman.silence(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    const result = await worldApi.postIdempotent<ChurchStateResponse>('/church/enter', {}, locale);
    if (result.status === 'online') {
      setState(result.data);
      setFailed(false);
    } else setFailed(true);
  }, [locale]);
  useEffect(() => {
    void load();
  }, [load]);

  async function apply<T extends ChurchStateResponse>(next: T) {
    setState(next);
    env.showRewards(next.rewards);
    if (next.rewards?.length) await env.refreshJourney();
  }

  function retain(operation: CandleOperation | null) {
    setPending(operation);
    rememberCandleOperation(env.userId, operation);
  }

  async function reconcile(operation: CandleOperation): Promise<boolean> {
    setCandleFeedback('candle_unknown');
    const result = await worldApi.getOnce<ChurchStateResponse>('/church?fresh=1', locale);
    if (result.status !== 'online') {
      setCandleFeedback('candle_unknown');
      return false;
    }
    setState(result.data);
    setCandleFeedback(
      candleEffectSaved(operation, result.data) ? 'candle_saved_followup' : 'candle_not_saved',
    );
    return true;
  }

  async function retryCandleRefresh() {
    if (busy.current) return;
    busy.current = true;
    setActing(true);
    try {
      if (candleFeedback === 'candle_not_saved' || (await env.refreshJourney()))
        setCandleFeedback(null);
    } catch {
      setCandleFeedback('candle_refresh_failed');
    } finally {
      busy.current = false;
      setActing(false);
    }
  }

  async function saveCandle(operation: CandleOperation, retry = false) {
    if (busy.current) return;
    busy.current = true;
    setActing(true);
    retain(operation); // Preserve the exact requested effect and Add receipt across reloads.
    try {
      if (retry && !(await reconcile(operation))) return;
      const result = await worldApi.postHandled<ChurchStateResponse>(
        operation.path,
        operation.body,
        locale,
      );
      if (result.status === 'online') {
        setState(result.data);
        env.showRewards(result.data.rewards);
        retain(null);
        setCandleFeedback(null);
        // A failed HUD/journey read does not invalidate the confirmed candle response.
        void env
          .refreshJourney()
          .then((next) => {
            if (!next) setCandleFeedback('candle_refresh_failed');
          })
          .catch(() => setCandleFeedback('candle_refresh_failed'));
      } else if (result.unconfirmed || result.retryable) {
        await reconcile(operation);
      } else {
        retain(null);
        setCandleFeedback('candle_not_saved');
        env.notify(result.message);
      }
    } catch {
      setCandleFeedback('candle_unknown');
    } finally {
      busy.current = false;
      setActing(false);
    }
  }

  /** Unlit → light; lit → put out (an occasion candle stays lit). One request at a time, so taps cannot pile up. */
  async function toggleCandle(candleId: string) {
    if (busy.current || pending || !state) return;
    const isLit = state.candles.lit.includes(candleId);
    if (isLit && state.candles.preserved.includes(candleId))
      return env.notify(env.t('church_candle_stays_lit'));
    await saveCandle({
      path: isLit ? '/church/candle/extinguish' : '/church/candle',
      body: { candleId },
    });
  }

  /** Adds one new, always-unlit candle to a free tray position. A client id makes a retried tap safe. */
  async function addCandle() {
    if (busy.current || pending || !state) return;
    if (state.candles.slots.length >= state.candles.capacity) {
      return env.notify(env.t('church_tray_full'));
    }
    const clientRequestId = crypto.randomUUID();
    await saveCandle({ path: '/church/candle/add', body: { clientRequestId } });
  }

  /** Removes the selected candle from the tray. Reward/occasion history is never touched server-side. */
  async function removeCandle(candleId: string) {
    if (busy.current || pending || !state) return;
    await saveCandle({ path: '/church/candle/remove', body: { candleId } });
  }

  if (failed)
    return (
      <Stage theme="church" testId="church-interior">
        <PlaceTitle text={env.t('place_church')} />
        <TextBlock text={env.t('saving_retry')} />
        <ActionButton onClick={() => void load()}>{env.t('try_again')}</ActionButton>
      </Stage>
    );

  const candles = state?.candles.slots ?? [];
  if (open === 'corner') {
    return (
      <CandleCorner
        slots={candles}
        lit={state?.candles.lit ?? []}
        preserved={state?.candles.preserved ?? []}
        capacity={state?.candles.capacity ?? candles.length}
        disabled={!state || acting || Boolean(pending)}
        feedback={
          candleFeedback ? (
            <div className={styles.candleFeedback} role="status" data-testid="candle-feedback">
              <p>{env.t(candleFeedback)}</p>
              <button
                type="button"
                disabled={acting}
                data-testid="candle-retry"
                onClick={() => {
                  if (pending) void saveCandle(pending, true);
                  else void retryCandleRefresh();
                }}
              >
                {env.t(acting ? 'working' : 'try_again')}
              </button>
            </div>
          ) : null
        }
        onToggle={(id) => void toggleCandle(id)}
        onAdd={() => void addCandle()}
        onRemove={(id) => void removeCandle(id)}
        onBack={() => setOpen(null)}
      />
    );
  }
  return (
    <Stage theme="church" assetId="church_interior_scene" testId="church-interior">
      <PlaceTitle text={env.t('place_church')} />
      <CaptionedHotspot
        testId="church-candle-corner"
        x={8}
        y={60}
        label={env.t('church_candle_corner')}
        lit={(state?.candles.lit.length ?? 0) > 0}
        onClick={() => setOpen('corner')}
      />
      <CaptionedHotspot
        testId="church-verse"
        x={50}
        y={36}
        label={env.t('church_verse')}
        onClick={() => setOpen('verse')}
      />
      <CaptionedHotspot
        testId="church-story"
        x={66}
        y={52}
        label={env.t('church_story')}
        onClick={() => setOpen('story')}
      />
      <CaptionedHotspot
        testId="church-photo"
        x={84}
        y={38}
        label={env.t('church_photo')}
        onClick={() => setOpen('photo')}
      />
      <CaptionedHotspot
        testId="church-quiz"
        x={72}
        y={78}
        label={env.t('church_quiz')}
        onClick={() => setOpen('quiz')}
      />
      <CaptionedHotspot
        testId="church-silence"
        x={50}
        y={62}
        label={env.t('church_sit')}
        onClick={() => setOpen('silence')}
      />
      <CaptionedHotspot
        testId="church-leave"
        x={50}
        y={90}
        slot="walk_back"
        label={env.t('leave')}
        onClick={onLeave}
      />

      {open === 'verse' && (
        <Panel
          title={env.t('church_verse')}
          onClose={() => setOpen(null)}
          testId="church-verse-panel"
          dir={state?.verse?.direction}
        >
          {state?.verse ? (
            <ChurchText view={state.verse} />
          ) : (
            <TextBlock text={env.t('church_none_today')} />
          )}
        </Panel>
      )}
      {open === 'story' && (
        <Panel
          title={env.t('church_story')}
          onClose={() => setOpen(null)}
          testId="church-story-panel"
          dir={state?.story?.direction}
        >
          {state?.story ? (
            <>
              <ChurchText view={state.story} />
              <ActionButton
                testId="church-open-story"
                onClick={async () => {
                  const r = await worldApi.post<ChurchStateResponse>(
                    '/church/story/open',
                    { contentId: state.story!.contentId },
                    locale,
                  );
                  if (r.status === 'online') setState(r.data);
                }}
              >
                {env.t('church_open_story')}
              </ActionButton>
            </>
          ) : (
            <TextBlock text={env.t('church_none_today')} />
          )}
          <ActionButton quiet testId="church-open-gallery" onClick={() => setOpen('gallery')}>
            {env.t('church_gallery')}
          </ActionButton>
        </Panel>
      )}
      {open === 'gallery' && (
        <Panel
          title={env.t('church_gallery')}
          onClose={() => setOpen(null)}
          testId="church-gallery-panel"
          wide
        >
          {state?.gallery.length ? (
            <ul className={styles.list}>
              {state.gallery.map((story) => (
                <li key={story.contentId} className={styles.card} data-testid="church-gallery-item">
                  <ChurchText view={story} />
                </li>
              ))}
            </ul>
          ) : (
            <TextBlock text={env.t('not_available_yet')} />
          )}
        </Panel>
      )}
      {open === 'photo' && (
        <Panel
          title={env.t('church_photo')}
          onClose={() => setOpen(null)}
          testId="church-photo-panel"
          dir={state?.photo?.direction}
        >
          {state?.photo ? (
            <ChurchText view={state.photo} />
          ) : (
            <TextBlock text={env.t('content_pending')} />
          )}
        </Panel>
      )}
      {open === 'quiz' && state && (
        <QuizPanel
          state={state}
          onClose={() => setOpen(null)}
          onState={(next) => void apply(next)}
        />
      )}
      {open === 'silence' && (
        <Panel
          title={env.t('church_sit')}
          onClose={() => setOpen(null)}
          testId="church-silence-panel"
        >
          <TextBlock text={env.t('church_sit')} />
        </Panel>
      )}
    </Stage>
  );
}

function QuizPanel({
  state,
  onClose,
  onState,
}: {
  state: ChurchStateResponse;
  onClose: () => void;
  onState: (next: ChurchStateResponse) => void;
}) {
  const env = useWorld();
  const [feedback, setFeedback] = useState<ChurchAnswerResponse | null>(null);
  const question = state.quiz.questions.find((q) => !q.answered) ?? null;
  const optionLabel = (id: string, text: string) =>
    id === 'true' ? env.t('church_true') : id === 'false' ? env.t('church_false') : text;

  async function answer(id: string) {
    if (!question) return;
    const result = await worldApi.post<ChurchAnswerResponse>(
      '/church/quiz/answer',
      { questionId: question.questionId, answer: id },
      env.locale,
    );
    if (result.status !== 'online') return env.notify(env.t('saving_retry'));
    setFeedback(result.data);
    onState(result.data.state);
  }

  return (
    <Panel
      title={env.t('church_quiz')}
      onClose={onClose}
      testId="church-quiz-panel"
      dir={question?.direction}
    >
      {state.quiz.questions.length === 0 ? (
        <TextBlock text={env.t('church_none_today')} />
      ) : state.quiz.completed && !question ? (
        <>
          <TextBlock
            text={state.quiz.perfect ? env.t('church_quiz_perfect') : env.t('church_quiz_done')}
            testId="quiz-done"
          />
        </>
      ) : question ? (
        <>
          <TextBlock text={question.question} dir={question.direction} testId="quiz-question" />
          <div className={styles.optionGrid}>
            {question.options.map((option) => (
              <ActionButton
                key={option.id}
                quiet
                testId={`quiz-option-${option.id}`}
                onClick={() => void answer(option.id)}
              >
                {optionLabel(option.id, option.text)}
              </ActionButton>
            ))}
          </div>
        </>
      ) : null}
      {feedback && (
        <div className={styles.card} data-testid="quiz-feedback">
          <p className={styles.cardTitle}>
            {feedback.correct ? env.t('church_answer_correct') : env.t('church_answer_wrong')}
          </p>
          {feedback.explanation ? <TextBlock text={feedback.explanation} /> : null}
          {feedback.reference ? (
            <p className={styles.muted}>
              {env.t('church_reference')}: {feedback.reference}
            </p>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

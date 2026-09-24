import { useCallback, useEffect, useState } from 'react';
import type { FarmPlotView, FarmStateResponse } from '@veoullas-world/contracts';
import { useWorld } from '../WorldContext';
import { worldApi } from '../worldClient';
import {
  ActionButton,
  CaptionedHotspot,
  Companion,
  CompanionHint,
  MarcelinoSprite,
  Panel,
  PlaceTitle,
  Stage,
  TextBlock,
  useStageGeometry,
} from '../ui';
import { FARM_BEDS } from '../placeComposition';
import styles from '../world.module.css';

/**
 * Growth-state art is looked up by a small explicit convention: the asset id `crop_<cropId>_<state>` for the four
 * plant states the server reports (planted, growing, ready, wilted). `empty` shows no plant. The Sheet has no
 * per-state column, so this rule is the whole mapping; a missing asset falls back to the emoji stand-in.
 */
export const cropStageAssetId = (cropId: string, state: string) => `crop_${cropId}_${state}`;

const CROP_GLYPH: Record<string, string> = { sunflower: '🌻', mango: '🥭', blueberry: '🫐' };

/** Seed/produce icon from the Sheet's icon registry (`seed_<crop>_icon`, `crop_<crop>_icon`), emoji until registered. */
function CropIcon({ kind, cropId }: { kind: 'seed' | 'crop'; cropId: string }) {
  const env = useWorld();
  const ref = env.icons.find((i) => i.iconId === `${kind}_${cropId}_icon`)?.mediaRef;
  return ref ? (
    <img
      src={ref}
      alt=""
      width={22}
      height={22}
      style={{ verticalAlign: 'middle' }}
      data-testid={`${kind}-icon-${cropId}`}
    />
  ) : (
    <span aria-hidden="true">{CROP_GLYPH[cropId] ?? cropId}</span>
  );
}

/** One bed of the painted farm: an invisible tap target on the soil, with the crop sprite standing on its ground point. */
function PaintedBed({
  index,
  plot,
  label,
  stateText,
  selected,
  onOpen,
}: {
  index: number;
  plot: FarmPlotView;
  label: string;
  stateText: string;
  selected: boolean;
  onOpen: () => void;
}) {
  const env = useWorld();
  const geometry = useStageGeometry();
  const bed = FARM_BEDS[geometry?.mobile ? 'mobile' : 'desktop'][index];
  if (!geometry?.plane || !bed) return null;
  const { plane, viewport } = geometry;
  const width = (plane.width * bed[2]) / 100;
  const cx = Math.min(Math.max(plane.left + (plane.width * bed[0]) / 100, 30), viewport.width - 30);
  const ground = plane.top + (plane.height * bed[1]) / 100;
  const art =
    plot.cropId && plot.state !== 'empty'
      ? env.assetRef(cropStageAssetId(plot.cropId, plot.state))
      : null;
  const hit = Math.max(48, width);
  // The footprint is as tall as the gap to the nearest bed in the same column allows (down to 28px on tiny
  // screens, where far beds are closer than a fingertip); the plant itself always stays tappable.
  const beds = FARM_BEDS[geometry.mobile ? 'mobile' : 'desktop'];
  const gap = beds.reduce((min, other, j) => {
    if (j === index || (Math.abs(other[0] - bed[0]) * plane.width) / 100 > hit) return min;
    return Math.min(min, (Math.abs(other[1] - bed[1]) * plane.height) / 100);
  }, 48);
  const footH = Math.max(28, Math.min(width * 0.4, 60, gap - 2));
  return (
    <button
      type="button"
      className={styles.bed}
      style={{ left: cx, top: ground, width: hit, height: footH }}
      data-state={plot.state}
      data-testid={`plot-${plot.plotId}`}
      data-bed-index={index}
      data-selected={selected ? 'true' : undefined}
      aria-label={label}
      onClick={onOpen}
    >
      {art ? (
        <img
          className={styles.bedSprite}
          style={{ width, height: width * 1.3 }}
          src={art}
          alt=""
          data-testid={`plot-sprite-${plot.plotId}`}
          data-stage={plot.state}
        />
      ) : plot.cropId && plot.state !== 'empty' ? (
        <span aria-hidden="true" style={{ fontSize: '1.5rem' }}>
          {CROP_GLYPH[plot.cropId] ?? '🌱'}
        </span>
      ) : null}
      {plot.state === 'empty' && (
        <span
          className={styles.bedPlus}
          aria-hidden="true"
          data-testid={`plot-plus-${plot.plotId}`}
        >
          +
        </span>
      )}
      <span className={styles.bedTag}>
        {plot.cropId && plot.state !== 'empty' ? (
          <span className={styles.bedChip} data-testid={`plot-chip-${plot.plotId}`}>
            <CropIcon kind="crop" cropId={plot.cropId} /> {stateText}
            <span className={styles.meter}>
              <span style={{ width: `${plot.progressPercent}%` }} />
            </span>
          </span>
        ) : null}
      </span>
    </button>
  );
}

/** Sunberry Fields (M12): real-time crops, real-rain watering, separate seed/produce inventories. */
export function FarmView({ onLeave, onBack }: { onLeave: () => void; onBack: () => void }) {
  return (
    <Stage theme="farm" assetId="farm_exterior_scene" testId="farm-exterior">
      <FarmScene onLeave={onLeave} onBack={onBack} />
    </Stage>
  );
}

function FarmScene({ onLeave, onBack }: { onLeave: () => void; onBack: () => void }) {
  const env = useWorld();
  const geometry = useStageGeometry();
  const [state, setState] = useState<FarmStateResponse | null>(null);
  const [plot, setPlot] = useState<FarmPlotView | null>(null);
  const [failed, setFailed] = useState(false);

  const apply = useCallback(
    async (next: FarmStateResponse) => {
      setState(next);
      env.showRewards(next.rewards);
      if (next.rewards?.length) await env.refreshJourney();
      if (next.rainWatered?.length) env.notify(env.t('farm_rain_watered'));
    },
    [env],
  );

  useEffect(() => {
    let cancelled = false;
    void worldApi.postIdempotent<FarmStateResponse>('/farm/enter').then((r) => {
      if (cancelled) return;
      if (r.status === 'online') void apply(r.data);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(path: string, body: Record<string, unknown>) {
    const r = await worldApi.post<FarmStateResponse>(path, body);
    if (r.status === 'online') await apply(r.data);
    else env.notify(r.message);
    setPlot(null);
  }

  const cropName = (id: string | null) => (id ? env.t(`farm_crop_${id}` as never) : '');
  const stateLabel = (p: FarmPlotView) =>
    p.state === 'empty' ? env.t('farm_empty') : env.t(`farm_${p.state}` as never);
  const fresh = plot ? (state?.plots.find((p) => p.plotId === plot.plotId) ?? plot) : null;

  return (
    <>
      <PlaceTitle text={env.t('place_farm')} />
      <Companion />
      <CompanionHint locationId="farm" />
      {state?.weather === 'raining' && (
        <p className={styles.toast} data-testid="farm-rain" style={{ top: 'auto', bottom: 70 }}>
          {env.t('farm_rain')}
        </p>
      )}
      {state?.plots.slice(0, FARM_BEDS.desktop.length).map((p, i) => (
        <PaintedBed
          key={p.plotId}
          index={i}
          plot={p}
          label={`${env.t('farm_plot')} ${p.plotId.replace('plot_', '')} — ${cropName(p.cropId)} ${stateLabel(p)}`.replace(
            '  ',
            ' ',
          )}
          stateText={stateLabel(p)}
          selected={plot?.plotId === p.plotId}
          onOpen={() => setPlot(p)}
        />
      ))}
      <div className={styles.plots} data-testid="farm-plots" data-painted={!!geometry?.plane}>
        {state?.plots.map((p, i) =>
          geometry?.plane && i < FARM_BEDS.desktop.length ? null : (
            <button
              key={p.plotId}
              type="button"
              className={styles.plot}
              data-state={p.state}
              data-testid={`plot-${p.plotId}`}
              onClick={() => setPlot(p)}
            >
              <span style={{ fontSize: '1.5rem' }}>
                {p.cropId ? (CROP_GLYPH[p.cropId] ?? '🌱') : '·'}
              </span>
              <span>{stateLabel(p)}</span>
              {p.cropId && (
                <span className={styles.meter}>
                  <span style={{ width: `${p.progressPercent}%` }} />
                </span>
              )}
            </button>
          ),
        )}
      </div>
      <CaptionedHotspot
        testId="farm-barn"
        x={84}
        y={30}
        label={state?.barn.unlocked ? env.t('place_farm') : env.t('farm_barn')}
        disabled={!state?.barn.unlocked}
        onClick={() => undefined}
      />
      {state?.marcelinoHere && <MarcelinoSprite pose="idle" testId="farm-marcelino" />}
      <CaptionedHotspot
        testId="farm-back"
        x={8}
        y={90}
        slot="walk_back"
        label={env.t('back')}
        onClick={onBack}
      />
      <CaptionedHotspot
        testId="farm-forward"
        x={92}
        y={90}
        slot="walk_forward"
        label={env.t('walk_on')}
        onClick={onLeave}
      />
      {failed && <TextBlock text={env.t('saving_retry')} />}

      {fresh && state && (
        <Panel
          title={`${env.t('farm_plot')} ${fresh.plotId.replace('plot_', '')}`}
          onClose={() => setPlot(null)}
          testId="plot-panel"
        >
          <p className={styles.textBlock} data-testid="plot-status">
            {fresh.cropId ? (
              <>
                <CropIcon kind="crop" cropId={fresh.cropId} />{' '}
                <strong>{cropName(fresh.cropId)}</strong> ·{' '}
              </>
            ) : null}
            {stateLabel(fresh)}
          </p>
          {fresh.cropId && fresh.state !== 'empty' && (
            <span className={styles.meter} style={{ width: '100%' }} aria-hidden="true">
              <span style={{ width: `${fresh.progressPercent}%` }} />
            </span>
          )}
          {fresh.state === 'empty' && (
            <p className={styles.muted} data-testid="plot-empty-hint">
              {env.t('farm_plant_here')}
            </p>
          )}
          {fresh.state === 'empty' &&
            state.crops.map((crop) => (
              <ActionButton
                key={crop.cropId}
                testId={`plant-${crop.cropId}`}
                disabled={crop.seeds < 1}
                onClick={() =>
                  void act('/farm/plant', { plotId: fresh.plotId, cropId: crop.cropId })
                }
              >
                {env.t('farm_plant')} {cropName(crop.cropId)} ({env.t('farm_seeds')}: {crop.seeds})
              </ActionButton>
            ))}
          {fresh.needsWater && (
            <ActionButton
              testId="water-plot"
              onClick={() => void act('/farm/water', { plotId: fresh.plotId })}
            >
              {env.t('farm_water')}
            </ActionButton>
          )}
          {fresh.state === 'ready' && (
            <ActionButton
              testId="harvest-plot"
              onClick={() => void act('/farm/harvest', { plotId: fresh.plotId })}
            >
              {env.t('farm_harvest')}
            </ActionButton>
          )}
          <p className={styles.muted} data-testid="farm-inventory">
            {env.t('farm_seeds')}:{' '}
            {state.crops.map((c) => (
              <span key={c.cropId} style={{ marginInlineEnd: 8 }}>
                <CropIcon kind="seed" cropId={c.cropId} /> {c.seeds}
              </span>
            ))}{' '}
            — {env.t('farm_produce')}:{' '}
            {state.crops.map((c) => (
              <span key={c.cropId} style={{ marginInlineEnd: 8 }}>
                <CropIcon kind="crop" cropId={c.cropId} /> {c.produce}
              </span>
            ))}
          </p>
        </Panel>
      )}
    </>
  );
}

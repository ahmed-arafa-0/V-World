import type {
  FarmCropView,
  FarmPlotState,
  FarmPlotView,
  FarmStateResponse,
  WorldAchievementView,
  WorldRewardView,
} from '@veoullas-world/contracts';
import { AppError } from '../errors/app-error.js';
import { usable, readAppConfig, getDayClock, type WorldCtx } from './common.js';
import { assertLocationAccess, syncJourney } from './journey.js';
import { marcelinoPresence } from './marcelino.js';
import { jsonNumber, unlockAchievement } from './rewards.js';
import { mutateWorldDoc, readWorldDoc, type FarmDoc } from './state.js';
import { readWeather } from './weather.js';

const HOUR_MS = 3_600_000;
const DEFAULT_PLOTS = 6;

export interface CropRow {
  cropId: string;
  displayNameTextId: string;
  growHours: number;
  wateringIntervalHours: number;
  wiltAfterHours: number;
  rainWaters: boolean;
  harvestYield: number;
  rarity: string;
  seedIconId: string;
  cropIconId: string;
}

interface PlotRow {
  cropId: string;
  plantedAt: number | null;
  lastWateredAt: number | null;
  readyAt: number | null;
}

async function loadCrops(ctx: WorldCtx): Promise<CropRow[]> {
  const table = await ctx.gateway.readTab('28_FARM_CROPS');
  return table.rows
    .filter((r) => r.values.enabled === true)
    .map((r) => ({
      cropId: r.primaryKeyValue ?? '',
      displayNameTextId: r.raw.display_name_text_id ?? '',
      growHours: Number(r.raw.grow_hours) || 24,
      wateringIntervalHours: Number(r.raw.watering_interval_hours) || 24,
      wiltAfterHours: Number(r.raw.wilt_after_hours) || 48,
      rainWaters: r.values.rain_waters === true,
      harvestYield: Number(r.raw.harvest_yield) || 1,
      rarity: r.raw.rarity ?? '',
      seedIconId: r.raw.seed_icon_id ?? '',
      cropIconId: r.raw.crop_icon_id ?? '',
    }));
}

function plotKey(userId: string, plotId: string): string {
  return `${userId}|${plotId}`;
}

const ms = (iso: string | undefined): number | null => {
  if (!iso || !usable(iso)) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/**
 * Pure plot state from timestamps and Sheet crop rules — computed on every
 * read from the authoritative clock, so growth survives devices and closed
 * tabs. A plot that misses watering wilts (stops progressing) but is never
 * killed: watering it later recovers it and pushes the harvest back by the
 * time it stood wilted.
 */
export function evaluatePlot(
  plot: PlotRow | null,
  crop: CropRow | undefined,
  nowMs: number,
): Omit<FarmPlotView, 'plotId'> {
  if (!plot || !crop || plot.plantedAt === null || plot.readyAt === null) {
    return {
      cropId: null,
      state: 'empty',
      plantedAt: '',
      nextWaterDueAt: '',
      readyAt: '',
      wiltedAt: '',
      progressPercent: 0,
      needsWater: false,
    };
  }
  const lastWatered = plot.lastWateredAt ?? plot.plantedAt;
  const wiltTime = lastWatered + crop.wiltAfterHours * HOUR_MS;
  const dueTime = lastWatered + crop.wateringIntervalHours * HOUR_MS;
  const growMs = crop.growHours * HOUR_MS;
  let state: FarmPlotState;
  if (plot.readyAt <= Math.min(nowMs, wiltTime)) state = 'ready';
  else if (nowMs >= wiltTime) state = 'wilted';
  else state = nowMs >= dueTime || plot.lastWateredAt === null ? 'planted' : 'growing';
  const frozenAt = state === 'wilted' ? wiltTime : nowMs;
  const progress = Math.max(0, Math.min(1, 1 - (plot.readyAt - frozenAt) / growMs));
  return {
    cropId: plot.cropId,
    state,
    plantedAt: new Date(plot.plantedAt).toISOString(),
    nextWaterDueAt: state === 'ready' ? '' : new Date(dueTime).toISOString(),
    readyAt: new Date(plot.readyAt).toISOString(),
    wiltedAt: state === 'wilted' ? new Date(wiltTime).toISOString() : '',
    progressPercent: state === 'ready' ? 100 : Math.floor(progress * 100),
    needsWater: state === 'wilted' || state === 'planted',
  };
}

/** The patch that waters `plot` at instant `at` (recovering a wilted one). */
function wateredPatch(plot: PlotRow, crop: CropRow, at: number): Record<string, string> {
  const lastWatered = plot.lastWateredAt ?? plot.plantedAt ?? at;
  const wiltTime = lastWatered + crop.wiltAfterHours * HOUR_MS;
  const readyAt = (plot.readyAt ?? at) + (at > wiltTime ? at - wiltTime : 0);
  return {
    last_watered_at: new Date(at).toISOString(),
    next_water_due_at: new Date(at + crop.wateringIntervalHours * HOUR_MS).toISOString(),
    ready_at: new Date(readyAt).toISOString(),
    wilted_at: '',
    state: 'growing',
    updated_at: new Date(at).toISOString(),
  };
}

function toPlotRow(raw: Record<string, string> | undefined): PlotRow | null {
  if (!raw || !usable(raw.crop_id) || !usable(raw.planted_at)) return null;
  return {
    cropId: raw.crop_id!,
    plantedAt: ms(raw.planted_at),
    lastWateredAt: ms(raw.last_watered_at),
    readyAt: ms(raw.ready_at),
  };
}

async function plotCount(ctx: WorldCtx): Promise<number> {
  const config = await readAppConfig(ctx.gateway);
  return Math.max(1, Math.min(24, Number(config.get('farm_plot_count')) || DEFAULT_PLOTS));
}

function parseStarterSeeds(raw: string | undefined, crops: CropRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw) {
    for (const part of raw.split(',')) {
      const [id, qty] = part.split(':').map((s) => s.trim());
      if (id && crops.some((c) => c.cropId === id) && Number(qty) > 0)
        out[id] = Math.floor(Number(qty));
    }
    if (Object.keys(out).length > 0) return out;
  }
  // Temporary default (seed acquisition is an open decision): one seed of every enabled crop.
  for (const crop of crops) out[crop.cropId] = 1;
  return out;
}

async function buildState(
  ctx: WorldCtx,
  extra?: Partial<FarmStateResponse>,
): Promise<FarmStateResponse> {
  const [crops, table, doc, config, clock, weather] = await Promise.all([
    loadCrops(ctx),
    ctx.gateway.readTab('29_PLAYER_FARM'),
    readWorldDoc(ctx.gateway, ctx.userId, 'farm'),
    readAppConfig(ctx.gateway),
    getDayClock(ctx.gateway, ctx.now),
    readWeather(ctx),
  ]);
  const count = await plotCount(ctx);
  const rows = new Map(
    table.rows
      .filter((r) => r.raw.user_id === ctx.userId)
      .map((r) => [r.raw.plot_id ?? '', r.raw] as const),
  );
  const plots: FarmPlotView[] = Array.from({ length: count }, (_, i) => {
    const plotId = `plot_${i + 1}`;
    const plot = toPlotRow(rows.get(plotId));
    const crop = crops.find((c) => c.cropId === plot?.cropId);
    return { plotId, ...evaluatePlot(plot, crop, ctx.now.getTime()) };
  });
  const cropViews: FarmCropView[] = crops.map((c) => ({
    cropId: c.cropId,
    displayNameTextId: c.displayNameTextId,
    growHours: c.growHours,
    wateringIntervalHours: c.wateringIntervalHours,
    harvestYield: c.harvestYield,
    rarity: c.rarity,
    seeds: doc.seeds[c.cropId] ?? 0,
    produce: doc.produce[c.cropId] ?? 0,
  }));
  return {
    ok: true,
    plots,
    crops: cropViews,
    weather: weather.status,
    // The Barn stays an exterior until Ahmed's Sheet flag unlocks its later interior.
    barn: { unlocked: (config.get('barn_unlocked') ?? 'FALSE').toUpperCase() === 'TRUE' },
    marcelinoHere: marcelinoPresence(config, ctx.now, clock.timeZone).at === 'farm',
    harvests: doc.harvests,
    ...extra,
  };
}

async function evaluateFarmAchievements(
  ctx: WorldCtx,
  doc: FarmDoc,
  crops: CropRow[],
): Promise<WorldAchievementView[]> {
  const table = await ctx.gateway.readTab('23_ACHIEVEMENTS');
  const out: WorldAchievementView[] = [];
  for (const row of table.rows) {
    if (row.values.enabled !== true || row.raw.trigger_type !== 'farm') continue;
    const harvests = jsonNumber(row.raw.trigger_rule_json, 'harvest_count');
    const plantings = jsonNumber(row.raw.trigger_rule_json, 'plant_count');
    const allCrops = /"all_crops"\s*:\s*true/.test(row.raw.trigger_rule_json ?? '');
    if (harvests === null && plantings === null && !allCrops) continue;
    const met =
      (harvests === null || doc.harvests >= harvests) &&
      (plantings === null || doc.plantCount >= plantings) &&
      (!allCrops || crops.every((c) => doc.cropsPlanted.includes(c.cropId)));
    if (!met) continue;
    const outcome = await unlockAchievement(ctx, row.primaryKeyValue ?? '');
    if (outcome.applied) out.push(outcome);
  }
  return out;
}

/** Applies real rain that fell since each plot was last watered (once per rain hour, idempotent by construction). */
async function applyRain(ctx: WorldCtx, crops: CropRow[]): Promise<string[]> {
  const weather = await readWeather(ctx);
  if (weather.status === 'unavailable' || weather.rainHours.length === 0) return [];
  const table = await ctx.gateway.readTab('29_PLAYER_FARM', { bypass: true });
  const watered: string[] = [];
  for (const row of table.rows.filter((r) => r.raw.user_id === ctx.userId)) {
    const plot = toPlotRow(row.raw);
    const crop = crops.find((c) => c.cropId === plot?.cropId);
    if (!plot || !crop || !crop.rainWaters) continue;
    const since = Math.max(plot.lastWateredAt ?? 0, plot.plantedAt ?? 0);
    const rainAt = [...weather.rainHours].reverse().find((h) => h.getTime() > since);
    if (!rainAt) continue;
    // A finished (ready) plot needs no water.
    if (evaluatePlot(plot, crop, ctx.now.getTime()).state === 'ready') continue;
    await ctx.gateway.updateByPrimaryKey(
      '29_PLAYER_FARM',
      row.primaryKeyValue ?? '',
      wateredPatch(plot, crop, rainAt.getTime()),
    );
    watered.push(row.raw.plot_id ?? '');
  }
  return watered;
}

export async function enterFarm(ctx: WorldCtx): Promise<FarmStateResponse> {
  await assertLocationAccess(ctx, 'farm');
  const [crops, config] = await Promise.all([loadCrops(ctx), readAppConfig(ctx.gateway)]);
  await mutateWorldDoc(ctx, 'farm', (doc) => {
    if (doc.starterGranted) return;
    doc.starterGranted = true;
    doc.seeds = parseStarterSeeds(config.get('farm_starter_seeds'), crops);
  });
  const rainWatered = await ctx.mutex.run(`farm-rain:${ctx.userId}`, () => applyRain(ctx, crops));
  return buildState(ctx, rainWatered.length ? { rainWatered } : undefined);
}

export async function getFarmState(ctx: WorldCtx): Promise<FarmStateResponse> {
  return buildState(ctx);
}

function requirePlot(plotId: string, count: number): void {
  const n = /^plot_(\d+)$/.exec(plotId);
  if (!n || Number(n[1]) < 1 || Number(n[1]) > count)
    throw new AppError('invalid_request', 'Unknown plot.');
}

async function finish(
  ctx: WorldCtx,
  base: Awaited<ReturnType<typeof buildState>>,
  achievements: WorldAchievementView[] = [],
) {
  const journey = await syncJourney(ctx);
  const rewards: WorldRewardView[] = (journey.advanced ?? []).flatMap((a) =>
    a.reward ? [a.reward] : [],
  );
  return { ...base, rewards, achievements };
}

export async function plantSeed(
  ctx: WorldCtx,
  plotId: string,
  cropId: string,
): Promise<FarmStateResponse> {
  await assertLocationAccess(ctx, 'farm');
  requirePlot(plotId, await plotCount(ctx));
  const crops = await loadCrops(ctx);
  const crop = crops.find((c) => c.cropId === cropId);
  if (!crop) throw new AppError('not_found', 'Unknown crop.');
  const key = plotKey(ctx.userId, plotId);
  await ctx.mutex.run(`farm-plot:${key}`, async () => {
    const existing = await ctx.gateway.findByPrimaryKey('29_PLAYER_FARM', key, { bypass: true });
    if (toPlotRow(existing?.row.raw))
      throw new AppError('WORLD_INVALID_STATE', 'That plot is already planted.');
    await mutateWorldDoc(ctx, 'farm', (doc) => {
      if ((doc.seeds[cropId] ?? 0) < 1)
        throw new AppError('WORLD_INVALID_STATE', 'No seeds of that crop.');
      doc.seeds[cropId] = (doc.seeds[cropId] ?? 0) - 1;
      doc.plantedFirst = true;
      doc.plantCount += 1;
      if (!doc.cropsPlanted.includes(cropId)) doc.cropsPlanted.push(cropId);
    });
    const now = ctx.now.toISOString();
    const patch = {
      crop_id: cropId,
      state: 'planted',
      planted_at: now,
      last_watered_at: '',
      next_water_due_at: now,
      ready_at: new Date(ctx.now.getTime() + crop.growHours * HOUR_MS).toISOString(),
      wilted_at: '',
      updated_at: now,
    };
    if (existing) await ctx.gateway.updateByPrimaryKey('29_PLAYER_FARM', key, patch);
    else
      await ctx.gateway.appendRow('29_PLAYER_FARM', {
        user_plot_key: key,
        user_id: ctx.userId,
        plot_id: plotId,
        harvest_count: '0',
        ...patch,
      });
  });
  const { doc } = await mutateWorldDoc(ctx, 'farm', () => undefined);
  return finish(ctx, await buildState(ctx), await evaluateFarmAchievements(ctx, doc, crops));
}

export async function waterPlot(ctx: WorldCtx, plotId: string): Promise<FarmStateResponse> {
  await assertLocationAccess(ctx, 'farm');
  requirePlot(plotId, await plotCount(ctx));
  const crops = await loadCrops(ctx);
  const key = plotKey(ctx.userId, plotId);
  await ctx.mutex.run(`farm-plot:${key}`, async () => {
    const existing = await ctx.gateway.findByPrimaryKey('29_PLAYER_FARM', key, { bypass: true });
    const plot = toPlotRow(existing?.row.raw);
    const crop = crops.find((c) => c.cropId === plot?.cropId);
    if (!plot || !crop) throw new AppError('WORLD_INVALID_STATE', 'Nothing is planted there.');
    const view = evaluatePlot(plot, crop, ctx.now.getTime());
    // Idempotent: a healthy plot that is not due, or a finished one, is left untouched.
    if (view.state === 'ready' || !view.needsWater) return;
    await ctx.gateway.updateByPrimaryKey(
      '29_PLAYER_FARM',
      key,
      wateredPatch(plot, crop, ctx.now.getTime()),
    );
    await mutateWorldDoc(ctx, 'farm', (doc) => {
      doc.wateredFirst = true;
    });
  });
  const { doc } = await mutateWorldDoc(ctx, 'farm', () => undefined);
  return finish(ctx, await buildState(ctx), await evaluateFarmAchievements(ctx, doc, crops));
}

export async function harvestPlot(ctx: WorldCtx, plotId: string): Promise<FarmStateResponse> {
  await assertLocationAccess(ctx, 'farm');
  requirePlot(plotId, await plotCount(ctx));
  const crops = await loadCrops(ctx);
  const key = plotKey(ctx.userId, plotId);
  await ctx.mutex.run(`farm-plot:${key}`, async () => {
    const existing = await ctx.gateway.findByPrimaryKey('29_PLAYER_FARM', key, { bypass: true });
    const plot = toPlotRow(existing?.row.raw);
    const crop = crops.find((c) => c.cropId === plot?.cropId);
    if (!plot || !crop) throw new AppError('WORLD_INVALID_STATE', 'Nothing is planted there.');
    if (evaluatePlot(plot, crop, ctx.now.getTime()).state !== 'ready') {
      throw new AppError('WORLD_INVALID_STATE', 'That crop is not ready yet.');
    }
    // Clear the plot first: a retry then finds it empty and cannot pay out twice.
    await ctx.gateway.updateByPrimaryKey('29_PLAYER_FARM', key, {
      crop_id: '',
      state: 'empty',
      planted_at: '',
      last_watered_at: '',
      next_water_due_at: '',
      ready_at: '',
      wilted_at: '',
      harvest_count: String((Number(existing?.row.raw.harvest_count) || 0) + 1),
      updated_at: ctx.now.toISOString(),
    });
    await mutateWorldDoc(ctx, 'farm', (doc) => {
      doc.produce[crop.cropId] = (doc.produce[crop.cropId] ?? 0) + crop.harvestYield;
      doc.harvests += 1;
    });
  });
  const { doc } = await mutateWorldDoc(ctx, 'farm', () => undefined);
  return finish(ctx, await buildState(ctx), await evaluateFarmAchievements(ctx, doc, crops));
}

/**
 * Consumption hook for harvested produce (Cottage decoration now; Café drinks
 * later, once their recipe list exists). Produce inventory is separate from
 * keys. Throws when the player does not hold enough.
 */
export async function consumeProduce(
  ctx: WorldCtx,
  cropId: string,
  quantity: number,
): Promise<void> {
  if (!Number.isInteger(quantity) || quantity < 1)
    throw new AppError('invalid_request', 'Invalid quantity.');
  await mutateWorldDoc(ctx, 'farm', (doc) => {
    if ((doc.produce[cropId] ?? 0) < quantity) {
      throw new AppError('WORLD_INVALID_STATE', 'Not enough harvested produce.');
    }
    doc.produce[cropId] = (doc.produce[cropId] ?? 0) - quantity;
  });
}

export async function returnProduce(
  ctx: WorldCtx,
  cropId: string,
  quantity: number,
): Promise<void> {
  await mutateWorldDoc(ctx, 'farm', (doc) => {
    doc.produce[cropId] = (doc.produce[cropId] ?? 0) + quantity;
  });
}

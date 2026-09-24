import { describe, expect, it } from 'vitest';
import { row } from '@veoullas-world/test-fixtures';
import {
  getCafeState,
  openGramophone,
  requestSong,
  setWalkmanSelection,
} from '../src/world/cafe.js';
import {
  adaptiveDifficulty,
  enterArcade,
  getArcadeState,
  recordAttempt,
  unlockCabinet,
} from '../src/world/arcade.js';
import {
  deliverDueMessages,
  deliverFirstMessage,
  enterCottage,
  getCottageState,
  openMessage,
  setDecor,
  translateMessage,
} from '../src/world/cottage.js';
import {
  enterFarm,
  evaluatePlot,
  getFarmState,
  harvestPlot,
  plantSeed,
  waterPlot,
} from '../src/world/farm.js';
import {
  getMapState,
  solveFinalRoadPuzzle,
  verifyEntrance,
  viewExhibit,
  getMuseumState,
} from '../src/world/museum.js';
import { acknowledgeInteraction, getJourneyState } from '../src/world/journey.js';
import { mutateWorldDoc } from '../src/world/state.js';
import { getPlayerKeys } from '../src/services/player-keys.service.js';
import {
  addChurchContent,
  appendRows,
  buildWorldWorkbook,
  WORLD_NOW,
  WORLD_USER,
  worldCtx,
  worldGateway,
} from './helpers/world-fixture.js';
import {
  addArcadeContent,
  addCafeContent,
  addCottageContent,
  addFarmContent,
  addMuseumContent,
  unlockThrough,
} from './helpers/world-fixture-extra.js';

const build = () =>
  buildWorldWorkbook((wb) => {
    addChurchContent(wb);
    addCafeContent(wb);
    addArcadeContent(wb);
    addFarmContent(wb);
    addCottageContent(wb);
    addMuseumContent(wb);
  });

async function at(beatId: string, overrides?: Parameters<typeof worldCtx>[1]) {
  const gateway = worldGateway(build());
  const ctx = worldCtx(gateway, overrides);
  await unlockThrough(ctx, beatId);
  return { gateway, ctx };
}

const hours = (h: number) => new Date(WORLD_NOW.getTime() + h * 3_600_000);

describe('Vinyl Café + Walkman (M09)', () => {
  it('lists every released song, several per date, retained past songs, no future/placeholder/hymn rows', async () => {
    const { ctx } = await at('beat_08_cafe');
    const state = await getCafeState(ctx, 'en');
    expect(state.releases.map((r) => r.day)).toEqual(['2026-09-26', '2026-09-01', 'first_visit']);
    expect(state.releases[0]!.songs.map((s) => s.songId).sort()).toEqual([
      'song_today_a',
      'song_today_b',
    ]);
    const all = state.releases.flatMap((r) => r.songs);
    expect(all.some((s) => s.songId === 'song_future')).toBe(false);
    expect(all.some((s) => s.title.includes('<'))).toBe(false);
    expect(all.some((s) => s.songId === 'hymn_1')).toBe(false);
    expect(all.find((s) => s.songId === 'song_today_a')?.isToday).toBe(true);
  });

  it('resolves audio only for registered assets and explanation cards per locale', async () => {
    const { ctx } = await at('beat_08_cafe');
    const en = (await getCafeState(ctx, 'en')).releases.flatMap((r) => r.songs);
    expect(en.find((s) => s.songId === 'song_today_a')?.audioRef).toBe(
      '/api/media/audio_song_today_a?v=1',
    );
    expect(en.find((s) => s.songId === 'song_old')?.audioRef).toBeNull();
    expect(en.find((s) => s.songId === 'song_today_a')?.explanation).toBe('Why this song');
    const ar = (await getCafeState(ctx, 'ar-EG')).releases.flatMap((r) => r.songs);
    expect(ar.find((s) => s.songId === 'song_today_a')?.explanation).toBe('ليه الأغنية دي');
  });

  it('entering the Café never starts a song; opening the gramophone is the first interaction and pays the music key once', async () => {
    const { ctx, gateway } = await at('beat_08_cafe');
    const before = await getCafeState(ctx, 'en');
    expect(before.walkman).toBeNull();
    const opened = await openGramophone(ctx, 'en');
    expect(opened.rewards).toEqual([
      expect.objectContaining({ keyTypeId: 'key_music', applied: true }),
    ]);
    const again = await openGramophone(ctx, 'en');
    expect(again.rewards).toEqual([]);
    const keys = await getPlayerKeys(gateway, ctx.userId);
    expect(keys.find((k) => k.keyTypeId === 'key_music')?.quantityAvailable).toBe(1);
  });

  it('unlocks the Walkman only through the journey step, and only plays registered, Walkman-eligible songs', async () => {
    const { ctx } = await at('beat_09_walkman');
    await expect(
      setWalkmanSelection(ctx, { songId: 'song_today_a', playing: true }, 'en'),
    ).rejects.toMatchObject({
      code: 'WORLD_LOCKED',
    });
    const journey = await acknowledgeInteraction(ctx, 'walkman_receive');
    expect(journey.walkmanUnlocked).toBe(true);
    await expect(
      setWalkmanSelection(ctx, { songId: 'song_old', playing: true }, 'en'),
    ).rejects.toMatchObject({
      code: 'invalid_request',
    });
    await expect(
      setWalkmanSelection(ctx, { songId: 'hymn_1', playing: true }, 'en'),
    ).rejects.toMatchObject({
      code: 'invalid_request',
    });
    const chosen = await setWalkmanSelection(ctx, { songId: 'song_today_a', playing: true }, 'en');
    expect(chosen.walkman).toEqual({ songId: 'song_today_a', playing: true });
    // The selection survives a fresh read (as after a reload or on another device).
    expect((await getCafeState(ctx, 'en')).walkman?.songId).toBe('song_today_a');
  });

  it('writes a song request for Admin review without publishing it, idempotently and rate-limited', async () => {
    const { ctx, gateway } = await at('beat_09_walkman');
    const first = await requestSong(
      ctx,
      { text: 'Please add my song', clientRequestId: 'r1' },
      'en',
    );
    expect(first.status).toBe('pending_review');
    await requestSong(ctx, { text: 'Please add my song', clientRequestId: 'r1' }, 'en');
    const logs = (await gateway.readTab('05_ENTRY_LOGS', { bypass: true })).rows.filter(
      (r) => r.raw.event_type === 'song_request',
    );
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0]!.raw.details_json ?? '{}')).toMatchObject({
      text: 'Please add my song',
      status: 'pending_review',
    });
    const songs = (await gateway.readTab('20_SONGS', { bypass: true })).rows.map(
      (r) => r.raw.title,
    );
    expect(songs).not.toContain('Please add my song');
    for (let i = 2; i <= 5; i++)
      await requestSong(ctx, { text: `song ${i}`, clientRequestId: `r${i}` }, 'en');
    await expect(
      requestSong(ctx, { text: 'one too many', clientRequestId: 'r6' }, 'en'),
    ).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    await expect(
      requestSong(ctx, { text: '   ', clientRequestId: 'r7' }, 'en'),
    ).rejects.toMatchObject({
      code: 'invalid_request',
    });
  });
});

describe('VARcade (M10)', () => {
  it('first visit exposes exactly the configured machine, locks the others, supports five slots, and never enables game music', async () => {
    const { ctx } = await at('beat_10_arcade');
    const state = await enterArcade(ctx);
    expect(state.supportedSlots).toBe(5);
    expect(state.games.map((g) => [g.gameId, g.installed, g.unlocked])).toEqual([
      ['game_memory', true, true],
      ['game_catch', true, false],
      ['game_puzzle', true, false],
      ['game_maze', false, false],
      ['game_trivia', false, false],
    ]);
    expect(state.games.every((g) => g.musicEnabled === false)).toBe(true);
    expect(state.games[0]!.walkmanVolumePercent).toBe(25);
  });

  it('rejects an attempt on a locked or uninstalled machine', async () => {
    const { ctx } = await at('beat_10_arcade');
    await expect(
      recordAttempt(ctx, { gameId: 'game_catch', clientAttemptId: 'a1', score: 5, result: 'win' }),
    ).rejects.toMatchObject({ code: 'WORLD_LOCKED' });
    await expect(
      recordAttempt(ctx, { gameId: 'game_maze', clientAttemptId: 'a2', score: 5, result: 'win' }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      recordAttempt(ctx, {
        gameId: 'game_memory',
        clientAttemptId: 'a3',
        score: -1,
        result: 'win',
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });

  it('the first win completes the introduction and pays the token once, despite unlimited attempts and retries', async () => {
    const { ctx, gateway } = await at('beat_10_arcade');
    const first = await recordAttempt(ctx, {
      gameId: 'game_memory',
      clientAttemptId: 'a1',
      score: 40,
      result: 'win',
    });
    expect(first.state.rewards).toEqual([
      expect.objectContaining({ keyTypeId: 'key_token', applied: true }),
    ]);
    expect(first.personalBest).toBe(true);
    expect((await getJourneyState(ctx)).currentBeat?.beatId).toBe('beat_11_cottage');
    const retry = await recordAttempt(ctx, {
      gameId: 'game_memory',
      clientAttemptId: 'a1',
      score: 40,
      result: 'win',
    });
    expect(retry.duplicate).toBe(true);
    const second = await recordAttempt(ctx, {
      gameId: 'game_memory',
      clientAttemptId: 'a2',
      score: 30,
      result: 'win',
    });
    expect(second.state.rewards).toEqual([]);
    expect(second.personalBest).toBe(false);
    const keys = await getPlayerKeys(gateway, ctx.userId);
    expect(keys.find((k) => k.keyTypeId === 'key_token')?.quantityAvailable).toBe(1);
    const state = await getArcadeState(ctx);
    expect(state.games[0]).toMatchObject({ personalBest: 40, attempts: 2 });
  });

  it('adapts difficulty from results (server-side): two wins up, two losses down, within 1..5', () => {
    expect(adaptiveDifficulty([])).toBe(1);
    expect(adaptiveDifficulty([{ result: 'win' }, { result: 'win' }])).toBe(2);
    expect(adaptiveDifficulty(Array(20).fill({ result: 'win' }))).toBe(5);
    expect(
      adaptiveDifficulty([
        { result: 'win' },
        { result: 'win' },
        { result: 'lose' },
        { result: 'lose' },
      ]),
    ).toBe(1);
  });

  it('unlocks a cabinet by spending its Sheet key cost once, and unlocks an achievement after its attempt count', async () => {
    const { ctx, gateway } = await at('beat_11_cottage');
    await expect(unlockCabinet(ctx, 'game_catch')).rejects.toMatchObject({
      code: 'WORLD_INVALID_STATE',
    });
    await gateway.updateByPrimaryKey('25_PLAYER_KEYS', `${WORLD_USER}|key_token`, {
      quantity_found: '5',
      quantity_available: '5',
    });
    const unlocked = await unlockCabinet(ctx, 'game_catch');
    expect(unlocked.games.find((g) => g.gameId === 'game_catch')?.unlocked).toBe(true);
    await unlockCabinet(ctx, 'game_catch');
    const keys = await getPlayerKeys(gateway, ctx.userId);
    expect(keys.find((k) => k.keyTypeId === 'key_token')?.quantityAvailable).toBe(3);
    await recordAttempt(ctx, {
      gameId: 'game_memory',
      clientAttemptId: 'x1',
      score: 1,
      result: 'lose',
    });
    await recordAttempt(ctx, {
      gameId: 'game_memory',
      clientAttemptId: 'x2',
      score: 1,
      result: 'lose',
    });
    const third = await recordAttempt(ctx, {
      gameId: 'game_memory',
      clientAttemptId: 'x3',
      score: 1,
      result: 'lose',
    });
    expect(third.state.achievements?.map((a) => a.achievementId)).toEqual(['ach_arcade_three']);
  });
});

describe('Cottage, Mailbox, Marcelino (M11)', () => {
  it("delivers Ahmed's first message from the Sheet with a random initial language, and reading it archives it", async () => {
    const { ctx } = await at('beat_12_marcelino');
    const delivery = await deliverFirstMessage(ctx);
    expect(delivery.batches).toHaveLength(1);
    const message = delivery.batches[0]![0]!;
    expect(message.messageId).toBe('msg_welcome_ahmed');
    expect(message.text).toBe('Fixture first message');
    expect(message.readStatus).toBe('unread');
    // Marcelino's delivery is the step that pays the letter key (the Sheet's beat → rule mapping).
    expect(delivery.state.rewards).toEqual([
      expect.objectContaining({ keyTypeId: 'key_letter', applied: true }),
    ]);
    const opened = await openMessage(ctx, 'msg_welcome_ahmed');
    expect(opened.messages[0]!.readStatus).toBe('archived');
    expect(opened.unreadCount).toBe(0);
    expect((await getJourneyState(ctx)).currentBeat?.beatId).toBe('beat_14_farm');
    expect(opened.rewards).toEqual([]);
  });

  it("never invents Ahmed's message: with no written text the step stays incomplete and can be retried once written", async () => {
    const wb = build();
    for (const r of wb['19_MESSAGES']!.slice(1))
      if (r[1] === 'msg_welcome_ahmed') r[8] = "<WRITE AHMED'S FIRST MESSAGE>";
    const gateway = worldGateway(wb);
    const ctx = worldCtx(gateway);
    await unlockThrough(ctx, 'beat_12_marcelino');
    await expect(deliverFirstMessage(ctx)).rejects.toMatchObject({
      code: 'WORLD_CONTENT_UNAVAILABLE',
    });
    expect((await getJourneyState(ctx)).currentBeat?.beatId).toBe('beat_12_marcelino');
    expect(
      (await getPlayerKeys(gateway, ctx.userId)).find((k) => k.keyTypeId === 'key_letter'),
    ).toBeUndefined();
    await gateway.updateByPrimaryKey('19_MESSAGES', 'msg_welcome_ahmed_en', {
      text: 'Now written',
    });
    const later = await deliverFirstMessage(ctx);
    expect(later.batches.flat().map((m) => m.text)).toContain('Now written');
    expect((await getJourneyState(ctx)).currentBeat?.beatId).toBe('beat_13_message');
  });

  it('delivers multiple same-day messages independently: important alone, the rest together, unwritten/future skipped', async () => {
    const { ctx } = await at('beat_14_farm');
    const entered = await enterCottage(ctx);
    expect(entered.batches.map((b) => b.map((m) => m.messageId).sort())).toEqual([
      ['msg_important'],
      ['msg_plain_a', 'msg_plain_b'],
    ]);
    const ids = entered.state.messages.map((m) => m.messageId);
    expect(ids).not.toContain('msg_future');
    expect(ids).not.toContain('msg_unwritten');
    // Retrying (a second visit) delivers nothing twice.
    expect((await enterCottage(ctx)).batches).toEqual([]);
    // Each archives independently.
    const opened = await openMessage(ctx, 'msg_plain_a');
    expect(opened.messages.find((m) => m.messageId === 'msg_plain_a')?.readStatus).toBe('archived');
    expect(opened.messages.find((m) => m.messageId === 'msg_plain_b')?.readStatus).toBe('unread');
  });

  it("the ribbon translates using the Sheet's own locale row without overwriting the initial language", async () => {
    const { ctx } = await at('beat_12_marcelino');
    await deliverFirstMessage(ctx);
    const translated = await translateMessage(ctx, 'msg_welcome_ahmed', 'ar-EG');
    const message = translated.messages[0]!;
    expect(message.shownLocale).toBe('ar-EG');
    expect(message.direction).toBe('rtl');
    expect(message.text).toBe('رسالة الاختبار الأولى');
    expect(message.initialLocale).toBe('en');
    await expect(translateMessage(ctx, 'msg_welcome_ahmed', 'fr')).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('picks initial languages independently and avoids repeating the previous language when another exists', async () => {
    const wb = build();
    appendRows(wb, '19_MESSAGES', [
      ...['en', 'ar-EG', 'it'].map((locale) =>
        row('19_MESSAGES', {
          message_row_id: `multi_${locale}`,
          message_id: 'msg_multi',
          recipient_user_id: WORLD_USER,
          delivery_at: '2026-09-26',
          priority: '2',
          locale,
          text: `Multi ${locale}`,
          enabled: 'TRUE',
        }),
      ),
    ]);
    const gateway = worldGateway(wb);
    const ctx = worldCtx(gateway, { random: () => 0 });
    await unlockThrough(ctx, 'beat_12_marcelino');
    await deliverFirstMessage(ctx); // initial locale en (random 0 → first written locale)
    const delivered = await deliverDueMessages(ctx);
    const multi = (await getCottageState(ctx)).messages.find((m) => m.messageId === 'msg_multi')!;
    expect(delivered.length).toBeGreaterThan(0);
    expect(multi.initialLocale).not.toBe('en');
  });

  it('shows a Sheet-driven countdown that becomes a framed memory bearing the event date, from server time', async () => {
    const { ctx } = await at('beat_14_farm');
    const before = (await getCottageState(ctx)).countdown!;
    expect(before).toMatchObject({
      eventId: 'birthday_fixture',
      completed: false,
      completedDate: null,
    });
    expect((await getCottageState(ctx)).serverNow).toBe(WORLD_NOW.toISOString());
    const later = worldCtx(ctx.gateway, { now: new Date('2026-10-02T12:00:00.000Z') });
    const after = (await getCottageState(later)).countdown!;
    expect(after).toMatchObject({ completed: true, completedDate: '2026-10-01' });
    // Changing the Sheet target needs no rebuild.
    await ctx.gateway.updateByPrimaryKey('17_EVENTS', 'birthday_fixture', {
      target_at: '2027-01-01T00:00:00.000Z',
    });
    expect((await getCottageState(later)).countdown!.completed).toBe(false);
  });

  it('places harvested produce as decoration and returns it when cleared', async () => {
    const { ctx } = await at('beat_14_farm');
    await mutateWorldDoc(ctx, 'farm', (doc) => {
      doc.produce.sunflower = 1;
    });
    await expect(setDecor(ctx, 'decor_9', 'sunflower')).rejects.toMatchObject({
      code: 'invalid_request',
    });
    const placed = await setDecor(ctx, 'decor_1', 'sunflower');
    expect(placed.decor.placed).toEqual({ decor_1: 'sunflower' });
    expect(placed.produce.sunflower).toBe(0);
    await expect(setDecor(ctx, 'decor_2', 'sunflower')).rejects.toMatchObject({
      code: 'WORLD_INVALID_STATE',
    });
    const cleared = await setDecor(ctx, 'decor_1', null);
    expect(cleared.produce.sunflower).toBe(1);
  });

  it('Marcelino is not permanently present: with no schedule he is away, and appears with a delivery', async () => {
    const { ctx } = await at('beat_14_farm');
    expect((await getCottageState(ctx)).marcelino).toMatchObject({ visible: false, at: 'away' });
    const visit = await enterCottage(ctx);
    expect(visit.batches.length).toBeGreaterThan(0);
    expect(visit.state.marcelino).toMatchObject({ visible: true, at: 'cottage' });
    // Nothing left to deliver on the next visit: he is away again.
    expect((await enterCottage(ctx)).state.marcelino.visible).toBe(false);
  });

  it('Marcelino follows Sheet schedules and reports the delivery count', async () => {
    const { ctx, gateway } = await at('beat_12_marcelino');
    await gateway.appendRow('01_APP_CONFIG', {
      config_key: 'marcelino_windows',
      value: '12:00-14:00',
      enabled: 'TRUE',
    });
    await gateway.appendRow('01_APP_CONFIG', {
      config_key: 'marcelino_farm_windows',
      value: '18:00-20:00',
      enabled: 'TRUE',
    });
    const atTen = await getCottageState(
      worldCtx(gateway, { now: new Date('2026-09-26T10:00:00Z') }),
    );
    expect(atTen.marcelino).toMatchObject({ visible: true, at: 'cottage' });
    const atSixteen = await getCottageState(
      worldCtx(gateway, { now: new Date('2026-09-26T16:00:00Z') }),
    );
    expect(atSixteen.marcelino).toMatchObject({ visible: true, at: 'farm' });
    const atNoon = await getCottageState(
      worldCtx(gateway, { now: new Date('2026-09-26T12:00:00Z') }),
    );
    expect(atNoon.marcelino).toMatchObject({ visible: false, at: 'away' });
    await deliverFirstMessage(ctx);
    expect((await getCottageState(ctx)).marcelino.deliveries).toBe(1);
  });
});

describe('Sunberry Fields (M12)', () => {
  const rain = (...hs: number[]) => ({ rainHours: async () => hs.map(hours) });

  it('grants the Sheet-configured starter seeds once and runs plant → water → harvest with separate inventories', async () => {
    const { ctx } = await at('beat_14_farm');
    const first = await enterFarm(ctx);
    expect(first.crops.map((c) => [c.cropId, c.seeds, c.produce])).toEqual([
      ['sunflower', 1, 0],
      ['mango', 1, 0],
      ['blueberry', 1, 0],
    ]);
    await enterFarm(ctx);
    const planted = await plantSeed(ctx, 'plot_1', 'sunflower');
    expect(planted.crops.find((c) => c.cropId === 'sunflower')?.seeds).toBe(0);
    expect(planted.plots[0]).toMatchObject({
      cropId: 'sunflower',
      state: 'planted',
      needsWater: true,
    });
    await expect(plantSeed(ctx, 'plot_1', 'mango')).rejects.toMatchObject({
      code: 'WORLD_INVALID_STATE',
    });
    await expect(plantSeed(ctx, 'plot_2', 'sunflower')).rejects.toMatchObject({
      code: 'WORLD_INVALID_STATE',
    });
    const watered = await waterPlot(ctx, 'plot_1');
    expect(watered.plots[0]).toMatchObject({ state: 'growing', needsWater: false });
    // The first plant+water completes the farm step and pays the sunflower key once.
    expect(watered.rewards).toEqual([
      expect.objectContaining({ keyTypeId: 'key_sunflower', applied: true }),
    ]);
    await expect(harvestPlot(ctx, 'plot_1')).rejects.toMatchObject({ code: 'WORLD_INVALID_STATE' });

    // Growth uses the authoritative clock and survives devices: a fresh context 73h later sees it ready.
    const later = worldCtx(ctx.gateway, { now: hours(30) });
    // Keep it alive (watered daily) so it is not wilted at harvest time.
    await waterPlot(later, 'plot_1');
    const evening = worldCtx(ctx.gateway, { now: hours(55) });
    await waterPlot(evening, 'plot_1');
    const ready = worldCtx(ctx.gateway, { now: hours(75) });
    expect((await getFarmState(ready)).plots[0]).toMatchObject({ state: 'ready' });
    const harvested = await harvestPlot(ready, 'plot_1');
    expect(harvested.crops.find((c) => c.cropId === 'sunflower')?.produce).toBe(1);
    expect(harvested.plots[0]!.state).toBe('empty');
    expect(harvested.harvests).toBe(1);
    expect(harvested.achievements?.map((a) => a.achievementId)).toEqual(['ach_first_harvest']);
    // A retried harvest cannot pay out twice.
    await expect(harvestPlot(ready, 'plot_1')).rejects.toMatchObject({
      code: 'WORLD_INVALID_STATE',
    });
  });

  it('a missed watering wilts and stops growth but never kills the plant; recovery delays the harvest', () => {
    const crop = {
      cropId: 'sunflower',
      displayNameTextId: '',
      growHours: 72,
      wateringIntervalHours: 24,
      wiltAfterHours: 36,
      rainWaters: true,
      harvestYield: 1,
      rarity: '',
      seedIconId: '',
      cropIconId: '',
    };
    const t0 = Date.parse('2026-09-26T00:00:00Z');
    const plot = {
      cropId: 'sunflower',
      plantedAt: t0,
      lastWateredAt: t0,
      readyAt: t0 + 72 * 3_600_000,
    };
    expect(evaluatePlot(plot, crop, t0 + 10 * 3_600_000).state).toBe('growing');
    expect(evaluatePlot(plot, crop, t0 + 25 * 3_600_000)).toMatchObject({
      state: 'planted',
      needsWater: true,
    });
    const wilted = evaluatePlot(plot, crop, t0 + 500 * 3_600_000);
    expect(wilted.state).toBe('wilted'); // days later: still wilted, never removed
    expect(wilted.progressPercent).toBeLessThan(100);
    expect(wilted.wiltedAt).toBe(new Date(t0 + 36 * 3_600_000).toISOString());
  });

  it('eligible real rain waters once, only rain-watered crops, and a failed weather lookup changes nothing', async () => {
    const { ctx, gateway } = await at('beat_14_farm');
    await enterFarm(ctx);
    await plantSeed(ctx, 'plot_1', 'sunflower'); // rain_waters TRUE
    await plantSeed(ctx, 'plot_2', 'blueberry'); // rain_waters FALSE
    const wet = worldCtx(gateway, { now: hours(11), weather: rain(10) });
    const entered = await enterFarm(wet);
    expect(entered.rainWatered).toEqual(['plot_1']);
    const table = await gateway.readTab('29_PLAYER_FARM', { bypass: true });
    const lastWatered = (id: string) =>
      table.rows.find((r) => r.raw.user_id === WORLD_USER && r.raw.plot_id === id)?.raw
        .last_watered_at;
    expect(lastWatered('plot_1')).toBe(hours(10).toISOString());
    expect(lastWatered('plot_2')).toBe('');
    // Idempotent: the same rain hour never waters again.
    expect((await enterFarm(wet)).rainWatered).toBeUndefined();
    // Weather service failure: fallback, nothing changes, status unavailable.
    const broken = worldCtx(gateway, {
      now: hours(30),
      weather: {
        rainHours: async () => {
          throw new Error('down');
        },
      },
    });
    const fallback = await enterFarm(broken);
    expect(fallback.weather).toBe('unavailable');
    expect(fallback.rainWatered).toBeUndefined();
  });

  it('reports raining when the latest rain hour is within two hours, and keeps the Barn an exterior until the Sheet unlocks it', async () => {
    const { ctx, gateway } = await at('beat_14_farm');
    const state = await getFarmState(worldCtx(gateway, { now: hours(11), weather: rain(10) }));
    expect(state.weather).toBe('raining');
    expect(state.barn.unlocked).toBe(false);
    expect(
      (await getFarmState(worldCtx(gateway, { now: hours(20), weather: rain(10) }))).weather,
    ).toBe('dry');
    await gateway.appendRow('01_APP_CONFIG', {
      config_key: 'barn_unlocked',
      value: 'TRUE',
      enabled: 'TRUE',
    });
    expect((await getFarmState(ctx)).barn.unlocked).toBe(true);
  });
});

describe('The Everkeep (M13) and the Living Map (M14)', () => {
  const requiredKeys = [
    'key_shell',
    'key_candle',
    'key_music',
    'key_token',
    'key_letter',
    'key_sunflower',
  ];

  it('verifies the entrance requirement and the road puzzle on the server, then opens the hall and pays the Everkeep key', async () => {
    const { ctx, gateway } = await at('beat_15_museum_approach');
    const state = await getMuseumState(ctx);
    expect(state.entrance.requirement.map((r) => r.keyTypeId).sort()).toEqual(
      [...requiredKeys].sort(),
    );
    expect(state.entrance.puzzleRequired).toBe(true);
    await expect(verifyEntrance(ctx)).rejects.toMatchObject({ code: 'WORLD_LOCKED' }); // puzzle unsolved
    await expect(solveFinalRoadPuzzle(ctx, ['key_shell'])).rejects.toMatchObject({
      code: 'invalid_request',
    });
    await solveFinalRoadPuzzle(ctx, requiredKeys);
    const verified = await verifyEntrance(ctx);
    expect(verified.entrance.open).toBe(true);
    expect(verified.rewards).toEqual([
      expect.objectContaining({ keyTypeId: 'key_everkeep', applied: true }),
    ]);
    expect((await getJourneyState(ctx)).currentBeat?.beatId).toBe('beat_16_hall');
    expect(
      (await getPlayerKeys(gateway, ctx.userId)).find((k) => k.keyTypeId === 'key_everkeep')
        ?.quantityAvailable,
    ).toBe(1);
  });

  it('refuses the entrance while any required key is missing, even if the client claims otherwise', async () => {
    const { ctx, gateway } = await at('beat_15_museum_approach');
    await gateway.updateByPrimaryKey('25_PLAYER_KEYS', `${WORLD_USER}|key_letter`, {
      quantity_found: '0',
      quantity_available: '0',
    });
    await expect(solveFinalRoadPuzzle(ctx, requiredKeys)).rejects.toMatchObject({
      code: 'WORLD_LOCKED',
    });
    await expect(verifyEntrance(ctx)).rejects.toMatchObject({ code: 'WORLD_LOCKED' });
  });

  it('keeps wings locked on the first visit, hides secret slots completely, and never opens the birthday-event exhibit early', async () => {
    const { ctx } = await at('beat_15_museum_approach');
    const state = await getMuseumState(ctx);
    const json = JSON.stringify(state);
    expect(json).not.toContain('SECRET_TITLE_MUST_NOT_LEAK');
    expect(json).not.toContain('exhibit_secret_001');
    expect(state.wings.every((w) => w.locked)).toBe(true);
    const secret = state.wings.find((w) => w.wingId === 'secret_wing')!.exhibits[0]!;
    expect(secret).toMatchObject({
      locked: true,
      secret: true,
      positionId: 'secret_01',
      displayNameTextId: '',
      imageRefs: [],
    });
    await expect(viewExhibit(ctx, 'exhibit_story', null)).rejects.toMatchObject({
      code: 'WORLD_LOCKED',
    });
  });

  it('completes the entire first journey through real actions and unlocks the Map exactly once, transactionally', async () => {
    const gateway = worldGateway(build());
    const ctx = worldCtx(gateway);
    await unlockThrough(ctx, 'beat_07_church');
    const { lightCandle } = await import('../src/world/church.js');
    await lightCandle(ctx, 'candle_1', 'en');
    await openGramophone(ctx, 'en');
    await acknowledgeInteraction(ctx, 'walkman_receive');
    await recordAttempt(ctx, {
      gameId: 'game_memory',
      clientAttemptId: 'j1',
      score: 10,
      result: 'win',
    });
    await acknowledgeInteraction(ctx, 'cottage_enter');
    await deliverFirstMessage(ctx);
    await openMessage(ctx, 'msg_welcome_ahmed');
    await enterFarm(ctx);
    await plantSeed(ctx, 'plot_1', 'sunflower');
    await waterPlot(ctx, 'plot_1');
    expect((await getJourneyState(ctx)).currentBeat?.beatId).toBe('beat_15_museum_approach');
    // Not yet: the Map is locked and no completion is recorded.
    const early = await getMapState(ctx);
    expect(early.unlocked).toBe(false);
    await solveFinalRoadPuzzle(ctx, requiredKeys);
    await verifyEntrance(ctx);
    const { viewArtifact } = await import('../src/world/museum.js');
    await viewArtifact(ctx);
    expect((await getJourneyState(ctx)).currentBeat?.beatId).toBe('beat_17_map_unlock');
    // The original journey cannot be skipped: completing before the final acknowledgment is refused.
    const { completeFirstJourney } = await import('../src/world/journey.js');
    await expect(completeFirstJourney(ctx)).rejects.toMatchObject({ code: 'WORLD_INVALID_STATE' });

    const done = await acknowledgeInteraction(ctx, 'map_receive');
    expect(done).toMatchObject({
      completed: true,
      mapUnlocked: true,
      phase: 'free',
      startLocation: 'cottage',
    });
    const progress = (await gateway.readTab('24_PLAYER_PROGRESS', { bypass: true })).rows.find(
      (r) => r.primaryKeyValue === `${WORLD_USER}|first_journey`,
    )!;
    expect(progress.raw).toMatchObject({
      status: 'completed',
      first_journey_completed: 'TRUE',
      map_unlocked: 'TRUE',
      last_checkpoint_id: '',
      current_beat_id: '',
    });
    const completedAt = progress.raw.completed_at;
    expect(completedAt).not.toBe('');
    const map = await getMapState(ctx);
    expect(map.unlocked).toBe(true);
    expect(map.locations.every((l) => !l.locked)).toBe(true);
    // Free exploration now unlocks the story wing.
    expect(
      (await getMuseumState(ctx)).wings.find((w) => w.wingId === 'stories_wing')!.exhibits[0]!
        .locked,
    ).toBe(false);
    const keysBefore = (await getPlayerKeys(gateway, ctx.userId))
      .map((k) => [k.keyTypeId, k.quantityFound])
      .sort();
    expect(keysBefore).toHaveLength(7);

    // Admin force flag: one replay offer, no duplicate rewards, flag consumed at the end, history kept.
    await gateway.updateByPrimaryKey('04_ADMIN_FLAGS', 'force_first_journey', { value: '1' });
    const offer = await getJourneyState(ctx);
    expect(offer.phase).toBe('replay_offer');
    const { chooseReplay } = await import('../src/world/journey.js');
    const started = await chooseReplay(ctx, 'start');
    expect(started.phase).toBe('replay');
    expect(started.currentBeat?.beatId).toBe('beat_07_church');
    // Replay steps are confirmed again (no proof-driven auto advance).
    for (const step of [
      'church_first_interaction',
      'cafe_first_interaction',
      'walkman_receive',
      'arcade_intro_game',
      'cottage_enter',
      'first_message_delivery',
      'open_first_message',
      'farm_first_interaction',
      'museum_key_check',
      'hall_artifact_view',
    ]) {
      await acknowledgeInteraction(ctx, step);
    }
    const finished = await acknowledgeInteraction(ctx, 'map_receive');
    expect(finished.phase).toBe('free');
    const flag = (await gateway.readTab('04_ADMIN_FLAGS', { bypass: true })).rows.find(
      (r) => r.primaryKeyValue === 'force_first_journey',
    )!;
    expect(flag.raw.value).toBe('0');
    const after = (await gateway.readTab('24_PLAYER_PROGRESS', { bypass: true })).rows.find(
      (r) => r.primaryKeyValue === `${WORLD_USER}|first_journey`,
    )!;
    expect(after.raw.completed_at).toBe(completedAt);
    const keysAfter = (await getPlayerKeys(gateway, ctx.userId))
      .map((k) => [k.keyTypeId, k.quantityFound])
      .sort();
    expect(keysAfter).toEqual(keysBefore);
  });

  it('a forced replay can be skipped once, consuming the flag', async () => {
    const gateway = worldGateway(build());
    const ctx = worldCtx(gateway);
    await unlockThrough(ctx, 'beat_17_map_unlock');
    await acknowledgeInteraction(ctx, 'map_receive');
    await gateway.updateByPrimaryKey('04_ADMIN_FLAGS', 'force_first_journey', { value: '1' });
    const { chooseReplay } = await import('../src/world/journey.js');
    const skipped = await chooseReplay(ctx, 'skip');
    expect(skipped.phase).toBe('free');
    expect((await getJourneyState(ctx)).forced).toBe(false);
  });
});

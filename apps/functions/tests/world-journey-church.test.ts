import { describe, expect, it, vi } from 'vitest';
import { row } from '@veoullas-world/test-fixtures';
import { acknowledgeInteraction, getJourneyState, syncJourney } from '../src/world/journey.js';
import {
  addCandle,
  answerQuiz,
  enterChurch,
  getChurchState,
  extinguishCandle,
  lightCandle,
  openStory,
  removeCandle,
} from '../src/world/church.js';
import { getPlayerKeys } from '../src/services/player-keys.service.js';
import {
  addChurchContent,
  appendRows,
  buildWorldWorkbook,
  completePhase1,
  WORLD_NOW,
  worldCtx,
  worldGateway,
} from './helpers/world-fixture.js';

async function churchReady() {
  const gateway = worldGateway(buildWorldWorkbook(addChurchContent));
  await completePhase1(gateway);
  return { gateway, ctx: worldCtx(gateway) };
}

describe('first journey state', () => {
  it('shows approved Arabic-only Church content and accepts its quiz answer in another locale', async () => {
    const workbook = buildWorldWorkbook(addChurchContent);
    for (const tab of ['30_CHURCH_CONTENT', '31_CHURCH_QUIZ']) {
      const table = workbook[tab]!;
      const locale = table[0]!.indexOf('locale');
      for (const r of table.slice(1)) r[locale] = 'ar-EG';
    }
    const gateway = worldGateway(workbook);
    await completePhase1(gateway);
    const ctx = worldCtx(gateway);
    const state = await getChurchState(ctx, 'it');
    expect(state.verse?.direction).toBe('rtl');
    expect(state.story?.locale).toBe('ar-EG');
    expect(state.quiz.questions).toHaveLength(1);
    expect(state.quiz.questions[0]?.direction).toBe('rtl');
    expect(state.hymns).toEqual([]);
    expect(state.gospelReadingAudioRef).toBeNull();
    expect((await answerQuiz(ctx, 'q1', 'b', 'it')).correct).toBe(true);
  });
  it('starts a brand-new player at the Gate beats, with only Beach-and-earlier locations open', async () => {
    const gateway = worldGateway();
    const state = await getJourneyState(worldCtx(gateway));
    expect(state.phase).toBe('original');
    expect(state.currentBeat?.beatId).toBe('beat_02_gate');
    expect(state.accessibleLocations).not.toContain('church');
    expect(state.completed).toBe(false);
  });

  it('treats the Phase-1 Gate/naming flow as done and opens exactly the Church next', async () => {
    const { ctx } = await churchReady();
    const state = await getJourneyState(ctx);
    expect(state.currentBeat?.beatId).toBe('beat_07_church');
    expect(state.accessibleLocations).toEqual(expect.arrayContaining(['beach', 'church']));
    expect(state.accessibleLocations).not.toContain('cafe');
    expect(state.walkmanUnlocked).toBe(false);
  });

  it('refuses to acknowledge a step that is not the current one (no skipping ahead)', async () => {
    const { ctx } = await churchReady();
    await expect(acknowledgeInteraction(ctx, 'map_receive')).rejects.toMatchObject({
      code: 'WORLD_INVALID_STATE',
    });
    await expect(acknowledgeInteraction(ctx, 'church_first_interaction')).rejects.toMatchObject({
      code: 'WORLD_INVALID_STATE',
    });
  });

  it('never advances from client claims alone: syncing without the candle keeps the Church beat current', async () => {
    const { ctx } = await churchReady();
    const state = await syncJourney(ctx);
    expect(state.currentBeat?.beatId).toBe('beat_07_church');
  });
});

describe('Church (M08)', () => {
  it('rejects entry before the journey reaches the Church', async () => {
    const gateway = worldGateway(buildWorldWorkbook(addChurchContent));
    await expect(enterChurch(worldCtx(gateway), 'en')).rejects.toMatchObject({
      code: 'WORLD_LOCKED',
    });
  });

  it('shows only approved, complete dated content, in the requested locale with its direction', async () => {
    const { ctx } = await churchReady();
    const en = await enterChurch(ctx, 'en');
    expect(en.verse?.text).toBe('Fixture verse text');
    expect(en.verse?.reference).toBe('TEST 1:1');
    expect(en.story?.contentId).toBe('story_1');
    const ar = await getChurchState(ctx, 'ar-EG');
    expect(ar.verse?.direction).toBe('rtl');
    expect(ar.verse?.locale).toBe('ar-EG');
    // A locale with no approved row falls back to the English row and says so.
    const fr = await getChurchState(ctx, 'fr');
    expect(fr.verse?.locale).toBe('en');
    // Unapproved rows never surface anywhere.
    expect(JSON.stringify(en)).not.toContain('Should never show');
    expect(JSON.stringify(en)).not.toContain('Unapproved');
  });

  it('shows nothing (not placeholders) when only <PLACEHOLDER> or unreviewed rows exist', async () => {
    const gateway = worldGateway(
      buildWorldWorkbook((wb) => {
        appendRows(wb, '30_CHURCH_CONTENT', [
          row('30_CHURCH_CONTENT', {
            content_row_id: 'v_en',
            content_id: 'v',
            content_type: 'verse',
            active_date: '2026-09-26',
            locale: 'en',
            text: '<REVIEWED VERSE TEXT>',
            bible_reference: '<REFERENCE>',
            review_status: 'pending_review',
            enabled: 'FALSE',
          }),
        ]);
      }),
    );
    await completePhase1(gateway);
    const state = await getChurchState(worldCtx(gateway), 'en');
    expect(state.verse).toBeNull();
    expect(state.quiz.questions).toHaveLength(0);
  });

  it('never sends the correct answer to the browser before an answer is submitted', async () => {
    const { ctx } = await churchReady();
    const state = await getChurchState(ctx, 'en');
    expect(state.quiz.questions).toHaveLength(1);
    expect(state.quiz.questions[0]!.options.map((o) => o.id)).toEqual(['a', 'b', 'c']);
    expect(JSON.stringify(state)).not.toMatch(/correct/i);
    expect(JSON.stringify(state)).not.toContain('Because');
  });

  it('lights the first candle: awards the candle key once, advances the journey, and replays cannot duplicate it', async () => {
    const { ctx, gateway } = await churchReady();
    await enterChurch(ctx, 'en');
    const first = await lightCandle(ctx, 'candle_1', 'en');
    expect(first.rewards).toEqual([
      expect.objectContaining({ keyTypeId: 'key_candle', applied: true, reason: 'awarded' }),
    ]);
    expect(first.candles.lit).toEqual(['candle_1']);
    expect((await getJourneyState(ctx)).currentBeat?.beatId).toBe('beat_08_cafe');

    const again = await lightCandle(ctx, 'candle_1', 'en');
    expect(again.rewards).toEqual([]);
    const second = await lightCandle(ctx, 'candle_2', 'en');
    expect(second.rewards).toEqual([]);
    const keys = await getPlayerKeys(gateway, ctx.userId);
    expect(keys.find((k) => k.keyTypeId === 'key_candle')?.quantityAvailable).toBe(1);
  });

  for (const failAt of ['key', 'receipt'])
    it(`recovers after the saved candle/beat but failed ${failAt} write without double rewards`, async () => {
      const { ctx, gateway } = await churchReady();
      await enterChurch(ctx, 'en');
      const append = gateway.appendRow.bind(gateway);
      let failed = false;
      vi.spyOn(gateway, 'appendRow').mockImplementation(async (tab, values, known) => {
        if (
          !failed &&
          (failAt === 'key'
            ? tab === '25_PLAYER_KEYS'
            : tab === '37_CHARACTER_STATE' && values.character_id === 'world_rewards')
        ) {
          failed = true;
          throw Error('Injected storage failure after candle persisted');
        }
        return append(tab, values, known);
      });
      await expect(lightCandle(ctx, 'candle_1', 'en')).rejects.toThrow('Injected');
      expect((await getChurchState(ctx, 'en', true)).candles.lit).toContain('candle_1');
      await lightCandle(ctx, 'candle_1', 'en');
      await lightCandle(ctx, 'candle_1', 'en');
      expect(
        (await getPlayerKeys(gateway, ctx.userId)).find((k) => k.keyTypeId === 'key_candle')
          ?.quantityAvailable,
      ).toBe(1);
      vi.restoreAllMocks();
    });

  it('extinguishes a lit candle, keeps the key from being paid twice, and is a no-op when already dark', async () => {
    const { ctx, gateway } = await churchReady();
    await enterChurch(ctx, 'en');
    await lightCandle(ctx, 'candle_1', 'en');
    const out = await extinguishCandle(ctx, 'candle_1', 'en');
    expect(out.candles.lit).toEqual([]);
    expect(out.rewards).toEqual([]);
    expect(out.firstInteractionDone).toBe(true);
    expect((await extinguishCandle(ctx, 'candle_1', 'en')).candles.lit).toEqual([]);
    // Lighting again is allowed but never pays a second key.
    const relit = await lightCandle(ctx, 'candle_1', 'en');
    expect(relit.candles.lit).toEqual(['candle_1']);
    expect(relit.rewards).toEqual([]);
    await extinguishCandle(ctx, 'candle_1', 'en');
    await lightCandle(ctx, 'candle_1', 'en');
    const keys = await getPlayerKeys(gateway, ctx.userId);
    expect(keys.find((k) => k.keyTypeId === 'key_candle')?.quantityAvailable).toBe(1);
    await expect(extinguishCandle(ctx, 'evil', 'en')).rejects.toMatchObject({
      code: 'invalid_request',
    });
  });

  it('rejects an unknown candle id', async () => {
    const { ctx } = await churchReady();
    await expect(lightCandle(ctx, 'candle_99', 'en')).rejects.toMatchObject({
      code: 'invalid_request',
    });
    await expect(lightCandle(ctx, 'evil', 'en')).rejects.toMatchObject({ code: 'invalid_request' });
  });

  it('resets ordinary candles each day but keeps occasion candles lit', async () => {
    const gateway = worldGateway(
      buildWorldWorkbook((wb) => {
        addChurchContent(wb);
        appendRows(wb, '30_CHURCH_CONTENT', [
          row('30_CHURCH_CONTENT', {
            content_row_id: 'occ_en',
            content_id: 'occ',
            content_type: 'candle_occasion',
            active_date: '2026-09-26',
            locale: 'en',
            enabled: 'TRUE',
          }),
        ]);
      }),
    );
    await completePhase1(gateway);
    const dayOne = worldCtx(gateway);
    await lightCandle(dayOne, 'candle_1', 'en');
    const preservedDay = await getChurchState(dayOne, 'en');
    expect(preservedDay.candles.preserved).toEqual(['candle_1']);

    // Next day, the occasion is over: light an ordinary candle, then look again the day after.
    const dayTwo = worldCtx(gateway, { now: new Date(WORLD_NOW.getTime() + 24 * 3600_000) });
    await lightCandle(dayTwo, 'candle_2', 'en');
    const two = await getChurchState(dayTwo, 'en');
    expect(two.candles.lit.sort()).toEqual(['candle_1', 'candle_2']);
    const dayThree = worldCtx(gateway, { now: new Date(WORLD_NOW.getTime() + 48 * 3600_000) });
    const three = await getChurchState(dayThree, 'en');
    expect(three.candles.lit).toEqual(['candle_1']);
  });

  it('opens the daily story into a permanent gallery, idempotently', async () => {
    const { ctx } = await churchReady();
    await openStory(ctx, 'story_1', 'en');
    const twice = await openStory(ctx, 'story_1', 'en');
    expect(twice.gallery.map((g) => g.contentId)).toEqual(['story_1']);
    await expect(openStory(ctx, 'nope', 'en')).rejects.toMatchObject({ code: 'not_found' });
    // Still in the gallery on a later day.
    const later = worldCtx(ctx.gateway, { now: new Date(WORLD_NOW.getTime() + 72 * 3600_000) });
    expect((await getChurchState(later, 'en')).gallery).toHaveLength(1);
  });

  it('a wrong quiz answer explains and permits another attempt; a perfect run unlocks the perfect achievement once', async () => {
    const { ctx } = await churchReady();
    const wrong = await answerQuiz(ctx, 'q1', 'a', 'en');
    expect(wrong.correct).toBe(false);
    expect(wrong.explanation).toBe('Because en');
    expect(wrong.reference).toBe('TEST 2:2');
    expect(wrong.completed).toBe(false);
    const right = await answerQuiz(ctx, 'q1', 'b', 'en');
    expect(right.correct).toBe(true);
    expect(right.completed).toBe(true);
    expect(right.perfect).toBe(false);
    expect(right.state.achievements?.map((a) => a.achievementId)).toEqual(['ach_quiz_first']);
    // Answering again after completion changes nothing and re-awards nothing.
    const again = await answerQuiz(ctx, 'q1', 'b', 'en');
    expect(again.state.achievements ?? []).toEqual([]);
  });

  it('a first-try correct run is perfect and unlocks the perfect achievement', async () => {
    const { ctx } = await churchReady();
    const right = await answerQuiz(ctx, 'q1', 'B', 'en');
    expect(right.perfect).toBe(true);
    expect(right.state.achievements?.map((a) => a.achievementId).sort()).toEqual([
      'ach_quiz_first',
      'ach_quiz_perfect',
    ]);
  });

  it('checks quiz answers in every locale using the localized row for the explanation', async () => {
    const { ctx } = await churchReady();
    const result = await answerQuiz(ctx, 'q1', 'a', 'ar-EG');
    expect(result.explanation).toBe('Because ar-EG');
  });
});

describe('Candle arrangement — Add / Remove (church candle patch)', () => {
  it('keeps the original 6 slots exactly as before until the player customizes the tray', async () => {
    const { ctx } = await churchReady();
    const state = await getChurchState(ctx, 'en');
    expect(state.candles.slots).toEqual([
      'candle_1',
      'candle_2',
      'candle_3',
      'candle_4',
      'candle_5',
      'candle_6',
    ]);
    expect(state.candles.capacity).toBe(10); // 6 starting slots + the 4-candle Add headroom
  });

  it('adds one new, initially-unlit candle to a free position, never awarding anything by itself', async () => {
    const { ctx } = await churchReady();
    const before = await getChurchState(ctx, 'en');
    const after = await addCandle(ctx, 'req-1', 'en');
    expect(after.candles.slots).toHaveLength(before.candles.slots.length + 1);
    const newId = after.candles.slots.find((id) => !before.candles.slots.includes(id))!;
    expect(newId).toMatch(/^candle_a\d+$/);
    expect(after.candles.lit).not.toContain(newId);
    expect(after.rewards).toEqual([]);
    // The added candle behaves exactly like the verified toggle action.
    const lit = await lightCandle(ctx, newId, 'en');
    expect(lit.candles.lit).toContain(newId);
  });

  it('is idempotent: replaying the same Add request id never creates a second candle', async () => {
    const { ctx } = await churchReady();
    const first = await addCandle(ctx, 'same-request', 'en');
    const second = await addCandle(ctx, 'same-request', 'en');
    expect(second.candles.slots).toEqual(first.candles.slots);
    // A genuinely new request id does add a second candle.
    const third = await addCandle(ctx, 'different-request', 'en');
    expect(third.candles.slots.length).toBe(first.candles.slots.length + 1);
  });

  it('refuses to add past capacity (the configured starting count plus the Add headroom) and reports the tray as full', async () => {
    const gateway = worldGateway(
      buildWorldWorkbook((wb) => {
        addChurchContent(wb);
        appendRows(wb, '01_APP_CONFIG', [
          row('01_APP_CONFIG', { config_key: 'church_candle_slots', value: '2', enabled: 'TRUE' }),
        ]);
      }),
    );
    await completePhase1(gateway);
    const ctx = worldCtx(gateway);
    await enterChurch(ctx, 'en');
    const start = await getChurchState(ctx, 'en');
    expect(start.candles.slots).toEqual(['candle_1', 'candle_2']);
    expect(start.candles.capacity).toBe(6); // 2 starting slots + the 4-candle headroom
    let last = start;
    for (let i = 0; i < 4; i++) {
      last = await addCandle(ctx, `req-${i}`, 'en');
    }
    expect(last.candles.slots).toHaveLength(6);
    await expect(addCandle(ctx, 'req-over', 'en')).rejects.toMatchObject({
      code: 'invalid_request',
    });
    // Removing one frees a position again.
    await removeCandle(ctx, 'candle_1', 'en');
    const after = await addCandle(ctx, 'req-again', 'en');
    expect(after.candles.slots).toHaveLength(6);
  });

  it('removes a candle (including a lit one) without touching reward or occasion history, and is idempotent', async () => {
    const gateway = worldGateway(
      buildWorldWorkbook((wb) => {
        addChurchContent(wb);
        appendRows(wb, '30_CHURCH_CONTENT', [
          row('30_CHURCH_CONTENT', {
            content_row_id: 'occ_en',
            content_id: 'occ',
            content_type: 'candle_occasion',
            active_date: '2026-09-26',
            locale: 'en',
            enabled: 'TRUE',
          }),
        ]);
      }),
    );
    await completePhase1(gateway);
    const ctx = worldCtx(gateway);
    await enterChurch(ctx, 'en');
    await lightCandle(ctx, 'candle_2', 'en'); // an occasion day: candle_2 becomes permanently preserved
    const removed = await removeCandle(ctx, 'candle_2', 'en');
    expect(removed.candles.slots).not.toContain('candle_2');
    expect(removed.candles.lit).not.toContain('candle_2');
    expect(removed.rewards).toEqual([]);
    // Idempotent: removing it again changes nothing and never errors.
    const again = await removeCandle(ctx, 'candle_2', 'en');
    expect(again.candles.slots).toEqual(removed.candles.slots);
    // firstInteractionDone (the reward fact) survives the removal.
    expect(removed.firstInteractionDone).toBe(true);
    const keys = await getPlayerKeys(gateway, ctx.userId);
    expect(keys.find((k) => k.keyTypeId === 'key_candle')?.quantityAvailable).toBe(1);
  });

  it('a remove-then-add-then-light cycle can never pay the key a second time', async () => {
    const { ctx, gateway } = await churchReady();
    await enterChurch(ctx, 'en');
    await lightCandle(ctx, 'candle_1', 'en');
    await removeCandle(ctx, 'candle_1', 'en');
    const added = await addCandle(ctx, 'req-1', 'en');
    const newId = added.candles.slots.find((id) => id.startsWith('candle_a'))!;
    const relit = await lightCandle(ctx, newId, 'en');
    expect(relit.rewards).toEqual([]);
    const keys = await getPlayerKeys(gateway, ctx.userId);
    expect(keys.find((k) => k.keyTypeId === 'key_candle')?.quantityAvailable).toBe(1);
  });

  it('rejects lighting or extinguishing a candle that has been removed', async () => {
    const { ctx } = await churchReady();
    await enterChurch(ctx, 'en');
    await removeCandle(ctx, 'candle_3', 'en');
    await expect(lightCandle(ctx, 'candle_3', 'en')).rejects.toMatchObject({
      code: 'invalid_request',
    });
    await expect(extinguishCandle(ctx, 'candle_3', 'en')).rejects.toMatchObject({
      code: 'invalid_request',
    });
  });

  it('rejects a malformed candle id on add/remove the same way as light/extinguish', async () => {
    const { ctx } = await churchReady();
    await enterChurch(ctx, 'en');
    await expect(removeCandle(ctx, 'evil', 'en')).rejects.toMatchObject({
      code: 'invalid_request',
    });
  });

  it('keeps each player’s tray arrangement completely separate', async () => {
    const gateway = worldGateway(buildWorldWorkbook(addChurchContent));
    await completePhase1(gateway, 'player_a');
    await completePhase1(gateway, 'player_b');
    const a = worldCtx(gateway, { userId: 'player_a' });
    const b = worldCtx(gateway, { userId: 'player_b' });
    await enterChurch(a, 'en');
    await enterChurch(b, 'en');
    await removeCandle(a, 'candle_1', 'en');
    const addedForA = await addCandle(a, 'req-a', 'en');
    const stateB = await getChurchState(b, 'en');

    expect(addedForA.candles.slots).not.toContain('candle_1');
    expect(stateB.candles.slots).toEqual([
      'candle_1',
      'candle_2',
      'candle_3',
      'candle_4',
      'candle_5',
      'candle_6',
    ]);
    expect(stateB.candles.slots.some((id) => id.startsWith('candle_a'))).toBe(false);
  });

  it('a read-only visit (getChurchState) never creates or changes the arrangement', async () => {
    const { ctx } = await churchReady();
    await getChurchState(ctx, 'en');
    await getChurchState(ctx, 'en');
    const state = await getChurchState(ctx, 'en');
    expect(state.candles.slots).toHaveLength(6);
  });
});

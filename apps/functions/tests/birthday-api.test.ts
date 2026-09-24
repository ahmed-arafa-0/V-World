import { describe, expect, it } from 'vitest';
import { headerFor } from '@veoullas-world/test-fixtures';
import {
  acceptInvitation,
  claimGifts,
  completeCelebration,
  dismissInvitation,
  extinguishCandle,
  getBirthdayState,
  saveWish,
} from '../src/world/birthday.js';
import { getJourneyState } from '../src/world/journey.js';
import {
  addBirthdayFixtures,
  addCompanionCat,
  buildWorldWorkbook,
  WORLD_USER,
  worldCtx,
  worldGateway,
} from './helpers/world-fixture.js';

const TARGET = '2026-09-25T21:00:00.000Z';
const END = '2026-09-27T21:00:00.000Z';
const BEFORE = new Date('2026-09-25T20:59:00.000Z');
const COUNTDOWN = new Date('2026-09-25T20:59:50.000Z');
const AT_BOUNDARY = new Date(TARGET);
const LIVE = new Date('2026-09-26T10:00:00.000Z');
const AFTER = new Date('2026-09-27T21:00:01.000Z');

function birthdayWorkbook(customize?: (wb: ReturnType<typeof buildWorldWorkbook>) => void) {
  return buildWorldWorkbook((wb) => {
    addBirthdayFixtures(wb);
    customize?.(wb);
  });
}

describe('birthday_2026 — window computation', () => {
  it.each([
    ['before', BEFORE, 'before'],
    ['final 20s (countdown)', COUNTDOWN, 'countdown'],
    ['exact boundary', AT_BOUNDARY, 'live'],
    ['mid-celebration', LIVE, 'live'],
    ['after end_at', AFTER, 'after'],
  ] as const)('%s -> window %s', async (_label, now, expected) => {
    const g = worldGateway(birthdayWorkbook());
    const state = await getBirthdayState(worldCtx(g, { now }), 'en');
    expect(state.enabled).toBe(true);
    expect(state.window).toBe(expected);
    expect(state.serverNow).toBe(now.toISOString());
    expect(state.targetAt).toBe(TARGET);
    expect(state.endAt).toBe(END);
  });

  it('disabled when the event row is missing or disabled — the overlay never renders', async () => {
    const g1 = worldGateway(birthdayWorkbook((wb) => (wb['17_EVENTS'] = [headerFor('17_EVENTS')])));
    expect((await getBirthdayState(worldCtx(g1, { now: LIVE }), 'en')).enabled).toBe(false);

    const g2 = worldGateway(
      birthdayWorkbook((wb) => {
        const header = wb['17_EVENTS']![0]!;
        const enabledCol = header.indexOf('enabled');
        for (const r of wb['17_EVENTS']!.slice(1)) r[enabledCol] = 'FALSE';
      }),
    );
    expect((await getBirthdayState(worldCtx(g2, { now: LIVE }), 'en')).enabled).toBe(false);
  });

  it('never produces a negative window regardless of how far now is from the target', async () => {
    const g = worldGateway(birthdayWorkbook());
    const farFuture = new Date('2030-01-01T00:00:00.000Z');
    const state = await getBirthdayState(worldCtx(g, { now: farFuture }), 'en');
    expect(state.window).toBe('after');
  });
});

describe('birthday_2026 — Sheets-serial date regression (M16 live-config fix)', () => {
  // Mirrors packages/sheet-schema/src/normalize.ts's own epoch/day-length constants so a serial
  // written here round-trips through the real normalizeDate() the same way a real un-formatted
  // Sheets date cell would.
  const GOOGLE_SHEETS_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  function serialFor(iso: string): string {
    return String((new Date(iso).getTime() - GOOGLE_SHEETS_EPOCH_UTC_MS) / MS_PER_DAY);
  }

  it('a bare Sheets date serial (no date format applied to the cell) is read as the real date, never misread as a year by Date.parse', async () => {
    const g = worldGateway(
      birthdayWorkbook((wb) => {
        const header = wb['17_EVENTS']![0]!;
        const targetCol = header.indexOf('target_at');
        const endCol = header.indexOf('end_at');
        for (const r of wb['17_EVENTS']!.slice(1)) {
          r[targetCol] = serialFor(TARGET);
          r[endCol] = serialFor(END);
        }
      }),
    );
    const before = await getBirthdayState(worldCtx(g, { now: BEFORE }), 'en');
    expect(before.enabled).toBe(true);
    expect(before.targetAt).toBe(TARGET);
    expect(before.endAt).toBe(END);
    expect(before.window).toBe('before');

    expect((await getBirthdayState(worldCtx(g, { now: LIVE }), 'en')).window).toBe('live');
    expect((await getBirthdayState(worldCtx(g, { now: AFTER }), 'en')).window).toBe('after');
  });

  it('an unparseable target_at is rejected explicitly — the event is disabled, never guessed as a bogus far-future date', async () => {
    const g = worldGateway(
      birthdayWorkbook((wb) => {
        const header = wb['17_EVENTS']![0]!;
        const targetCol = header.indexOf('target_at');
        for (const r of wb['17_EVENTS']!.slice(1)) r[targetCol] = 'not-a-date';
      }),
    );
    expect((await getBirthdayState(worldCtx(g, { now: LIVE }), 'en')).enabled).toBe(false);
  });

  it('the corrected end date (28 September 2026 00:00 Africa/Cairo = 2026-09-27T21:00:00.000Z) closes the window exactly at that instant', async () => {
    const g = worldGateway(birthdayWorkbook());
    const justBefore = await getBirthdayState(
      worldCtx(g, { now: new Date('2026-09-27T20:59:59.999Z') }),
      'en',
    );
    const atBoundary = await getBirthdayState(worldCtx(g, { now: new Date(END) }), 'en');
    expect(justBefore.window).toBe('live');
    expect(atBoundary.window).toBe('after');
  });
});

describe('birthday_2026 — invitation, wish, candle: idempotent, retry-safe', () => {
  it('Later (dismiss) always succeeds and is safe to repeat', async () => {
    const g = worldGateway(birthdayWorkbook());
    const ctx = worldCtx(g, { now: COUNTDOWN });
    const first = await dismissInvitation(ctx, 'en');
    const second = await dismissInvitation(worldCtx(g, { now: LIVE }), 'en');
    expect(first.stage.dismissedAt).toBeTruthy();
    expect(second.stage.dismissedAt).not.toBe(first.stage.dismissedAt);
  });

  it('Celebrate now records acceptance without side effects on journey/progress', async () => {
    const g = worldGateway(birthdayWorkbook());
    const before = await getJourneyState(worldCtx(g, { now: LIVE }));
    const state = await acceptInvitation(worldCtx(g, { now: COUNTDOWN }), 'en');
    const after = await getJourneyState(worldCtx(g, { now: LIVE }));
    expect(state.stage.acceptedAt).toBeTruthy();
    expect(after.completed).toBe(before.completed);
    expect(after.phase).toBe(before.phase);
    expect(after.accessibleLocations).toEqual(before.accessibleLocations);
  });

  it('a private wish is saved, never required, and Skip is a distinct, equally valid choice', async () => {
    const g = worldGateway(birthdayWorkbook());
    const skipped = await saveWish(worldCtx(g, { now: LIVE }), 'en', { skip: true });
    expect(skipped.stage.wishSkippedAt).toBeTruthy();
    expect(skipped.stage.wish).toBe('');

    const written = await saveWish(worldCtx(g, { now: LIVE }), 'en', { text: 'my secret wish' });
    expect(written.stage.wish).toBe('my secret wish');
    // Writing after skipping clears the skip marker (the two are mutually exclusive states).
    expect(written.stage.wishSkippedAt).toBe('');
  });

  it('the wish is never written to the entry log or any other tab', async () => {
    const g = worldGateway(birthdayWorkbook());
    const logsBefore = (await g.readTab('05_ENTRY_LOGS')).rows.length;
    await saveWish(worldCtx(g, { now: LIVE }), 'en', { text: 'a very private wish' });
    const logsAfter = (await g.readTab('05_ENTRY_LOGS')).rows.length;
    expect(logsAfter).toBe(logsBefore);
  });

  it('extinguishing the candle is idempotent — repeating it never errors or duplicates state', async () => {
    const g = worldGateway(birthdayWorkbook());
    const ctx = worldCtx(g, { now: LIVE });
    const first = await extinguishCandle(ctx, 'en');
    const second = await extinguishCandle(ctx, 'en');
    expect(first.stage.candleExtinguished).toBe(true);
    expect(second.stage.candleExtinguished).toBe(true);
  });
});

describe('birthday_2026 — gifts: letter, achievement, decoration (no key), idempotent', () => {
  it('claiming gifts unlocks the achievement exactly once and grants no progression key', async () => {
    const g = worldGateway(birthdayWorkbook());
    const ctx = worldCtx(g, { now: LIVE });
    const keysBefore = (await g.readTab('25_PLAYER_KEYS')).rows.filter(
      (r) => r.raw.user_id === WORLD_USER,
    ).length;

    const first = await claimGifts(ctx, 'en');
    expect(first.stage.giftsClaimed).toBe(true);
    expect(first.achievement?.unlocked).toBe(true);
    expect(first.achievement?.title).toBe('Happy Birthday, Veoulla!');

    const achievRows = (await g.readTab('26_PLAYER_ACHIEV')).rows.filter(
      (r) => r.raw.user_id === WORLD_USER && r.raw.achievement_id === 'birthday_2026_celebrated',
    );
    expect(achievRows).toHaveLength(1);

    // Retry (reload/backgrounding): no duplicate achievement row, no duplicate message row, no key ever.
    const second = await claimGifts(ctx, 'en');
    expect(second.stage.giftsClaimed).toBe(true);
    const achievRowsAfterRetry = (await g.readTab('26_PLAYER_ACHIEV')).rows.filter(
      (r) => r.raw.user_id === WORLD_USER && r.raw.achievement_id === 'birthday_2026_celebrated',
    );
    expect(achievRowsAfterRetry).toHaveLength(1);
    const messageRows = (await g.readTab('27_PLAYER_MESSAGES')).rows.filter(
      (r) => r.raw.user_id === WORLD_USER && r.raw.message_id === 'msg_birthday_2026',
    );
    expect(messageRows).toHaveLength(1);
    expect(messageRows[0]!.raw.gift_claimed).toBe('TRUE');
    const keysAfter = (await g.readTab('25_PLAYER_KEYS')).rows.filter(
      (r) => r.raw.user_id === WORLD_USER,
    ).length;
    expect(keysAfter).toBe(keysBefore);
  });

  it('the achievement is secret: hidden before unlock, revealed only after claiming', async () => {
    const g = worldGateway(birthdayWorkbook());
    const before = await getBirthdayState(worldCtx(g, { now: LIVE }), 'en');
    expect(before.achievement?.unlocked).toBe(false);
    expect(before.achievement?.title).toBe('');
    expect(before.achievement?.description).toBe('');

    await claimGifts(worldCtx(g, { now: LIVE }), 'en');
    const after = await getBirthdayState(worldCtx(g, { now: LIVE }), 'en');
    expect(after.achievement?.unlocked).toBe(true);
    expect(after.achievement?.title).toBe('Happy Birthday, Veoulla!');
  });

  it('resolves the letter per locale with correct RTL/LTR, and Arabic is the authored source text', async () => {
    const g = worldGateway(birthdayWorkbook());
    const en = await getBirthdayState(worldCtx(g, { now: LIVE }), 'en');
    const ar = await getBirthdayState(worldCtx(g, { now: LIVE }), 'ar-EG');
    expect(en.letter?.direction).toBe('ltr');
    expect(en.letter?.contentPending).toBe(false);
    expect(en.letter?.text).toContain('Ahmed');
    expect(ar.letter?.direction).toBe('rtl');
    expect(ar.letter?.text).toContain(
      'كل سنة وإنتِ طيبة يا بروفسيرة دكتورة بشمهندسة الآنسة الجميلة فيولا',
    );
  });

  it('the letter is null when the event is disabled — never partially exposed', async () => {
    const g = worldGateway(
      birthdayWorkbook((wb) => {
        const header = wb['17_EVENTS']![0]!;
        const enabledCol = header.indexOf('enabled');
        for (const r of wb['17_EVENTS']!.slice(1)) r[enabledCol] = 'FALSE';
      }),
    );
    const state = await getBirthdayState(worldCtx(g, { now: LIVE }), 'en');
    expect(state.letter).toBeNull();
  });

  it('reflects the chosen cat name/gender exactly as stored', async () => {
    const g = worldGateway(birthdayWorkbook((wb) => addCompanionCat(wb, 'Mango', 'female')));
    const state = await getBirthdayState(worldCtx(g, { now: LIVE }), 'en');
    expect(state.cat).toEqual({ name: 'Mango', gender: 'female' });
  });
});

describe('birthday_2026 — completion: first time vs. replay', () => {
  it('the first completion stamps completedAt once; a retry of it never increments replayCount', async () => {
    const g = worldGateway(birthdayWorkbook());
    const ctx = worldCtx(g, { now: LIVE });
    const first = await completeCelebration(ctx, 'en');
    expect(first.stage.completedAt).toBeTruthy();
    expect(first.stage.replayCount).toBe(0);

    // A retried/duplicated request for the SAME (first-run) completion — no replayOperationId, just
    // like the ordinary flow always sends — must never increment anything.
    const retried = await completeCelebration(worldCtx(g, { now: AFTER }), 'en');
    expect(retried.stage.completedAt).toBe(first.stage.completedAt);
    expect(retried.stage.replayCount).toBe(0);
    const retriedAgain = await completeCelebration(worldCtx(g, { now: AFTER }), 'en');
    expect(retriedAgain.stage.replayCount).toBe(0);
  });

  it('only a distinct replayOperationId counts as a replay; retrying the same one never double-counts', async () => {
    const g = worldGateway(birthdayWorkbook());
    await completeCelebration(worldCtx(g, { now: LIVE }), 'en');

    const replayed = await completeCelebration(worldCtx(g, { now: AFTER }), 'en', 'op-1');
    expect(replayed.stage.replayCount).toBe(1);
    // A network retry of the SAME click resends the same operation id — no second increment.
    const retriedSameOp = await completeCelebration(worldCtx(g, { now: AFTER }), 'en', 'op-1');
    expect(retriedSameOp.stage.replayCount).toBe(1);
    // Concurrent duplicate requests for the same op id, each its own ctx/mutex (as separate server
    // instances would be): `mutateWorldDoc`'s optimistic read-check-write retry still serializes
    // them against the shared Sheet cell, so the second to land observes the first one's stored id.
    const [concurrentA, concurrentB] = await Promise.all([
      completeCelebration(worldCtx(g, { now: AFTER }), 'en', 'op-1'),
      completeCelebration(worldCtx(g, { now: AFTER }), 'en', 'op-1'),
    ]);
    expect(concurrentA.stage.replayCount).toBe(1);
    expect(concurrentB.stage.replayCount).toBe(1);

    // A genuinely new replay (a fresh id, as a new "replay celebration" click mints) counts once more.
    const replayedAgain = await completeCelebration(worldCtx(g, { now: AFTER }), 'en', 'op-2');
    expect(replayedAgain.stage.replayCount).toBe(2);
  });

  it('a replay after the event window never grants a second achievement or key', async () => {
    const g = worldGateway(birthdayWorkbook());
    await claimGifts(worldCtx(g, { now: LIVE }), 'en');
    await completeCelebration(worldCtx(g, { now: LIVE }), 'en');
    // Arrives again well after end_at and replays the whole sequence.
    await claimGifts(worldCtx(g, { now: AFTER }), 'en');
    const replayState = await completeCelebration(worldCtx(g, { now: AFTER }), 'en', 'op-1');
    expect(replayState.stage.replayCount).toBe(1);
    const achievRows = (await g.readTab('26_PLAYER_ACHIEV')).rows.filter(
      (r) => r.raw.user_id === WORLD_USER && r.raw.achievement_id === 'birthday_2026_celebrated',
    );
    expect(achievRows).toHaveLength(1);
  });
});

describe('birthday_2026 — accessible regardless of first-journey progress', () => {
  it('the full flow works even with the first journey not started, and never advances it', async () => {
    const g = worldGateway(birthdayWorkbook());
    const journeyBefore = await getJourneyState(worldCtx(g, { now: LIVE }));
    expect(journeyBefore.completed).toBe(false);

    await acceptInvitation(worldCtx(g, { now: COUNTDOWN }), 'en');
    await saveWish(worldCtx(g, { now: LIVE }), 'en', { skip: true });
    await extinguishCandle(worldCtx(g, { now: LIVE }), 'en');
    await claimGifts(worldCtx(g, { now: LIVE }), 'en');
    const finalState = await completeCelebration(worldCtx(g, { now: LIVE }), 'en');
    expect(finalState.stage.completedAt).toBeTruthy();

    const journeyAfter = await getJourneyState(worldCtx(g, { now: LIVE }));
    expect(journeyAfter.completed).toBe(false);
    expect(journeyAfter.beats).toEqual(journeyBefore.beats);
    expect(journeyAfter.accessibleLocations).toEqual(journeyBefore.accessibleLocations);
  });
});

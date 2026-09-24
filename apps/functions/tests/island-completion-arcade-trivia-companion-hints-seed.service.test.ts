import { describe, expect, it } from 'vitest';
import {
  buildArcadeTriviaRows,
  buildCompanionHintRows,
  seedArcadeTriviaQuestions,
  seedCompanionHints,
} from '../src/services/island-completion-arcade-trivia-companion-hints-seed.service.js';
import { buildWorldWorkbook, worldGateway } from './helpers/world-fixture.js';

describe('Island completion — Arcade Trivia + companion hints starter content', () => {
  it('builds one row per question per locale, all enabled and flagged pending_review', () => {
    const rows = buildArcadeTriviaRows();
    expect(rows.length % 5).toBe(0);
    expect(rows.every((r) => r.enabled === 'TRUE' && r.review_status === 'pending_review')).toBe(
      true,
    );
    expect(new Set(rows.map((r) => r.question_row_id)).size).toBe(rows.length);
  });

  it('never reuses a Church-quiz-shaped column (no bible_reference/achievement_id present)', () => {
    const rows = buildArcadeTriviaRows();
    for (const row of rows) {
      expect(row.bible_reference).toBeUndefined();
      expect(row.achievement_id).toBeUndefined();
      expect(row.key_reward_type_id).toBeUndefined();
    }
  });

  it('seeds the Trivia bank idempotently', async () => {
    const gateway = worldGateway(buildWorldWorkbook());
    const first = await seedArcadeTriviaQuestions(gateway);
    expect(first.created.length).toBe(buildArcadeTriviaRows().length);
    const second = await seedArcadeTriviaQuestions(gateway);
    expect(second.created).toEqual([]);
    expect(second.existing.length).toBe(first.created.length);
  });

  it('builds companion hints only for real story-beat ids, with the secret wing/Church never targeted', () => {
    const rows = buildCompanionHintRows();
    expect(rows.some((r) => r.location_id === 'church')).toBe(false);
    const pending = rows.filter((r) => r.condition_type === 'story_beat_pending');
    for (const row of pending) {
      expect(row.condition_value).toMatch(/^beat_\d\d_/);
    }
  });

  it('seeds companion hints idempotently, RTL set correctly for Arabic', async () => {
    const gateway = worldGateway(buildWorldWorkbook());
    const first = await seedCompanionHints(gateway);
    // GOOD_WORKBOOK's own fixture row (`hint_farm_plant_en`) intentionally matches this seed's own
    // primary key exactly, so it dedupes as "already there" rather than doubling.
    expect(first.created.length + first.existing.length).toBe(buildCompanionHintRows().length);
    const arRows = (await gateway.readTab('43_COMPANION_HINTS', { bypass: true })).rows.filter(
      (r) => r.raw.locale === 'ar-EG',
    );
    expect(arRows.length).toBeGreaterThan(0);
    expect(arRows.every((r) => r.raw.direction === 'rtl')).toBe(true);
    const second = await seedCompanionHints(gateway);
    expect(second.created).toEqual([]);
  });
});

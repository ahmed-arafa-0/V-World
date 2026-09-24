import { describe, expect, it } from 'vitest';
import { headerFor, row } from '@veoullas-world/test-fixtures';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';
import {
  CHURCH_STORY_PROPOSALS,
  applyChurchVerseReplacement,
  buildChurchStoryRows,
  planChurchVerseReplacement,
  seedChurchStoryProposals,
} from '../src/services/content-completion-v1-church-seed.service.js';

const input = {
  texts: {
    en: 'Come unto me, all ye that labour and are heavy laden, and I will give you rest.',
    'ar-EG': 'تعالوا إليّ يا جميع المتعبين والثقيلي الأحمال، وأنا أريحكم.',
  },
  bibleReference: 'Matthew 11:28',
  sourceUrlByLocale: {
    en: 'https://www.biblegateway.com/passage/?search=Matthew+11%3A28&version=KJV',
    'ar-EG': 'https://www.bible.com/ar/bible/13/MAT.11.AVD',
  },
};

function fixture(overrides: { textEn?: string; textAr?: string } = {}) {
  const rows = [
    headerFor('30_CHURCH_CONTENT'),
    row('30_CHURCH_CONTENT', {
      content_row_id: 'church_verse_001_en',
      content_id: 'church_verse_001',
      content_type: 'verse',
      active_date: '2026-09-26',
      locale: 'en',
      title: 'Birthday Verse',
      text: overrides.textEn ?? '<REVIEWED VERSE TEXT>',
      direction: 'ltr',
      bible_reference: '<REFERENCE>',
      source_url: '<APPROVED_SOURCE_URL>',
      review_status: 'pending_review',
      enabled: 'FALSE',
    }),
    row('30_CHURCH_CONTENT', {
      content_row_id: 'church_verse_001_ar',
      content_id: 'church_verse_001',
      content_type: 'verse',
      active_date: '2026-09-26',
      locale: 'ar-EG',
      title: 'آية عيد الميلاد',
      text: overrides.textAr ?? '<نص الآية بعد المراجعة>',
      direction: 'rtl',
      bible_reference: '<REFERENCE>',
      source_url: '<APPROVED_SOURCE_URL>',
      review_status: 'pending_review',
      enabled: 'FALSE',
    }),
  ];
  const client = new FakeGoogleSheetsClient({ '30_CHURCH_CONTENT': rows });
  const gateway = new SheetGateway(client);
  return { client, gateway };
}

describe('Content Completion v1 — church verse replacement', () => {
  it('replaces only the placeholder text/bible_reference/source_url cells, preserving title/active_date/review_status/enabled', async () => {
    const { client, gateway } = fixture();
    const raw = await client.getValues('30_CHURCH_CONTENT');
    const plan = planChurchVerseReplacement(await gateway.readTab('30_CHURCH_CONTENT'), raw, input);
    expect(plan.conflicts).toEqual([]);
    const changed = await applyChurchVerseReplacement(gateway, plan);
    expect(changed.sort()).toEqual(['church_verse_001_ar', 'church_verse_001_en']);

    const en = await gateway.findByPrimaryKey('30_CHURCH_CONTENT', 'church_verse_001_en', {
      bypass: true,
    });
    expect(en?.row.raw.text).toBe(input.texts.en);
    expect(en?.row.raw.bible_reference).toBe('Matthew 11:28');
    expect(en?.row.raw.title).toBe('Birthday Verse');
    expect(en?.row.raw.active_date).toBe('2026-09-26');
    expect(en?.row.raw.enabled).toBe('FALSE');
    expect(en?.row.raw.review_status).toBe('pending_review');
  });

  it('is a no-op rerun after applying (zero further writes)', async () => {
    const { client, gateway } = fixture();
    const raw = await client.getValues('30_CHURCH_CONTENT');
    await applyChurchVerseReplacement(
      gateway,
      planChurchVerseReplacement(await gateway.readTab('30_CHURCH_CONTENT'), raw, input),
    );
    const calls = client.callCounts.updateValues;
    const after = await client.getValues('30_CHURCH_CONTENT');
    const rerun = planChurchVerseReplacement(
      await gateway.readTab('30_CHURCH_CONTENT'),
      after,
      input,
    );
    expect(await applyChurchVerseReplacement(gateway, rerun)).toEqual([]);
    expect(client.callCounts.updateValues).toBe(calls);
  });

  it('flags a conflict instead of overwriting different nonblank authored text', async () => {
    const { client, gateway } = fixture({ textEn: 'Already authored, different verse text' });
    const raw = await client.getValues('30_CHURCH_CONTENT');
    const plan = planChurchVerseReplacement(await gateway.readTab('30_CHURCH_CONTENT'), raw, input);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]?.id).toBe('church_verse_001_en');
    await expect(applyChurchVerseReplacement(gateway, plan)).rejects.toThrow('conflicts');
  });
});

describe('Content Completion v1 — church stories', () => {
  it('proposes 3 stories, 5 locales each, all undated and disabled', () => {
    expect(CHURCH_STORY_PROPOSALS).toHaveLength(3);
    const rows = buildChurchStoryRows();
    expect(rows).toHaveLength(15);
    for (const r of rows) {
      expect(r.content_type).toBe('story');
      expect(r.active_date).toBe('');
      expect(r.enabled).toBe('FALSE');
      expect(r.image_asset_ids).toBe('');
    }
  });

  it('is idempotent and additive against an existing verse row', async () => {
    const { gateway } = fixture();
    const first = await seedChurchStoryProposals(gateway);
    expect(first.created).toHaveLength(15);
    const second = await seedChurchStoryProposals(gateway);
    expect(second.created).toEqual([]);
    expect(second.existing).toHaveLength(15);
    const verse = await gateway.findByPrimaryKey('30_CHURCH_CONTENT', 'church_verse_001_en', {
      bypass: true,
    });
    expect(verse?.row.raw.text).toBe('<REVIEWED VERSE TEXT>');
  });
});

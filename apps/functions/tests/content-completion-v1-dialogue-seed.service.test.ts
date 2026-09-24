import { describe, expect, it } from 'vitest';
import {
  DIALOGUE_GROUP_PROPOSALS,
  PRESERVE_EXISTING_GROUP_IDS,
  buildDialogueGroupRows,
  seedDialogueGroupProposals,
} from '../src/services/content-completion-v1-dialogue-seed.service.js';
import { buildWorldWorkbook, worldGateway } from './helpers/world-fixture.js';

describe('Content Completion v1 — dialogue seed', () => {
  it('proposes exactly the 16 missing groups, never the two live ones', () => {
    const ids = DIALOGUE_GROUP_PROPOSALS.map((p) => p.groupId);
    expect(ids).toHaveLength(16);
    for (const preserved of PRESERVE_EXISTING_GROUP_IDS) expect(ids).not.toContain(preserved);
    expect(new Set(ids).size).toBe(16);
  });

  it('builds exactly five locale rows per group, all disabled, speaker var, correct display mode', () => {
    const rows = buildDialogueGroupRows();
    expect(rows).toHaveLength(16 * 5);
    for (const r of rows) {
      expect(r.speaker_id).toBe('var');
      expect(r.enabled).toBe('FALSE');
      expect(r.voiceover_id).toBe('');
    }
    expect(new Set(rows.map((r) => r.dialogue_row_id)).size).toBe(rows.length);
    const boot = rows.filter((r) => r.group_id === 'dlg_boot');
    expect(boot.every((r) => r.display_mode === 'narration')).toBe(true);
    const beach = rows.filter((r) => r.group_id === 'dlg_beach');
    expect(beach.every((r) => r.display_mode === 'speech_bubble')).toBe(true);
    const ar = rows.find((r) => r.group_id === 'dlg_boot' && r.locale === 'ar-EG');
    expect(ar?.direction).toBe('rtl');
  });

  it('is idempotent and never touches a pre-existing row', async () => {
    const gateway = worldGateway(buildWorldWorkbook());
    const before = await gateway.findByPrimaryKey('15_DIALOGUE', 'dlg_boot_en', { bypass: true });
    expect(before).toBeTruthy();

    const first = await seedDialogueGroupProposals(gateway);
    expect(first.created).toHaveLength(80);
    expect(first.existing).toEqual([]);

    const second = await seedDialogueGroupProposals(gateway);
    expect(second.created).toEqual([]);
    expect(second.existing).toHaveLength(80);

    const after = await gateway.findByPrimaryKey('15_DIALOGUE', 'dlg_boot_en', { bypass: true });
    expect(after?.row.raw).toEqual(before?.row.raw);
  });
});

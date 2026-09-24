import { describe, expect, it } from 'vitest';
import { seedDialogueGroupProposals } from '../src/services/content-completion-v1-dialogue-seed.service.js';
import { activateDialogueGroupProposals } from '../src/services/content-completion-v1-dialogue-activate.service.js';
import { buildWorldWorkbook, worldGateway } from './helpers/world-fixture.js';

describe('Content Completion v1 — dialogue activate', () => {
  it('reports every row missing (nothing to enable) before the seed has ever run', async () => {
    const gateway = worldGateway(buildWorldWorkbook());
    const outcome = await activateDialogueGroupProposals(gateway);
    expect(outcome.enabled).toEqual([]);
    expect(outcome.alreadyEnabled).toEqual([]);
    expect(outcome.missing).toHaveLength(80);
  });

  it('enables exactly the 80 seeded rows, once, and is idempotent on a rerun', async () => {
    const gateway = worldGateway(buildWorldWorkbook());
    await seedDialogueGroupProposals(gateway);

    const first = await activateDialogueGroupProposals(gateway);
    expect(first.enabled).toHaveLength(80);
    expect(first.alreadyEnabled).toEqual([]);
    expect(first.missing).toEqual([]);

    const row = await gateway.findByPrimaryKey('15_DIALOGUE', 'dlg_church_01_en', { bypass: true });
    expect(row?.row.values.enabled).toBe(true);
    expect(row?.row.raw.text).toContain('church door');

    const second = await activateDialogueGroupProposals(gateway);
    expect(second.enabled).toEqual([]);
    expect(second.alreadyEnabled).toHaveLength(80);
    expect(second.missing).toEqual([]);
  });

  it('never touches the fixture-only, differently-keyed dlg_boot_en row', async () => {
    const gateway = worldGateway(buildWorldWorkbook());
    const before = await gateway.findByPrimaryKey('15_DIALOGUE', 'dlg_boot_en', { bypass: true });
    await seedDialogueGroupProposals(gateway);
    await activateDialogueGroupProposals(gateway);
    const after = await gateway.findByPrimaryKey('15_DIALOGUE', 'dlg_boot_en', { bypass: true });
    expect(after?.row.raw).toEqual(before?.row.raw);
  });
});

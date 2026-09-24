import { describe, expect, it } from 'vitest';
import { row } from '@veoullas-world/test-fixtures';
import { resolveCompanionHint } from '../src/world/companion-hints.service.js';
import { buildWorldWorkbook, worldCtx, worldGateway } from './helpers/world-fixture.js';
import { unlockThrough } from './helpers/world-fixture-extra.js';

function build() {
  return buildWorldWorkbook((wb) => {
    wb['43_COMPANION_HINTS'] = [
      ...wb['43_COMPANION_HINTS']!,
      row('43_COMPANION_HINTS', {
        hint_row_id: 'hint_farm_plant_en',
        hint_id: 'hint_farm_plant',
        location_id: 'farm',
        condition_type: 'story_beat_pending',
        condition_value: 'beat_14_farm',
        priority: '1',
        locale: 'en',
        text: 'Try planting a seed here.',
        direction: 'ltr',
        enabled: 'TRUE',
      }),
      row('43_COMPANION_HINTS', {
        hint_row_id: 'hint_farm_plant_ar',
        hint_id: 'hint_farm_plant',
        location_id: 'farm',
        condition_type: 'story_beat_pending',
        condition_value: 'beat_14_farm',
        priority: '1',
        locale: 'ar-EG',
        text: 'جربي تزرعي بذرة هنا.',
        direction: 'rtl',
        enabled: 'TRUE',
      }),
      row('43_COMPANION_HINTS', {
        hint_row_id: 'hint_farm_always_en',
        hint_id: 'hint_farm_always',
        location_id: 'farm',
        condition_type: 'always',
        condition_value: '',
        priority: '5',
        locale: 'en',
        text: 'The Farm is peaceful this time of day.',
        direction: 'ltr',
        enabled: 'TRUE',
      }),
      row('43_COMPANION_HINTS', {
        hint_row_id: 'hint_church_en',
        hint_id: 'hint_church',
        location_id: 'church',
        condition_type: 'always',
        condition_value: '',
        priority: '1',
        locale: 'en',
        text: 'Should never render — Church is excluded.',
        direction: 'ltr',
        enabled: 'TRUE',
      }),
    ];
  });
}

describe('Scripted companion hints', () => {
  it('picks the higher-priority (lower number), currently-eligible hint for the pending beat', async () => {
    const gateway = worldGateway(build());
    const ctx = worldCtx(gateway);
    await unlockThrough(ctx, 'beat_14_farm'); // beat_14_farm is now the current (pending) beat
    const hint = await resolveCompanionHint(ctx, 'farm', 'en');
    expect(hint.hint).toMatchObject({
      hintId: 'hint_farm_plant',
      text: 'Try planting a seed here.',
    });
  });

  it('resolves the requested locale, RTL included', async () => {
    const gateway = worldGateway(build());
    const ctx = worldCtx(gateway);
    await unlockThrough(ctx, 'beat_14_farm');
    const hint = await resolveCompanionHint(ctx, 'farm', 'ar-EG');
    expect(hint.hint).toMatchObject({ text: 'جربي تزرعي بذرة هنا.', direction: 'rtl' });
  });

  it('falls back to the "always" hint once the pending-beat hint is no longer eligible', async () => {
    const gateway = worldGateway(build());
    const ctx = worldCtx(gateway);
    await unlockThrough(ctx, 'beat_15_museum_approach'); // farm beat is done now, no longer "pending"
    const hint = await resolveCompanionHint(ctx, 'farm', 'en');
    expect(hint.hint).toMatchObject({ hintId: 'hint_farm_always' });
  });

  it('never returns a hint for the Church location, even if one is authored', async () => {
    const gateway = worldGateway(build());
    const ctx = worldCtx(gateway);
    await unlockThrough(ctx, 'beat_07_church');
    const hint = await resolveCompanionHint(ctx, 'church', 'en');
    // The route itself is never registered for /church; this proves the resolver stays silent
    // even if it were ever called directly for that location.
    expect(hint.hint).toBeNull();
  });

  it('returns null (not an error) for a location with nothing authored, or one not yet reachable', async () => {
    const gateway = worldGateway(build());
    const ctx = worldCtx(gateway);
    await unlockThrough(ctx, 'beat_05_beach');
    const notAuthored = await resolveCompanionHint(ctx, 'beach', 'en');
    expect(notAuthored.hint).toBeNull();
    const notReachable = await resolveCompanionHint(ctx, 'farm', 'en');
    expect(notReachable.hint).toBeNull();
  });
});

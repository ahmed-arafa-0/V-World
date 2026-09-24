import { describe, expect, it } from 'vitest';
import { GOOD_WORKBOOK, row } from '@veoullas-world/test-fixtures';
import {
  claimAchievement,
  getPlayerAchievements,
  getPlayerAchievementViews,
} from '../src/services/player-achievements.service.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

function gatewayFor(workbook: Record<string, string[][]>): SheetGateway {
  return new SheetGateway(new FakeGoogleSheetsClient(structuredClone(workbook)), {
    ttlSeconds: 60,
  });
}

const NOW = new Date('2026-09-16T10:00:00.000Z');

describe('claimAchievement', () => {
  it('creates and claims a new achievement row on first claim', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const result = await claimAchievement(gateway, 'test_user_1', 'ach_test', NOW);

    expect(result.applied).toBe(true);
    expect(result.reason).toBe('unlocked_and_claimed');
    expect(result.achievement.claimed).toBe(true);
  });

  it('is idempotent: claiming an already-claimed achievement changes nothing, from any later time', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await claimAchievement(gateway, 'test_user_2', 'ach_test', NOW);
    const retry = await claimAchievement(
      gateway,
      'test_user_2',
      'ach_test',
      new Date(NOW.getTime() + 999_999_999),
    );

    expect(retry.applied).toBe(false);
    expect(retry.reason).toBe('already_claimed');

    const raw = await gateway.getRawTab('26_PLAYER_ACHIEV', { bypass: true });
    const header = raw[0]!;
    const keyIdx = header.indexOf('user_achievement_key');
    const matches = raw.slice(1).filter((r) => r[keyIdx] === 'test_user_2|ach_test');
    expect(matches).toHaveLength(1);
  });

  it('claims an existing unclaimed row (e.g. progressed toward but not yet claimed) without duplicating it', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await gateway.appendRow('26_PLAYER_ACHIEV', {
      user_achievement_key: 'test_user_3|ach_progress',
      user_id: 'test_user_3',
      achievement_id: 'ach_progress',
      status: 'in_progress',
      progress_value: '5',
      claimed: 'FALSE',
      updated_at: NOW.toISOString(),
    });

    const result = await claimAchievement(gateway, 'test_user_3', 'ach_progress', NOW);
    expect(result.applied).toBe(true);
    expect(result.achievement.claimed).toBe(true);

    const raw = await gateway.getRawTab('26_PLAYER_ACHIEV', { bypass: true });
    const header = raw[0]!;
    const keyIdx = header.indexOf('user_achievement_key');
    const matches = raw.slice(1).filter((r) => r[keyIdx] === 'test_user_3|ach_progress');
    expect(matches).toHaveLength(1);
  });

  it('survives a refresh: getPlayerAchievements reads back exactly what was claimed', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await claimAchievement(gateway, 'test_user_4', 'ach_test', NOW);

    const achievements = await getPlayerAchievements(gateway, 'test_user_4');
    expect(achievements).toHaveLength(1);
    expect(achievements[0]!.claimed).toBe(true);
  });

  it('never mutates a pre-existing real-shaped fixture row for a different user (isolation)', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const before = await gateway.findByPrimaryKey('26_PLAYER_ACHIEV', 'veoulla|ach_first_key', {
      bypass: true,
    });

    await claimAchievement(gateway, 'test_user_5', 'ach_first_key', NOW);

    const after = await gateway.findByPrimaryKey('26_PLAYER_ACHIEV', 'veoulla|ach_first_key', {
      bypass: true,
    });
    expect(after!.row.raw).toEqual(before!.row.raw);
  });
});

describe('getPlayerAchievementViews', () => {
  function withSecretAchievement(): Record<string, string[][]> {
    const wb = structuredClone(GOOD_WORKBOOK) as Record<string, string[][]>;
    wb['23_ACHIEVEMENTS'] = [
      ...wb['23_ACHIEVEMENTS']!,
      row('23_ACHIEVEMENTS', {
        achievement_id: 'ach_secret',
        category: 'story',
        title_text_id: 'ach_secret_title',
        description_text_id: 'ach_secret_desc',
        icon_id: 'icon_key_shell',
        secret: 'TRUE',
        points: '50',
        trigger_type: 'story',
        trigger_rule_json: '{}',
        reward_quantity: '0',
        enabled: 'TRUE',
      }),
    ];
    wb['08_UI_TEXT'] = [
      ...wb['08_UI_TEXT']!,
      row('08_UI_TEXT', {
        ui_text_row_id: 'uit_ach_secret_title_en',
        text_id: 'ach_secret_title',
        locale: 'en',
        text: 'The Secret One',
        enabled: 'TRUE',
      }),
    ];
    return wb;
  }

  it('resolves title, description, and icon for a visible, unlocked achievement', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await gateway.appendRow('08_UI_TEXT', {
      ui_text_row_id: 'uit_ach_first_key_title_en',
      text_id: 'ach_first_key_title',
      locale: 'en',
      text: 'First Key',
      enabled: 'TRUE',
    });
    const views = await getPlayerAchievementViews(gateway, 'veoulla', 'en');
    const view = views.find((v) => v.achievementId === 'ach_first_key');
    expect(view).toMatchObject({ secret: false, status: 'locked', title: 'First Key', points: 10 });
    expect(view!.iconRef).toBe('/api/media/asset_icon_key_shell?v=1');
  });

  it('never reveals a still-locked secret achievement’s title, description, icon, or points', async () => {
    const gateway = gatewayFor(withSecretAchievement());
    const views = await getPlayerAchievementViews(gateway, 'someone_new', 'en');
    const secret = views.find((v) => v.achievementId === 'ach_secret');
    expect(secret).toMatchObject({
      secret: true,
      status: 'locked',
      title: '',
      description: '',
      iconRef: null,
      points: 0,
    });
  });

  it('reveals a secret achievement in full once the player has unlocked it', async () => {
    const gateway = gatewayFor(withSecretAchievement());
    await claimAchievement(gateway, 'someone_new', 'ach_secret', NOW);
    const views = await getPlayerAchievementViews(gateway, 'someone_new', 'en');
    const secret = views.find((v) => v.achievementId === 'ach_secret');
    expect(secret).toMatchObject({
      secret: true,
      status: 'unlocked',
      title: 'The Secret One',
      points: 50,
    });
  });

  it('falls back to English when the requested locale has no row', async () => {
    const gateway = gatewayFor(withSecretAchievement());
    await claimAchievement(gateway, 'fr_user', 'ach_secret', NOW);
    const views = await getPlayerAchievementViews(gateway, 'fr_user', 'fr');
    const secret = views.find((v) => v.achievementId === 'ach_secret');
    expect(secret!.title).toBe('The Secret One');
  });
});

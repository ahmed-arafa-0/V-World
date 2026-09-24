import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { GOOD_WORKBOOK } from '@veoullas-world/test-fixtures';
import { createApp } from '../src/app.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

async function makeAppWithGateDialogue() {
  const client = new FakeGoogleSheetsClient(structuredClone(GOOD_WORKBOOK));
  const gateway = new SheetGateway(client, { ttlSeconds: 60 });
  // GOOD_WORKBOOK's own fixture dialogue is "dlg_boot" — seed a real
  // "dlg_gate_01" row (mirroring the live Sheet's actual gate dialogue id,
  // see docs/content/PHASE_1_VOICEOVER_CUES.md §1a) with its own voiceover
  // asset, so the filtering/redaction behavior under test has something
  // real to filter.
  await gateway.appendRow('15_DIALOGUE', {
    dialogue_row_id: 'dlg_gate_01_en',
    dialogue_id: 'dlg_gate_01',
    group_id: 'grp_gate',
    sequence: '1',
    speaker_id: 'var',
    locale: 'en',
    text: 'Gate line',
    direction: 'ltr',
    emotion: 'warm',
    display_mode: 'speech_bubble',
    voiceover_id: 'vo_gate_01_en',
    requires_response: 'FALSE',
    enabled: 'TRUE',
  });
  // 16_VOICEOVER retains this historical row untouched (Ahmed's 2026-09-17
  // decision removed voice-over without a destructive schema migration) —
  // seeded here only to prove the pre-Gate endpoint never reads it.
  await gateway.appendRow('16_VOICEOVER', {
    voiceover_id: 'vo_gate_01_en',
    content_type: 'dialogue',
    content_id: 'dlg_gate_01',
    locale: 'en',
    audio_asset_id: 'asset_icon_map', // any enabled 10_ASSETS row already in GOOD_WORKBOOK
    caption_text: 'Gate line',
    direction: 'ltr',
    voice_name: 'var_voice',
    duration_ms: '2000',
    caption_start_ms: '0',
    caption_end_ms: '2000',
    enabled: 'TRUE',
  });
  await gateway.appendRow('08_UI_TEXT', {
    ui_text_row_id: 'uit_action_continue_en',
    text_id: 'action_continue',
    screen_id: 'global',
    component_id: 'continue_button',
    locale: 'en',
    text: 'Continue',
    direction: 'ltr',
    aria_label: 'Continue',
    enabled: 'TRUE',
  });

  const app = createApp({ getGateway: () => gateway, now: () => new Date() });
  return app;
}

describe('GET /api/content/pre-gate — deliberately public', () => {
  it('responds 200 with no owner/admin session at all', async () => {
    const app = await makeAppWithGateDialogue();
    const res = await request(app).get('/api/content/pre-gate');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns only the pre-Gate dialogue group, never other dialogue (e.g. dlg_boot)', async () => {
    const app = await makeAppWithGateDialogue();
    const res = await request(app).get('/api/content/pre-gate');
    expect(res.body.dialogue.length).toBeGreaterThan(0);
    for (const line of res.body.dialogue) {
      expect(line.dialogueId).toBe('dlg_gate_01');
    }
    expect(res.body.dialogue.some((l: { dialogueId: string }) => l.dialogueId === 'dlg_boot')).toBe(
      false,
    );
  });

  it('never includes any voiceover/audio reference on a dialogue line — narration is text-only', async () => {
    const app = await makeAppWithGateDialogue();
    const res = await request(app).get('/api/content/pre-gate');
    expect(res.body.dialogue.length).toBeGreaterThan(0);
    for (const line of res.body.dialogue) {
      expect(line).not.toHaveProperty('voiceoverMediaRef');
    }
    expect(JSON.stringify(res.body)).not.toContain('vo_gate_01_en');
  });

  it('returns the localized action_continue UI text needed to pace text-only progression', async () => {
    const app = await makeAppWithGateDialogue();
    const res = await request(app).get('/api/content/pre-gate');
    expect(Array.isArray(res.body.uiText)).toBe(true);
    expect(res.body.uiText.length).toBeGreaterThan(0);
    for (const entry of res.body.uiText) {
      expect(entry.textId).toBe('action_continue');
    }
  });

  it('returns the language list needed for direction resolution', async () => {
    const app = await makeAppWithGateDialogue();
    const res = await request(app).get('/api/content/pre-gate');
    expect(res.body.languages.length).toBeGreaterThanOrEqual(5);
  });

  it('never exposes diagnostics or the icon table; icons is empty unless the settings icon is registered', async () => {
    const app = await makeAppWithGateDialogue();
    const res = await request(app).get('/api/content/pre-gate');
    expect(res.body.icons).toEqual([]);
    expect(res.body.diagnostics).toBeUndefined();
  });

  describe('icons: only the allowlisted settings icon, via the public route', () => {
    async function appWithIcons(settingsAssetId: string) {
      const client = new FakeGoogleSheetsClient(structuredClone(GOOD_WORKBOOK));
      const gateway = new SheetGateway(client, { ttlSeconds: 60 });
      for (const assetId of ['asset_icon_settings', 'asset_icon_other']) {
        await gateway.appendRow('10_ASSETS', {
          asset_id: assetId,
          asset_type: 'image',
          drive_file_id: `fixture_${assetId}`,
          preload_priority: '1',
          loop: 'FALSE',
          enabled: 'TRUE',
          version: '3',
        });
      }
      await gateway.appendRow('09_ICONS', {
        icon_id: 'icon_settings',
        category: 'ui',
        display_name: 'Settings',
        asset_id: settingsAssetId,
        format: 'svg',
        rtl_mirror: 'FALSE',
        alt_text_id: 'player_settings',
        width_px: '48',
        height_px: '48',
        enabled: 'TRUE',
        version: '1',
      });
      await gateway.appendRow('09_ICONS', {
        icon_id: 'icon_walk_forward',
        category: 'ui',
        display_name: 'Walk forward',
        asset_id: 'asset_icon_other',
        format: 'svg',
        rtl_mirror: 'FALSE',
        alt_text_id: 'player_forward',
        width_px: '48',
        height_px: '48',
        enabled: 'TRUE',
        version: '1',
      });
      return createApp({ getGateway: () => gateway, now: () => new Date() });
    }

    it('returns icon_settings with a /api/public-media ref, and no other icon', async () => {
      const res = await request(await appWithIcons('asset_icon_settings')).get(
        '/api/content/pre-gate',
      );
      expect(res.body.icons).toHaveLength(1);
      expect(res.body.icons[0].iconId).toBe('icon_settings');
      expect(res.body.icons[0].mediaRef).toBe('/api/public-media/asset_icon_settings?v=3');
      expect(JSON.stringify(res.body)).not.toContain('fixture_asset_icon');
    });

    it('drops the icon if the Sheet row now points at a different, non-allowlisted asset', async () => {
      const res = await request(await appWithIcons('asset_icon_other')).get(
        '/api/content/pre-gate',
      );
      expect(res.body.icons).toEqual([]);
    });
  });

  describe('assets — Ahmed 2026-09-18: a narrow, explicit allowlist, never the full list', () => {
    it('returns an enabled allowlisted asset (gate_closed_bg) with a public mediaRef', async () => {
      const client = new FakeGoogleSheetsClient(structuredClone(GOOD_WORKBOOK));
      const gateway = new SheetGateway(client, { ttlSeconds: 60 });
      await gateway.appendRow('10_ASSETS', {
        asset_id: 'gate_closed_bg',
        asset_type: 'image',
        location_id: 'gate',
        drive_file_id: 'fixture_gate_closed_desktop',
        mobile_drive_file_id: 'fixture_gate_closed_mobile',
        version: '1',
        preload_priority: '1',
        loop: 'FALSE',
        enabled: 'TRUE',
        notes: '',
      });
      const app = createApp({ getGateway: () => gateway, now: () => new Date() });

      const res = await request(app).get('/api/content/pre-gate');
      expect(res.body.assets).toEqual([
        expect.objectContaining({
          assetId: 'gate_closed_bg',
          mediaRef: '/api/public-media/gate_closed_bg?v=1',
        }),
      ]);
      expect(res.body.assets[0].mediaRef).not.toContain('/api/media/');
    });

    it('never includes an asset that exists/is enabled but is not on the allowlist', async () => {
      // GOOD_WORKBOOK already registers asset_icon_map, an enabled, unrelated 10_ASSETS row.
      const app = await makeAppWithGateDialogue();
      const res = await request(app).get('/api/content/pre-gate');
      expect(
        (res.body.assets as Array<{ assetId: string }>).some((a) => a.assetId === 'asset_icon_map'),
      ).toBe(false);
    });

    it('never includes an allowlisted asset id that is not registered/enabled in 10_ASSETS', async () => {
      const app = await makeAppWithGateDialogue();
      const res = await request(app).get('/api/content/pre-gate');
      expect(res.body.assets).toEqual([]);
    });

    it('never leaks a raw Drive file ID through the assets array', async () => {
      const client = new FakeGoogleSheetsClient(structuredClone(GOOD_WORKBOOK));
      const gateway = new SheetGateway(client, { ttlSeconds: 60 });
      await gateway.appendRow('10_ASSETS', {
        asset_id: 'var_idle_no_collar',
        asset_type: 'image',
        location_id: 'beach',
        drive_file_id: 'SECRET_DRIVE_FILE_ID_1234',
        version: '1',
        preload_priority: '2',
        loop: 'FALSE',
        enabled: 'TRUE',
        notes: '',
      });
      const app = createApp({ getGateway: () => gateway, now: () => new Date() });
      const res = await request(app).get('/api/content/pre-gate');
      expect(JSON.stringify(res.body)).not.toContain('SECRET_DRIVE_FILE_ID_1234');
    });
  });

  it('never exposes a raw Drive file ID, session ID, or credential', async () => {
    const app = await makeAppWithGateDialogue();
    const res = await request(app).get('/api/content/pre-gate');
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/DRIVE_FILE_ID/);
    expect(serialized).not.toMatch(/"sessionId"/);
  });
});

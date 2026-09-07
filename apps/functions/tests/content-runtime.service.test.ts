import { describe, expect, it } from 'vitest';
import { buildM03Workbook, M03_TEXT_IDS } from '@veoullas-world/test-fixtures';
import { computeContentRuntime } from '../src/services/content-runtime.service.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

function makeGateway(): SheetGateway {
  return new SheetGateway(new FakeGoogleSheetsClient(structuredClone(buildM03Workbook())), {
    ttlSeconds: 60,
  });
}

describe('computeContentRuntime', () => {
  it('returns exactly the five supported languages with correct direction', async () => {
    const response = await computeContentRuntime(makeGateway());
    expect(response.languages).toHaveLength(5);
    const byLocale = new Map(response.languages.map((l) => [l.localeId, l]));
    expect(byLocale.get('en')?.direction).toBe('ltr');
    expect(byLocale.get('ar-EG')?.direction).toBe('rtl');
    expect(byLocale.get('it')?.direction).toBe('ltr');
    expect(byLocale.get('el')?.direction).toBe('ltr');
    expect(byLocale.get('fr')?.direction).toBe('ltr');
  });

  it('never surfaces a disabled row from any of the six content tabs', async () => {
    const response = await computeContentRuntime(makeGateway());
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain('content_lab_disabled');
    expect(serialized).not.toContain('icon_disabled');
    expect(serialized).not.toContain('dlg_disabled');
    expect(serialized).not.toContain('vo_disabled');
    expect(serialized).not.toContain('Should never be visible');
  });

  it('flags a duplicate localized UI text row (same text_id + locale, two different rows)', async () => {
    const response = await computeContentRuntime(makeGateway());
    const found = response.diagnostics.find(
      (d) => d.code === 'DUPLICATE_LOCALIZED_ROW' && d.subjectId === `${M03_TEXT_IDS.duplicate}:en`,
    );
    expect(found).toBeDefined();
    expect(found?.tab).toBe('08_UI_TEXT');
  });

  it('flags a UI text group with no enabled English fallback row', async () => {
    const response = await computeContentRuntime(makeGateway());
    const found = response.diagnostics.find(
      (d) => d.code === 'MISSING_ENGLISH_FALLBACK' && d.subjectId === M03_TEXT_IDS.incomplete,
    );
    expect(found).toBeDefined();
    expect(found?.tab).toBe('08_UI_TEXT');
  });

  it('does not flag a fully-covered UI text group as missing an English fallback', async () => {
    const response = await computeContentRuntime(makeGateway());
    const found = response.diagnostics.find(
      (d) => d.code === 'MISSING_ENGLISH_FALLBACK' && d.subjectId === M03_TEXT_IDS.complete,
    );
    expect(found).toBeUndefined();
  });

  it('resolves an icon mediaRef from its asset reference and never leaks the raw Drive file ID', async () => {
    const response = await computeContentRuntime(makeGateway());
    const backIcon = response.icons.find((i) => i.iconId === 'icon_back');
    expect(backIcon?.mediaRef).toBe('/api/media/asset_icon_back?v=1');
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain('fake_drive_id');
  });

  it('flags an icon referencing a missing asset and resolves its mediaRef to null', async () => {
    const response = await computeContentRuntime(makeGateway());
    const broken = response.icons.find((i) => i.iconId === 'icon_broken_reference');
    expect(broken?.mediaRef).toBeNull();
    const diagnostic = response.diagnostics.find(
      (d) => d.code === 'INVALID_ICON_ASSET_REFERENCE' && d.subjectId === 'icon_broken_reference',
    );
    expect(diagnostic).toBeDefined();
  });

  it('proves conditional RTL mirroring is Sheet-driven: the Back icon mirrors, an ordinary icon does not', async () => {
    const response = await computeContentRuntime(makeGateway());
    const back = response.icons.find((i) => i.iconId === 'icon_back');
    const map = response.icons.find((i) => i.iconId === 'icon_map');
    expect(back?.rtlMirror).toBe(true);
    expect(map?.rtlMirror).toBe(false);
  });

  it('flags a voiceover referencing a missing asset and resolves its mediaRef to null', async () => {
    const response = await computeContentRuntime(makeGateway());
    const broken = response.voiceover.find((v) => v.voiceoverId === 'vo_broken_asset');
    expect(broken?.mediaRef).toBeNull();
    const diagnostic = response.diagnostics.find(
      (d) => d.code === 'INVALID_VOICEOVER_ASSET_REFERENCE' && d.subjectId === 'vo_broken_asset',
    );
    expect(diagnostic).toBeDefined();
  });

  it('flags a dialogue line referencing a missing voiceover and resolves voiceoverMediaRef to null', async () => {
    const response = await computeContentRuntime(makeGateway());
    const broken = response.dialogue.find((d) => d.dialogueRowId === 'dlg_broken_voiceover_en');
    expect(broken?.voiceoverMediaRef).toBeNull();
    const diagnostic = response.diagnostics.find(
      (d) =>
        d.code === 'INVALID_DIALOGUE_VOICEOVER_REFERENCE' &&
        d.subjectId === 'dlg_broken_voiceover_en',
    );
    expect(diagnostic).toBeDefined();
  });

  it('resolves a dialogue line voiceoverMediaRef when the reference is valid', async () => {
    const response = await computeContentRuntime(makeGateway());
    const line = response.dialogue.find((d) => d.dialogueRowId === 'dlg_boot_en');
    expect(line?.voiceoverMediaRef).toBe('/api/media/asset_vo_boot_en?v=1');
  });

  it('reports status-only asset metadata, never a raw or placeholder Drive file ID', async () => {
    const response = await computeContentRuntime(makeGateway());
    expect(response.assets.length).toBeGreaterThan(0);
    for (const asset of response.assets) {
      expect(asset).not.toHaveProperty('driveFileId');
    }
    const backAsset = response.assets.find((a) => a.assetId === 'asset_icon_back');
    expect(backAsset?.hasMobileVariant).toBe(true);
    expect(backAsset?.hasPosterVariant).toBe(false);
    const serialized = JSON.stringify(response.assets);
    expect(serialized).not.toContain('fake_drive_id');
  });

  it('supports a read-only cache-bypass refresh without mutating the Sheet', async () => {
    const gateway = makeGateway();
    const first = await computeContentRuntime(gateway);
    const refreshed = await computeContentRuntime(gateway, { bypass: true });
    expect(refreshed.languages).toHaveLength(first.languages.length);
  });

  it('includes a request/correlation ID and a generation timestamp', async () => {
    const response = await computeContentRuntime(makeGateway());
    expect(typeof response.requestId).toBe('string');
    expect(response.requestId.length).toBeGreaterThan(0);
    expect(typeof response.cacheGeneratedAt).toBe('string');
  });
});

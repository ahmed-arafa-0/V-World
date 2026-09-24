import { randomUUID } from 'node:crypto';
import type {
  ContentDiagnostic,
  ContentDirection,
  ContentRuntimeResponse,
  RuntimeAssetStatus,
  RuntimeDialogueLine,
  RuntimeIconEntry,
  RuntimeLanguage,
  RuntimeUiTextEntry,
} from '@veoullas-world/contracts';
import { FALLBACK_LOCALE, SUPPORTED_LOCALES } from '@veoullas-world/contracts';
import type { NormalizedRow } from '@veoullas-world/sheet-schema';
import type { ReadOptions, SheetGateway } from '../repositories/sheet-gateway.js';
import { buildMediaRef } from './media-ref.js';

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

function direction(raw: unknown): ContentDirection {
  return raw === 'rtl' ? 'rtl' : 'ltr';
}

interface AssetIndexEntry {
  version: number;
}

/**
 * Every duplicate/missing-fallback check below shares this shape: group a
 * tab's enabled rows by their cross-locale content key, then flag (a) any
 * locale that appears more than once for the same key, and (b) any key with
 * no enabled English row. This is intentionally distinct from schema-health's
 * primary-key duplicate check — 08_UI_TEXT/15_DIALOGUE/16_VOICEOVER rows have
 * unique row IDs by design; two different rows can still legitimately
 * collide on (contentKey, locale), which is the real-world authoring mistake
 * this catches.
 */
function checkLocaleGroups(
  tab: ContentDiagnostic['tab'],
  entries: Array<{ key: string; locale: string }>,
): ContentDiagnostic[] {
  const diagnostics: ContentDiagnostic[] = [];
  const groups = new Map<string, Map<string, number>>();

  for (const { key, locale } of entries) {
    if (!key || !locale) continue;
    let localeCounts = groups.get(key);
    if (!localeCounts) {
      localeCounts = new Map();
      groups.set(key, localeCounts);
    }
    localeCounts.set(locale, (localeCounts.get(locale) ?? 0) + 1);
  }

  for (const [key, localeCounts] of groups) {
    for (const [locale, count] of localeCounts) {
      if (count > 1) {
        diagnostics.push({
          code: 'DUPLICATE_LOCALIZED_ROW',
          tab,
          subjectId: `${key}:${locale}`,
          message: `More than one enabled ${tab} row exists for "${key}" in locale "${locale}".`,
        });
      }
    }
    if (!localeCounts.has(FALLBACK_LOCALE)) {
      diagnostics.push({
        code: 'MISSING_ENGLISH_FALLBACK',
        tab,
        subjectId: key,
        message: `No enabled English ("${FALLBACK_LOCALE}") row exists for "${key}" in ${tab}.`,
      });
    }
  }

  return diagnostics;
}

function buildLanguages(rows: NormalizedRow[]): RuntimeLanguage[] {
  return rows
    .filter((r) => (SUPPORTED_LOCALES as readonly string[]).includes(r.primaryKeyValue ?? ''))
    .map((r) => ({
      localeId: r.primaryKeyValue as RuntimeLanguage['localeId'],
      shortCode: str(r.raw.short_code),
      englishName: str(r.raw.english_name),
      nativeName: str(r.raw.native_name),
      direction: direction(r.raw.direction),
      fallbackLocale: str(r.raw.fallback_locale, FALLBACK_LOCALE),
      sortOrder: num(r.values.sort_order),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function buildAssetIndex(rows: NormalizedRow[]): Map<string, AssetIndexEntry> {
  const index = new Map<string, AssetIndexEntry>();
  for (const r of rows) {
    if (!r.primaryKeyValue) continue;
    index.set(r.primaryKeyValue, { version: num(r.values.version, 1) });
  }
  return index;
}

function buildAssetStatuses(rows: NormalizedRow[]): RuntimeAssetStatus[] {
  return rows
    .filter((r) => r.primaryKeyValue)
    .map((r) => {
      const assetId = r.primaryKeyValue!;
      const version = num(r.values.version, 1);
      return {
        assetId,
        assetType: str(r.raw.asset_type),
        version,
        preloadPriority: num(r.values.preload_priority),
        hasMobileVariant: str(r.raw.mobile_drive_file_id).trim() !== '',
        hasPosterVariant: str(r.raw.poster_drive_file_id).trim() !== '',
        mediaRef: buildMediaRef(assetId, version),
      };
    });
}

function buildIcons(
  rows: NormalizedRow[],
  assetIndex: Map<string, AssetIndexEntry>,
  diagnostics: ContentDiagnostic[],
): RuntimeIconEntry[] {
  return rows
    .filter((r) => r.primaryKeyValue)
    .map((r) => {
      const iconId = r.primaryKeyValue!;
      const assetId = str(r.raw.asset_id);
      const asset = assetId ? assetIndex.get(assetId) : undefined;
      if (assetId && !asset) {
        diagnostics.push({
          code: 'INVALID_ICON_ASSET_REFERENCE',
          tab: '09_ICONS',
          subjectId: iconId,
          message: `Icon "${iconId}" references asset "${assetId}", which is missing or disabled.`,
        });
      }
      return {
        iconId,
        category: str(r.raw.category),
        displayName: str(r.raw.display_name),
        mediaRef: asset ? buildMediaRef(assetId, asset.version) : null,
        format: str(r.raw.format),
        rtlMirror: r.values.rtl_mirror === true,
        altTextId: str(r.raw.alt_text_id),
      };
    });
}

function buildUiText(
  rows: NormalizedRow[],
  diagnostics: ContentDiagnostic[],
): RuntimeUiTextEntry[] {
  const entries = rows
    .filter((r) => r.primaryKeyValue)
    .map((r) => ({
      uiTextRowId: r.primaryKeyValue!,
      textId: str(r.raw.text_id),
      screenId: str(r.raw.screen_id),
      componentId: str(r.raw.component_id),
      locale: str(r.raw.locale),
      text: str(r.raw.text),
      direction: direction(r.raw.direction),
      ariaLabel: str(r.raw.aria_label),
    }));

  diagnostics.push(
    ...checkLocaleGroups(
      '08_UI_TEXT',
      entries.map((e) => ({ key: e.textId, locale: e.locale })),
    ),
  );

  return entries;
}

/**
 * `15_DIALOGUE.voiceover_id` may still hold a value (the column and every
 * historical row are untouched, per Ahmed's 2026-09-17 decision to remove
 * voice-over without a destructive schema migration) — this runtime simply
 * never reads or resolves it anymore. Narration is text-only; `displayMode`
 * alone decides cinematic-narration vs. speech-bubble presentation.
 */
function buildDialogue(
  rows: NormalizedRow[],
  diagnostics: ContentDiagnostic[],
): RuntimeDialogueLine[] {
  const entries = rows
    .filter((r) => r.primaryKeyValue)
    .map((r) => ({
      dialogueRowId: r.primaryKeyValue!,
      dialogueId: str(r.raw.dialogue_id),
      groupId: str(r.raw.group_id),
      sequence: num(r.values.sequence),
      speakerId: str(r.raw.speaker_id),
      locale: str(r.raw.locale),
      text: str(r.raw.text),
      direction: direction(r.raw.direction),
      emotion: str(r.raw.emotion),
      displayMode: str(r.raw.display_mode),
      requiresResponse: r.values.requires_response === true,
    }))
    .sort((a, b) => a.groupId.localeCompare(b.groupId) || a.sequence - b.sequence);

  diagnostics.push(
    ...checkLocaleGroups(
      '15_DIALOGUE',
      entries.map((e) => ({ key: e.dialogueId, locale: e.locale })),
    ),
  );

  return entries;
}

/**
 * Assembles the owner-authenticated content-runtime payload: normalized,
 * enabled-only rows from 07_LANGUAGES/08_UI_TEXT/09_ICONS/10_ASSETS/
 * 15_DIALOGUE, with icon/dialogue references resolved to stable same-origin
 * media paths (never a raw Drive file ID) and content diagnostics for
 * duplicate localized rows, missing English fallbacks, and invalid
 * icon/asset references. Disabled rows never reach this response at all —
 * `readEnabledRows` filters them out before any mapping happens.
 *
 * `16_VOICEOVER` is deliberately never read here — Ahmed's 2026-09-17
 * decision removed voice-over from the runtime entirely (narration/dialogue
 * is text-only); the tab and its historical rows remain fully intact in the
 * Sheet, this is only a reduction in what the API layer reads/exposes.
 */
export async function computeContentRuntime(
  gateway: SheetGateway,
  options?: ReadOptions,
): Promise<ContentRuntimeResponse> {
  // Fetched as one batched Sheets API request rather than five individual
  // concurrent reads — the individual-read version was a confirmed
  // contributor to real Google Sheets 429s under e2e load (see
  // docs/reports/PHASE1_VOICEOVER_REMOVAL_CHECKPOINT.md §6).
  const tabs = await gateway.readEnabledRowsBatch(
    ['07_LANGUAGES', '08_UI_TEXT', '09_ICONS', '10_ASSETS', '15_DIALOGUE'],
    options,
  );
  const languageRows = tabs['07_LANGUAGES']!;
  const uiTextRows = tabs['08_UI_TEXT']!;
  const iconRows = tabs['09_ICONS']!;
  const assetRows = tabs['10_ASSETS']!;
  const dialogueRows = tabs['15_DIALOGUE']!;

  const diagnostics: ContentDiagnostic[] = [];
  const assetIndex = buildAssetIndex(assetRows);

  const languages = buildLanguages(languageRows);
  const uiText = buildUiText(uiTextRows, diagnostics);
  const icons = buildIcons(iconRows, assetIndex, diagnostics);
  const dialogue = buildDialogue(dialogueRows, diagnostics);
  const assets = buildAssetStatuses(assetRows);

  return {
    ok: true,
    languages,
    uiText,
    dialogue,
    icons,
    assets,
    diagnostics,
    cacheGeneratedAt: new Date().toISOString(),
    requestId: randomUUID(),
  };
}

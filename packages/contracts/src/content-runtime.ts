/**
 * M03-A content-runtime contracts: localization, UI text, dialogue, icon,
 * and asset-status data for the owner-authenticated frontend. Every shape
 * here is safe to send to the browser — never a raw Google Drive file ID,
 * never a disabled/incomplete row, never a Sheet column outside this
 * allowlist. Narration/dialogue is text-only (Ahmed's 2026-09-17 decision
 * removed voice-over entirely — see CLAUDE.md); `mediaRef` fields that
 * remain (icons, assets) are same-origin paths built from an asset ID and
 * version, not raw Drive URLs.
 */

/** The five locales approved in the Living Bible. Order matches 07_LANGUAGES sort_order. */
export const SUPPORTED_LOCALES = ['en', 'ar-EG', 'it', 'el', 'fr'] as const;
export type LocaleCode = (typeof SUPPORTED_LOCALES)[number];

export const FALLBACK_LOCALE: LocaleCode = 'en';

export type ContentDirection = 'ltr' | 'rtl';

export interface RuntimeLanguage {
  localeId: LocaleCode;
  shortCode: string;
  englishName: string;
  nativeName: string;
  direction: ContentDirection;
  fallbackLocale: string;
  sortOrder: number;
}

export interface RuntimeUiTextEntry {
  uiTextRowId: string;
  textId: string;
  screenId: string;
  componentId: string;
  locale: string;
  text: string;
  direction: ContentDirection;
  ariaLabel: string;
}

/**
 * Narration/dialogue is presented as text only — Ahmed's 2026-09-17 product
 * decision removed voice-over from the entire experience across all three
 * phases (see CLAUDE.md and the Living Bible §3A/§8A/§18J). This line
 * therefore carries no audio reference of any kind; `displayMode` alone
 * decides cinematic-narration vs. speech-bubble presentation. `16_VOICEOVER`
 * itself, and its Sheet rows, are untouched — this contract simply no
 * longer reads or exposes them.
 */
export interface RuntimeDialogueLine {
  dialogueRowId: string;
  dialogueId: string;
  groupId: string;
  sequence: number;
  speakerId: string;
  locale: string;
  text: string;
  direction: ContentDirection;
  emotion: string;
  displayMode: string;
  requiresResponse: boolean;
}

export interface RuntimeIconEntry {
  iconId: string;
  category: string;
  displayName: string;
  /** Resolved same-origin media reference, or null when the referenced asset is missing/disabled. */
  mediaRef: string | null;
  format: string;
  /** Only true icons must ever visually mirror in RTL — never a blanket layout flip. */
  rtlMirror: boolean;
  altTextId: string;
}

/** Status-only asset metadata — never the raw Drive file ID(s). */
export interface RuntimeAssetStatus {
  assetId: string;
  assetType: string;
  version: number;
  preloadPriority: number;
  hasMobileVariant: boolean;
  hasPosterVariant: boolean;
  mediaRef: string;
}

export type ContentDiagnosticCode =
  'DUPLICATE_LOCALIZED_ROW' | 'MISSING_ENGLISH_FALLBACK' | 'INVALID_ICON_ASSET_REFERENCE';

export interface ContentDiagnostic {
  code: ContentDiagnosticCode;
  tab: '08_UI_TEXT' | '09_ICONS' | '15_DIALOGUE';
  /** A stable, non-sensitive identifier for the affected group (never a full row dump). */
  subjectId: string;
  message: string;
}

export interface ContentRuntimeResponse {
  ok: true;
  languages: RuntimeLanguage[];
  uiText: RuntimeUiTextEntry[];
  dialogue: RuntimeDialogueLine[];
  icons: RuntimeIconEntry[];
  assets: RuntimeAssetStatus[];
  diagnostics: ContentDiagnostic[];
  cacheGeneratedAt: string;
  requestId: string;
}

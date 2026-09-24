import type {
  RuntimeAssetStatus,
  RuntimeDialogueLine,
  RuntimeIconEntry,
  RuntimeLanguage,
  RuntimeUiTextEntry,
} from './content-runtime.js';

/**
 * Response shape for the deliberately PUBLIC `GET /api/content/pre-gate` —
 * never owner-session-gated, since it serves the Living Bible §18J beats
 * 01–04 (opening line, unseen VAR, reveal) that happen before Veoulla has
 * entered the Gate code at all. Narrowed to only the pre-Gate dialogue
 * group, the language list needed to resolve its direction, the one
 * `action_continue` UI-text group (the localized "Continue" control text
 * progression now uses in place of audio pacing — Ahmed's 2026-09-17
 * voice-over-removal decision), and — since Ahmed's 2026-09-18 explicit
 * authorization — the small, fixed `assets` allowlist below. Every other
 * field `/api/content/runtime` exposes to an authenticated owner (icons,
 * the full asset list, diagnostics) stays absent here.
 */
export interface PreGateContentResponse {
  ok: true;
  /** Sanitized public app title from `01_APP_CONFIG.app_name`; never a hard-coded frontend title. */
  appName: string;
  languages: RuntimeLanguage[];
  dialogue: RuntimeDialogueLine[];
  uiText: RuntimeUiTextEntry[];
  /**
   * ONLY the two ids `api/public-media.ts`'s `PUBLIC_MEDIA_ASSET_IDS`
   * allowlist serves (`gate_closed_bg`, `var_idle_no_collar`), and only
   * when each is actually registered/enabled — an asset id outside that
   * allowlist can never appear here even if it exists and is enabled in
   * `10_ASSETS`. Each `mediaRef` points at `/api/public-media/:assetId`
   * (never `/api/media/:assetId`, which stays owner-session-protected) —
   * see `docs/assets/PHASE_1_ASSET_HANDOFF.md` §6.
   */
  assets: RuntimeAssetStatus[];
  /**
   * ONLY the allowlisted pre-Gate control icons (`icon_settings`), each with a
   * `/api/public-media/:assetId` ref. Never the full icon table.
   */
  icons: RuntimeIconEntry[];
}

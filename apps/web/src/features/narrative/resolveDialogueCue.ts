import type { RuntimeDialogueLine } from '@veoullas-world/contracts';
import { FALLBACK_LOCALE, staticDirectionFor, type LocaleCode } from '../../i18n/locales';

/**
 * A resolved line of narration/dialogue, text-only — Ahmed's 2026-09-17
 * decision removed voice-over from the entire experience (see CLAUDE.md and
 * the Living Bible §3A/§8A/§18J). `displayMode` decides presentation:
 * VAR's narration renders as cinematic text, direct dialogue as a bubble
 * (Living Bible: "VAR is the sole narrator of the first-visit story...
 * VAR's direct dialogue appears in speech bubbles").
 */
export interface DialogueCue {
  text: string;
  direction: 'ltr' | 'rtl';
  displayMode: string;
  /** True when the requested locale had no row and English was used instead. */
  isFallback: boolean;
  /** True when neither the requested locale nor English had a row — `text` is a safe placeholder, never the raw ID. */
  isMissing: boolean;
}

const MISSING_CUE: Omit<DialogueCue, 'direction'> = {
  text: '(No text available)',
  displayMode: 'narration',
  isFallback: false,
  isMissing: true,
};

/**
 * Resolves one `dialogue_id` group to the current locale's line, falling
 * back to English and finally to a safe missing-text placeholder — mirrors
 * `resolveUiText`'s exact fallback chain (never the raw ID, never silently
 * blank).
 */
export function resolveDialogueCue(
  dialogue: RuntimeDialogueLine[],
  dialogueId: string,
  locale: LocaleCode,
): DialogueCue {
  const exact = dialogue.find((d) => d.dialogueId === dialogueId && d.locale === locale);
  if (exact) {
    return {
      text: exact.text,
      direction: exact.direction,
      displayMode: exact.displayMode,
      isFallback: false,
      isMissing: false,
    };
  }

  const fallback = dialogue.find(
    (d) => d.dialogueId === dialogueId && d.locale === FALLBACK_LOCALE,
  );
  if (fallback) {
    return {
      text: fallback.text,
      direction: fallback.direction,
      displayMode: fallback.displayMode,
      isFallback: true,
      isMissing: false,
    };
  }

  return { ...MISSING_CUE, direction: staticDirectionFor(locale) };
}

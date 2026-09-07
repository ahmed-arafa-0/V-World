import type { RuntimeUiTextEntry } from '@veoullas-world/contracts';
import { FALLBACK_LOCALE, staticDirectionFor, type LocaleCode } from './locales';

export interface ResolvedText {
  text: string;
  direction: 'ltr' | 'rtl';
  /** True when the requested locale had no row and English was used instead. */
  isFallback: boolean;
  /** True when neither the requested locale nor English had a row — `text` is a safe placeholder, never the raw text_id. */
  isMissing: boolean;
}

/**
 * Resolves one text_id for the current locale from an already-fetched
 * uiText table, falling back to English and finally to a safe placeholder —
 * never the raw translation key. Pure and synchronous: switching locale
 * only re-runs this against data already in memory, so no reload or
 * refetch is needed to see all five languages.
 */
export function resolveUiText(
  entries: RuntimeUiTextEntry[],
  textId: string,
  locale: LocaleCode,
): ResolvedText {
  const exact = entries.find((e) => e.textId === textId && e.locale === locale);
  if (exact) {
    return { text: exact.text, direction: exact.direction, isFallback: false, isMissing: false };
  }

  const fallback = entries.find((e) => e.textId === textId && e.locale === FALLBACK_LOCALE);
  if (fallback) {
    return {
      text: fallback.text,
      direction: fallback.direction,
      isFallback: true,
      isMissing: false,
    };
  }

  return {
    text: '(Translation not yet available)',
    direction: staticDirectionFor(locale),
    isFallback: false,
    isMissing: true,
  };
}

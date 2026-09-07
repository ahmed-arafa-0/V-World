import { FALLBACK_LOCALE, SUPPORTED_LOCALES, type LocaleCode } from '@veoullas-world/contracts';

export { SUPPORTED_LOCALES, FALLBACK_LOCALE };
export type { LocaleCode };

/**
 * Static direction fallback used only before `/api/content/runtime` has
 * loaded real language metadata (or if a locale is somehow missing from
 * that response). Mirrors the Living Bible's locked five-language rule:
 * Arabic is RTL, the other four are LTR.
 */
const STATIC_DIRECTION: Record<LocaleCode, 'ltr' | 'rtl'> = {
  en: 'ltr',
  'ar-EG': 'rtl',
  it: 'ltr',
  el: 'ltr',
  fr: 'ltr',
};

export function staticDirectionFor(locale: LocaleCode): 'ltr' | 'rtl' {
  return STATIC_DIRECTION[locale];
}

export function isSupportedLocale(value: string): value is LocaleCode {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

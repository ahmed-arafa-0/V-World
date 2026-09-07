import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FALLBACK_LOCALE, staticDirectionFor, type LocaleCode } from './locales';

interface LocaleState {
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
}

/**
 * Persisted (localStorage-backed) current-locale selection. Switching
 * locale never reloads the page — every subscriber re-renders from this
 * store, and `document.documentElement.lang` is kept in sync here as a
 * side effect. `document.documentElement.dir` is set by
 * `ContentRuntimeLab` instead, once real 07_LANGUAGES direction data has
 * loaded — this store only applies a static best-effort default so a
 * stale document isn't left un-set before that data arrives.
 */
export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: FALLBACK_LOCALE,
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'vw_locale', partialize: (state) => ({ locale: state.locale }) },
  ),
);

function applyDocumentLang(locale: LocaleCode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  // Best-effort default; `ContentRuntimeLab` overrides this synchronously
  // afterward with the authoritative 07_LANGUAGES direction once loaded.
  document.documentElement.dir = staticDirectionFor(locale);
}

applyDocumentLang(useLocaleStore.getState().locale);
useLocaleStore.subscribe((state) => applyDocumentLang(state.locale));

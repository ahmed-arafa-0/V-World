import type { LocaleCode } from '../../i18n/locales';

/**
 * Last-resort localized labels for the "Continue" action that now paces
 * text-only narration (Ahmed's 2026-09-17 voice-over-removal decision,
 * requirement 3: "provide a localized Continue action after the text is
 * fully shown"). `resolveUiText(uiText, 'action_continue', locale)` is
 * always tried first — this dictionary only covers the gap while that
 * `08_UI_TEXT` row doesn't exist yet, so the app's single most-used control
 * never shows the generic "(Translation not yet available)" placeholder.
 * This is structural UI chrome (a button label), not narrative content —
 * the same category as the already-hardcoded "Enter"/"Log out" labels
 * elsewhere in this app — kept to the five already-approved locales only.
 */
const CONTINUE_LABELS: Record<LocaleCode, string> = {
  en: 'Continue',
  'ar-EG': 'متابعة',
  it: 'Continua',
  el: 'Συνέχεια',
  fr: 'Continuer',
};

export function staticContinueLabel(locale: LocaleCode): string {
  return CONTINUE_LABELS[locale];
}

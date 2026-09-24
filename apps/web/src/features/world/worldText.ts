import {
  WORLD_UI_TEXT,
  type RuntimeUiTextEntry,
  type WorldTextKey,
} from '@veoullas-world/contracts';
import { resolveUiText } from '../../i18n/resolveText';
import type { LocaleCode } from '../../i18n/locales';

const ORDER: LocaleCode[] = ['en', 'ar-EG', 'it', 'el', 'fr'];

/** Sheet-first label (`world_<key>` in 08_UI_TEXT), with the shared five-language fallback. */
export function worldText(
  key: WorldTextKey,
  locale: LocaleCode,
  entries: RuntimeUiTextEntry[] = [],
): string {
  const resolved = resolveUiText(entries, `world_${key}`, locale);
  if (!resolved.isMissing) return resolved.text;
  const labels = WORLD_UI_TEXT[key];
  return labels[Math.max(0, ORDER.indexOf(locale))] ?? labels[0];
}

export type { WorldTextKey };

/** Neutral stand-ins used until the player's chosen name for the companion is known. */
const NEUTRAL_COMPANION: Record<LocaleCode, string> = {
  en: 'your companion',
  'ar-EG': 'رفيقك',
  it: 'il tuo compagno',
  el: 'ο σύντροφός σου',
  fr: 'ton compagnon',
};

/**
 * The story text names the companion by its internal name ("VAR"). What the player sees is the name
 * they chose (or a neutral, localized stand-in when it is not available). Only the standalone word is
 * replaced, so "VARcade" and any stored value are left alone.
 */
export function withCompanionName(text: string, name: string | null, locale: LocaleCode): string {
  // Only the standalone word: not "VARcade", not part of a longer identifier.
  const standalone = /(^|[^A-Za-z0-9_])VAR(?![A-Za-z0-9_])/g;
  if (!standalone.test(text)) return text;
  const shown = name?.trim() || NEUTRAL_COMPANION[locale] || NEUTRAL_COMPANION.en;
  return text.replace(/(^|[^A-Za-z0-9_])VAR(?![A-Za-z0-9_])/g, (_m, lead: string) => lead + shown);
}

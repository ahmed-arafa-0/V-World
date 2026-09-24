import type { RuntimeUiTextEntry } from '@veoullas-world/contracts';
import { resolveUiText } from '../../i18n/resolveText';
import type { LocaleCode } from '../../i18n/locales';
import { staticContinueLabel } from './continueLabels';

export interface ContinueButtonProps {
  uiText: RuntimeUiTextEntry[];
  locale: LocaleCode;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  className?: string;
}

/**
 * The one localized "Continue" action that now paces text progression in
 * place of audio duration (Ahmed's 2026-09-17 voice-over-removal decision,
 * requirement 3). Sheet-first: resolves `action_continue` from `08_UI_TEXT`
 * via the same fallback chain every other UI text uses; only falls back to
 * a small static five-locale dictionary (`continueLabels.ts`) when that row
 * doesn't exist yet, so this always-visible control never shows a raw
 * "(Translation not yet available)" placeholder.
 */
export function ContinueButton({
  uiText,
  locale,
  onClick,
  disabled,
  testId = 'continue-button',
  className,
}: ContinueButtonProps) {
  const resolved = resolveUiText(uiText, 'action_continue', locale);
  const label = resolved.isMissing ? staticContinueLabel(locale) : resolved.text;

  return (
    <button
      type="button"
      className={className}
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}

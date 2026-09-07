import { describe, expect, it } from 'vitest';
import type { RuntimeUiTextEntry } from '@veoullas-world/contracts';
import { resolveUiText } from '../src/i18n/resolveText';

const ENTRIES: RuntimeUiTextEntry[] = [
  {
    uiTextRowId: 'row_en',
    textId: 'greeting',
    screenId: 'lab',
    componentId: 'title',
    locale: 'en',
    text: 'Hello',
    direction: 'ltr',
    ariaLabel: 'Greeting',
  },
  {
    uiTextRowId: 'row_ar',
    textId: 'greeting',
    screenId: 'lab',
    componentId: 'title',
    locale: 'ar-EG',
    text: 'أهلاً',
    direction: 'rtl',
    ariaLabel: 'تحية',
  },
  {
    uiTextRowId: 'row_incomplete_ar',
    textId: 'incomplete',
    screenId: 'lab',
    componentId: 'note',
    locale: 'ar-EG',
    text: 'ملاحظة',
    direction: 'rtl',
    ariaLabel: 'note',
  },
];

describe('resolveUiText', () => {
  it('returns the exact-locale row when present', () => {
    const result = resolveUiText(ENTRIES, 'greeting', 'ar-EG');
    expect(result).toEqual({
      text: 'أهلاً',
      direction: 'rtl',
      isFallback: false,
      isMissing: false,
    });
  });

  it('falls back to English when the requested locale is missing', () => {
    const result = resolveUiText(ENTRIES, 'greeting', 'fr');
    expect(result.text).toBe('Hello');
    expect(result.direction).toBe('ltr');
    expect(result.isFallback).toBe(true);
    expect(result.isMissing).toBe(false);
  });

  it('never returns the raw text_id when both the locale and English are missing', () => {
    const result = resolveUiText(ENTRIES, 'incomplete', 'fr');
    expect(result.isMissing).toBe(true);
    expect(result.text).not.toBe('incomplete');
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('does not report a fallback when English itself is the requested locale', () => {
    const result = resolveUiText(ENTRIES, 'greeting', 'en');
    expect(result.isFallback).toBe(false);
    expect(result.text).toBe('Hello');
  });

  it('returns a safe missing placeholder for a completely unknown text_id', () => {
    const result = resolveUiText(ENTRIES, 'never_configured', 'en');
    expect(result.isMissing).toBe(true);
    expect(result.text).not.toContain('never_configured');
  });
});

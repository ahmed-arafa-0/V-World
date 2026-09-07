import { beforeEach, describe, expect, it } from 'vitest';
import { useLocaleStore } from '../src/i18n/localeStore';

beforeEach(() => {
  useLocaleStore.setState({ locale: 'en' });
  document.documentElement.lang = '';
  document.documentElement.dir = '';
});

describe('useLocaleStore', () => {
  it('defaults to English', () => {
    expect(useLocaleStore.getState().locale).toBe('en');
  });

  it('setLocale updates document.documentElement.lang', () => {
    useLocaleStore.getState().setLocale('fr');
    expect(document.documentElement.lang).toBe('fr');
  });

  it('setLocale updates document.documentElement.dir using the static direction map', () => {
    useLocaleStore.getState().setLocale('ar-EG');
    expect(document.documentElement.dir).toBe('rtl');

    useLocaleStore.getState().setLocale('it');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('persists the selected locale to localStorage', () => {
    useLocaleStore.getState().setLocale('el');
    const raw = window.localStorage.getItem('vw_locale');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).state.locale).toBe('el');
  });

  it('switching locale does not touch window.location (no reload)', () => {
    const originalHref = window.location.href;
    useLocaleStore.getState().setLocale('fr');
    useLocaleStore.getState().setLocale('ar-EG');
    expect(window.location.href).toBe(originalHref);
  });
});

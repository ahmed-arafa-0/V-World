import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CANONICAL_GENDERS, readStoredGender } from '@veoullas-world/contracts';
import { Junction } from '../src/features/world/views/Junction';
import { WorldEnvProvider, type WorldEnv } from '../src/features/world/WorldContext';
import { worldText } from '../src/features/world/worldText';
import { useLocaleStore } from '../src/i18n/localeStore';

afterEach(() => {
  useLocaleStore.setState({ locale: 'en' });
});

function renderJunction(open: string[], locale: 'en' | 'ar-EG' = 'en') {
  const handlers = { onChurch: vi.fn(), onCafe: vi.fn(), onAhead: vi.fn(), onBack: vi.fn() };
  const env = {
    locale,
    icons: [],
    assets: [],
    journey: { accessibleLocations: open },
    t: (key: Parameters<typeof worldText>[0]) => worldText(key, locale),
    assetRef: () => null,
  } as unknown as WorldEnv;
  render(
    <WorldEnvProvider value={env}>
      <Junction {...handlers} />
    </WorldEnvProvider>,
  );
  return handlers;
}

describe('Church / Café junction', () => {
  it('offers Church on the left, Café on the right and the road ahead, plus a way back', () => {
    renderJunction(['beach', 'church']);
    const x = (id: string) =>
      Number((screen.getByTestId(id).parentElement as HTMLElement).style.left.replace('%', ''));
    expect(x('junction-church')).toBeLessThan(x('junction-ahead'));
    expect(x('junction-ahead')).toBeLessThan(x('junction-cafe'));
    expect(screen.getByTestId('junction-back')).toBeInTheDocument();
    expect(screen.getByTestId('junction-church')).toHaveAccessibleName('Church, on the left');
  });

  it('keeps the geography physical in Arabic (Church still left of Café)', () => {
    renderJunction(['beach', 'church'], 'ar-EG');
    const left = (id: string) => (screen.getByTestId(id).parentElement as HTMLElement).style.left;
    expect(parseFloat(left('junction-church'))).toBeLessThan(parseFloat(left('junction-cafe')));
    expect(screen.getByTestId('junction-church')).toHaveAccessibleName('الكنيسة على الشمال');
  });

  it('is purely physical: Church, Café and the road ahead are all walkable before the story reaches them', async () => {
    const user = userEvent.setup();
    const h = renderJunction(['beach', 'church']);
    await user.click(screen.getByTestId('junction-church'));
    await user.click(screen.getByTestId('junction-cafe'));
    await user.click(screen.getByTestId('junction-ahead'));
    await user.click(screen.getByTestId('junction-back'));
    expect(h.onChurch).toHaveBeenCalledTimes(1);
    expect(h.onCafe).toHaveBeenCalledTimes(1);
    expect(h.onAhead).toHaveBeenCalledTimes(1);
    expect(h.onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('junction-cafe')).not.toHaveAttribute('aria-disabled');
  });

  it('supports the keyboard: Left/Right/Up/Down are physical directions', async () => {
    const user = userEvent.setup();
    const h = renderJunction(['beach', 'church', 'cafe', 'arcade']);
    await user.keyboard('{ArrowRight}');
    expect(h.onCafe).toHaveBeenCalledTimes(1);
    await user.keyboard('{ArrowLeft}');
    expect(h.onChurch).toHaveBeenCalledTimes(1);
    await user.keyboard('{ArrowUp}');
    expect(h.onAhead).toHaveBeenCalledTimes(1);
    await user.keyboard('{ArrowDown}');
    expect(h.onBack).toHaveBeenCalledTimes(1);
  });
});

describe('companion gender values', () => {
  it('has exactly two canonical values and reads legacy text without assigning one', () => {
    expect(CANONICAL_GENDERS).toEqual(['male', 'female']);
    expect(readStoredGender('Female')).toBe('female');
    expect(readStoredGender('nonbinary')).toBeNull();
    expect(readStoredGender('')).toBeNull();
    expect(readStoredGender(undefined)).toBeNull();
  });

  it('labels both options in all five languages', () => {
    for (const locale of ['en', 'ar-EG', 'it', 'el', 'fr'] as const) {
      expect(worldText('gender_male', locale)).not.toBe(worldText('gender_female', locale));
    }
    expect(worldText('gender_female', 'ar-EG')).toBe('أنثى');
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { RuntimeIconEntry } from '@veoullas-world/contracts';
import { SceneIcon } from '../src/components/SceneIcon';
import { useLocaleStore } from '../src/i18n/localeStore';

const authored = (over: Partial<RuntimeIconEntry> = {}): RuntimeIconEntry => ({
  iconId: 'icon_walk_forward',
  category: 'ui',
  displayName: 'Walk forward',
  mediaRef: '/api/media/asset_icon_walk_forward?v=1',
  format: 'svg',
  rtlMirror: false,
  altTextId: 'ui_forward',
  ...over,
});

describe('SceneIcon', () => {
  beforeEach(() => useLocaleStore.getState().setLocale('en'));

  it('falls back to a crisp inline SVG when 09_ICONS has no usable row', () => {
    render(<SceneIcon slot="walk_forward" icons={[authored({ iconId: 'icon_map' })]} />);
    const icon = screen.getByTestId('icon-walk_forward');
    expect(icon.tagName.toLowerCase()).toBe('svg');
    expect(icon).toHaveAttribute('data-icon-source', 'fallback');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon.textContent).toBe('');
  });

  it('ignores a Sheet row whose asset did not resolve (mediaRef null) instead of showing a broken image', () => {
    render(<SceneIcon slot="walk_forward" icons={[authored({ mediaRef: null })]} />);
    expect(screen.getByTestId('icon-walk_forward')).toHaveAttribute('data-icon-source', 'fallback');
  });

  it('uses the Sheet-authored artwork when the row resolves', () => {
    render(<SceneIcon slot="walk_forward" icons={[authored()]} />);
    const icon = screen.getByTestId('icon-walk_forward');
    expect(icon.tagName.toLowerCase()).toBe('img');
    expect(icon).toHaveAttribute('src', '/api/media/asset_icon_walk_forward?v=1');
    expect(icon).toHaveAttribute('data-icon-source', 'sheet');
  });

  it('mirrors authored artwork only in RTL and only when the row asks for it', () => {
    useLocaleStore.getState().setLocale('ar-EG');
    const { rerender } = render(<SceneIcon slot="walk_forward" icons={[authored()]} />);
    expect(screen.getByTestId('icon-walk_forward')).not.toHaveStyle({ transform: 'scaleX(-1)' });
    rerender(<SceneIcon slot="walk_forward" icons={[authored({ rtlMirror: true })]} />);
    expect(screen.getByTestId('icon-walk_forward')).toHaveStyle({ transform: 'scaleX(-1)' });
  });

  it('falls back to the inline glyph if the authored image fails to load', () => {
    render(<SceneIcon slot="walk_forward" icons={[authored()]} />);
    fireEvent.error(screen.getByTestId('icon-walk_forward'));
    const icon = screen.getByTestId('icon-walk_forward');
    expect(icon.tagName.toLowerCase()).toBe('svg');
    expect(icon).toHaveAttribute('data-icon-source', 'fallback');
  });
});

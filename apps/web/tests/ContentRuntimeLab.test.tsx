import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContentRuntimeLab } from '../src/features/content-lab/ContentRuntimeLab';
import { useLocaleStore } from '../src/i18n/localeStore';
import { installMockFetch } from './helpers/mockApi';

beforeEach(() => {
  useLocaleStore.setState({ locale: 'en' });
  document.documentElement.lang = '';
  document.documentElement.dir = '';
});

function renderLab() {
  installMockFetch({ ownerSession: 'authenticated' });
  return render(<ContentRuntimeLab />);
}

describe('ContentRuntimeLab — loading and rendering', () => {
  it('shows a loading state before the content-runtime fetch resolves', () => {
    renderLab();
    expect(screen.getByText(/loading content runtime/i)).toBeInTheDocument();
  });

  it('renders once loaded, with a five-language switcher', async () => {
    renderLab();
    const switcher = await screen.findByTestId('locale-switcher');
    const buttons = within(switcher).getAllByRole('button');
    expect(buttons).toHaveLength(5);
    for (const localeId of ['en', 'ar-EG', 'it', 'el', 'fr']) {
      expect(screen.getByTestId(`locale-button-${localeId}`)).toBeInTheDocument();
    }
  });

  it('shows the current locale and direction, defaulting to English/LTR', async () => {
    renderLab();
    const status = await screen.findByTestId('current-locale-direction');
    expect(status).toHaveTextContent('en');
    expect(status).toHaveTextContent('ltr');
  });

  it('shows a Sheet-driven UI text sample resolved for the current locale', async () => {
    renderLab();
    const entry = await screen.findByTestId('ui-text-content_lab_title');
    expect(entry).toHaveTextContent('Content Runtime Lab');
  });

  it('shows a localized dialogue/caption example', async () => {
    renderLab();
    const dialogue = await screen.findByTestId('dialogue-example');
    expect(dialogue).toHaveTextContent('Hello, Veoulla.');
  });
});

describe('ContentRuntimeLab — switching locale (no reload)', () => {
  it('switches all five languages without navigating/reloading the page', async () => {
    renderLab();
    await screen.findByTestId('locale-switcher');
    const user = userEvent.setup();
    const originalHref = window.location.href;

    for (const localeId of ['ar-EG', 'it', 'el', 'fr', 'en']) {
      await user.click(screen.getByTestId(`locale-button-${localeId}`));
      expect(await screen.findByTestId('current-locale-direction')).toHaveTextContent(localeId);
    }

    expect(window.location.href).toBe(originalHref);
  });

  it('updates document.documentElement.lang and dir when Arabic is selected, and back to LTR for Italian', async () => {
    renderLab();
    await screen.findByTestId('locale-switcher');
    const user = userEvent.setup();

    await user.click(screen.getByTestId('locale-button-ar-EG'));
    expect(await screen.findByTestId('current-locale-direction')).toHaveTextContent('rtl');
    expect(document.documentElement.lang).toBe('ar-EG');
    expect(document.documentElement.dir).toBe('rtl');

    await user.click(screen.getByTestId('locale-button-it'));
    expect(await screen.findByTestId('current-locale-direction')).toHaveTextContent('ltr');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('persists the selected language across a remount (localStorage)', async () => {
    const { unmount } = renderLab();
    await screen.findByTestId('locale-switcher');
    const user = userEvent.setup();
    await user.click(screen.getByTestId('locale-button-fr'));
    expect(await screen.findByTestId('current-locale-direction')).toHaveTextContent('fr');
    unmount();

    installMockFetch({ ownerSession: 'authenticated' });
    render(<ContentRuntimeLab />);
    expect(await screen.findByTestId('current-locale-direction')).toHaveTextContent('fr');
  });

  it('falls back safely to English for a UI text row missing in the current locale, without showing the raw key', async () => {
    renderLab();
    await screen.findByTestId('locale-switcher');
    const user = userEvent.setup();

    // content_lab_incomplete only has an Arabic row in the sample response — no English fallback exists.
    await user.click(screen.getByTestId('locale-button-en'));
    const entry = await screen.findByTestId('ui-text-content_lab_incomplete');
    expect(entry.textContent).not.toContain('content_lab_incomplete');
    expect(entry).toHaveTextContent(/no content configured/i);
  });

  it('falls back to the English dialogue line when the current locale has none', async () => {
    renderLab();
    await screen.findByTestId('locale-switcher');
    const user = userEvent.setup();

    await user.click(screen.getByTestId('locale-button-fr'));
    const dialogue = await screen.findByTestId('dialogue-example');
    expect(dialogue).toHaveTextContent('Hello, Veoulla.');
  });
});

describe('ContentRuntimeLab — icon mirroring is Sheet-driven, not automatic', () => {
  it('mirrors the Back icon only in RTL, and never mirrors an icon whose row does not opt in', async () => {
    renderLab();
    await screen.findByTestId('locale-switcher');
    const user = userEvent.setup();

    const backEn = await screen.findByTestId('icon-sample-icon_back');
    expect(backEn).toHaveAttribute('data-mirrored', 'false');
    const mapEn = screen.getByTestId('icon-sample-icon_map');
    expect(mapEn).toHaveAttribute('data-mirrored', 'false');

    await user.click(screen.getByTestId('locale-button-ar-EG'));

    const backAr = await screen.findByTestId('icon-sample-icon_back');
    expect(backAr).toHaveAttribute('data-mirrored', 'true');
    const mapAr = screen.getByTestId('icon-sample-icon_map');
    expect(mapAr).toHaveAttribute('data-mirrored', 'false');
  });
});

describe('ContentRuntimeLab — asset status and diagnostics', () => {
  it('shows asset status metadata without ever leaking a raw Drive file ID', async () => {
    renderLab();
    const assetList = await screen.findByTestId('asset-status-list');
    expect(assetList).toHaveTextContent('asset_icon_map');
    expect(document.body.textContent).not.toMatch(/fake_drive_id/i);
    expect(document.body.textContent).not.toMatch(/DRIVE_FILE_ID/);
  });

  it('never renders a voice-over status list — narration/dialogue is text-only', async () => {
    renderLab();
    await screen.findByTestId('asset-status-list');
    expect(screen.queryByTestId('voiceover-status-list')).not.toBeInTheDocument();
  });

  it('surfaces content diagnostics for missing English fallback without leaking disabled content', async () => {
    renderLab();
    const diagnostics = await screen.findByTestId('content-diagnostics');
    expect(diagnostics).toHaveTextContent('MISSING_ENGLISH_FALLBACK');
  });
});

describe('ContentRuntimeLab — offline fallback', () => {
  it('shows a retry control when the content-runtime fetch fails', async () => {
    installMockFetch({ ownerSession: 'authenticated' });
    const realFetch = global.fetch as typeof fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.startsWith('/api/content/runtime')) {
          throw new Error('network down');
        }
        return realFetch(input, init);
      }),
    );

    render(<ContentRuntimeLab />);
    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not load content runtime/i);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NarrativeRuntimeLab } from '../src/features/content-lab/NarrativeRuntimeLab';
import { useLocaleStore } from '../src/i18n/localeStore';
import { installMockFetch, SAMPLE_CONTENT_RUNTIME_RESPONSE } from './helpers/mockApi';

beforeEach(() => {
  useLocaleStore.setState({ locale: 'en' });
});

function renderLab(contentRuntimeResult?: unknown) {
  installMockFetch({ ownerSession: 'authenticated', contentRuntimeResult });
  return render(<NarrativeRuntimeLab />);
}

describe('NarrativeRuntimeLab — loading and rendering', () => {
  it('shows a loading state before the content-runtime fetch resolves', () => {
    renderLab();
    expect(screen.getByText(/loading narration\/dialogue runtime/i)).toBeInTheDocument();
  });

  it('renders a five-language switcher once loaded', async () => {
    renderLab();
    const switcher = await screen.findByTestId('narrative-locale-switcher');
    for (const localeId of ['en', 'ar-EG', 'it', 'el', 'fr']) {
      expect(
        switcher.querySelector(`[data-testid="narrative-locale-button-${localeId}"]`),
      ).toBeInTheDocument();
    }
  });

  it('renders one demo section per distinct dialogue_id in the response, as text only', async () => {
    renderLab();
    const section = await screen.findByTestId('narrative-demo-dlg_boot');
    expect(section).toHaveTextContent('Hello, Veoulla.');
    expect(section.querySelector('audio')).toBeNull();
  });

  it('shows the text in English by default', async () => {
    renderLab();
    const section = await screen.findByTestId('narrative-demo-dlg_boot');
    expect(section.querySelector('[data-testid="dialogue-text-line"]')).toHaveTextContent(
      'Hello, Veoulla.',
    );
  });
});

describe('NarrativeRuntimeLab — switching locale', () => {
  it('shows an English-fallback text and note when the selected locale has no row for a cue', async () => {
    renderLab();
    await screen.findByTestId('narrative-demo-dlg_boot');

    const user = userEvent.setup();
    await user.click(screen.getByTestId('narrative-locale-button-ar-EG'));

    const section = await screen.findByTestId('narrative-demo-dlg_boot');
    expect(section.querySelector('[data-testid="dialogue-text-line"]')).toHaveTextContent(
      'Hello, Veoulla.',
    );
    expect(
      section.querySelector('[data-testid="dialogue-text-fallback-note"]'),
    ).toBeInTheDocument();
  });

  it("sets the lab-level dir to the selected language's own direction, independent of any per-cue fallback", async () => {
    renderLab();
    await screen.findByTestId('narrative-demo-dlg_boot');

    const user = userEvent.setup();
    await user.click(screen.getByTestId('narrative-locale-button-ar-EG'));

    expect(await screen.findByTestId('narrative-runtime-lab')).toHaveAttribute('dir', 'rtl');
  });
});

describe('NarrativeRuntimeLab — no dialogue configured', () => {
  it('shows a clear message rather than an empty screen', async () => {
    renderLab({ ...SAMPLE_CONTENT_RUNTIME_RESPONSE, dialogue: [] });
    expect(await screen.findByTestId('narrative-no-dialogue')).toBeInTheDocument();
  });
});

describe('NarrativeRuntimeLab — offline', () => {
  it('shows a retry control on failure', async () => {
    installMockFetch({ ownerSession: 'authenticated' });
    const originalFetch = global.fetch;
    global.fetch = (async () => {
      throw new Error('network down');
    }) as typeof fetch;

    render(<NarrativeRuntimeLab />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /could not load narration\/dialogue/i,
    );
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();

    global.fetch = originalFetch;
  });
});

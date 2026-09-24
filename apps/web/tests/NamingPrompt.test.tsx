import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NamingPrompt } from '../src/features/first-opening/NamingPrompt';
import { installMockFetch, SAMPLE_CONTENT_RUNTIME_RESPONSE } from './helpers/mockApi';

const VAR_ASSETS = [
  {
    assetId: 'var_idle_no_collar',
    assetType: 'image' as const,
    version: 1,
    preloadPriority: 1,
    hasMobileVariant: false,
    hasPosterVariant: false,
    mediaRef: '/api/media/var_idle_no_collar?v=1',
  },
  {
    assetId: 'var_idle_collar',
    assetType: 'image' as const,
    version: 1,
    preloadPriority: 1,
    hasMobileVariant: false,
    hasPosterVariant: false,
    mediaRef: '/api/media/var_idle_collar?v=1',
  },
];

describe('NamingPrompt', () => {
  it('shows the real (fixture) naming dialogue line and open-ended name/presentation inputs', async () => {
    installMockFetch({ ownerSession: 'authenticated' });
    render(<NamingPrompt onNamed={vi.fn()} />);

    expect(await screen.findByTestId('dialogue-text-line')).toHaveTextContent(
      /naming prompt line/i,
    );
    expect(screen.getByTestId('naming-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('naming-gender-male')).toBeInTheDocument();
    expect(screen.getByTestId('naming-gender-female')).toBeInTheDocument();
  });

  it("never shows VAR's internal system name anywhere", async () => {
    installMockFetch({ ownerSession: 'authenticated' });
    const { container } = render(<NamingPrompt onNamed={vi.fn()} />);
    await screen.findByTestId('naming-prompt');
    expect(container.textContent).not.toMatch(/\bVAR\b/);
  });

  it('rejects a blank name without calling the backend', async () => {
    installMockFetch({ ownerSession: 'authenticated' });
    render(<NamingPrompt onNamed={vi.fn()} />);
    await screen.findByTestId('naming-prompt');

    const user = userEvent.setup();
    await user.click(screen.getByTestId('naming-submit'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/please choose a name/i);
  });

  it('submits the chosen name/gender, shows the collar update, then continues', async () => {
    installMockFetch({ ownerSession: 'authenticated' });
    const onNamed = vi.fn();
    render(<NamingPrompt onNamed={onNamed} />);
    await screen.findByTestId('naming-prompt');

    const user = userEvent.setup();
    await user.type(screen.getByTestId('naming-name-input'), 'Luna');
    await user.click(screen.getByTestId('naming-gender-female'));
    await user.click(screen.getByTestId('naming-submit'));

    expect(await screen.findByTestId('collar-name')).toHaveTextContent('Luna');
    expect(onNamed).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('naming-continue'));
    expect(onNamed).toHaveBeenCalledWith('Luna');
  });

  it('shows the real before/after collar character art once registered, never before', async () => {
    installMockFetch({
      ownerSession: 'authenticated',
      contentRuntimeResult: {
        ...SAMPLE_CONTENT_RUNTIME_RESPONSE,
        assets: [...SAMPLE_CONTENT_RUNTIME_RESPONSE.assets, ...VAR_ASSETS],
      },
    });
    render(<NamingPrompt onNamed={vi.fn()} />);
    await screen.findByTestId('naming-prompt');

    expect(screen.getByTestId('naming-character-no-collar')).toHaveAttribute(
      'src',
      '/api/media/var_idle_no_collar?v=1',
    );
    expect(screen.queryByTestId('naming-character-collar')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByTestId('naming-name-input'), 'Luna');
    await user.click(screen.getByTestId('naming-gender-female'));
    await user.click(screen.getByTestId('naming-submit'));

    await screen.findByTestId('collar-name');
    expect(screen.getByTestId('naming-character-collar')).toHaveAttribute(
      'src',
      '/api/media/var_idle_collar?v=1',
    );
  });

  it('shows a retry-able error when saving fails', async () => {
    installMockFetch({
      ownerSession: 'authenticated',
      characterNameResult: { ok: false, code: 'invalid_request', message: 'nope' },
    });
    render(<NamingPrompt onNamed={vi.fn()} />);
    await screen.findByTestId('naming-prompt');

    const user = userEvent.setup();
    await user.type(screen.getByTestId('naming-name-input'), 'Luna');
    await user.click(screen.getByTestId('naming-gender-female'));
    await user.click(screen.getByTestId('naming-submit'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not save/i);
  });
});

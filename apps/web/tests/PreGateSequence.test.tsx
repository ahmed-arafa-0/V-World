import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PreGateSequence } from '../src/features/first-opening/PreGateSequence';
import { installMockFetch, SAMPLE_PRE_GATE_CONTENT_RESPONSE } from './helpers/mockApi';

function renderSequence(onComplete = vi.fn()) {
  installMockFetch(); // no owner session — this endpoint must work unauthenticated
  render(<PreGateSequence onComplete={onComplete} />);
  return onComplete;
}

describe('PreGateSequence — works without any owner session (public endpoint)', () => {
  it('loads and shows the black opening first, with no VAR visual yet', async () => {
    renderSequence();
    const sequence = await screen.findByTestId('pre-gate-sequence');
    expect(sequence).toHaveAttribute('data-phase', 'opening');
    expect(screen.getByTestId('pre-gate-black-opening')).toBeInTheDocument();
    expect(screen.queryByTestId('var-reveal-placeholder')).not.toBeInTheDocument();
  });

  it('runs black opening → Sheet title → unseen dialogue in order', async () => {
    renderSequence();
    await screen.findByTestId('pre-gate-sequence');
    const user = userEvent.setup();
    await user.click(screen.getByTestId('pre-gate-continue'));
    expect(screen.getByTestId('pre-gate-title')).toHaveTextContent("Veoulla's World");
    await user.click(screen.getByTestId('pre-gate-continue'));
    expect(screen.getByTestId('dialogue-text-line')).toHaveTextContent(/gate opening line/i);
  });
});

describe('PreGateSequence — unseen then reveal', () => {
  it('advances to the reveal phase (VAR visible) on Continue, then completes on the next Continue', async () => {
    const onComplete = renderSequence();
    await screen.findByTestId('pre-gate-sequence');
    const user = userEvent.setup();

    await user.click(screen.getByTestId('pre-gate-continue'));
    await user.click(screen.getByTestId('pre-gate-continue'));
    await user.click(screen.getByTestId('pre-gate-continue'));
    expect(screen.getByTestId('pre-gate-sequence')).toHaveAttribute('data-phase', 'reveal');
    expect(screen.getByTestId('var-reveal-placeholder')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('pre-gate-continue'));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('never invents a second line of dialogue for the reveal beat — only the visual placeholder changes', async () => {
    renderSequence();
    await screen.findByTestId('pre-gate-sequence');
    const user = userEvent.setup();
    await user.click(screen.getByTestId('pre-gate-continue'));
    await user.click(screen.getByTestId('pre-gate-continue'));
    const captionBefore = screen.getByTestId('dialogue-text-line').textContent;

    await user.click(screen.getByTestId('pre-gate-continue'));

    expect(screen.getByTestId('dialogue-text-line').textContent).toBe(captionBefore);
  });
});

describe('PreGateSequence — reveal companion art', () => {
  it('shows the real companion image once var_idle_no_collar is registered/enabled, replacing the emoji placeholder', async () => {
    installMockFetch({
      preGateContentResult: {
        ...SAMPLE_PRE_GATE_CONTENT_RESPONSE,
        assets: [
          {
            assetId: 'var_idle_no_collar',
            assetType: 'image',
            version: 1,
            preloadPriority: 2,
            hasMobileVariant: false,
            hasPosterVariant: false,
            mediaRef: '/api/public-media/var_idle_no_collar?v=1',
          },
        ],
      },
    });
    render(<PreGateSequence onComplete={vi.fn()} />);
    await screen.findByTestId('pre-gate-sequence');
    const user = userEvent.setup();

    await user.click(screen.getByTestId('pre-gate-continue'));
    await user.click(screen.getByTestId('pre-gate-continue'));
    await user.click(screen.getByTestId('pre-gate-continue'));

    expect(screen.getByTestId('var-reveal-image')).toHaveAttribute(
      'src',
      '/api/public-media/var_idle_no_collar?v=1',
    );
    expect(screen.queryByText(/dev placeholder — no final art yet/i)).not.toBeInTheDocument();
  });
});

describe('PreGateSequence — offline', () => {
  it('shows a retry control on failure', async () => {
    installMockFetch();
    const originalFetch = global.fetch;
    global.fetch = (async () => {
      throw new Error('network down');
    }) as typeof fetch;

    render(<PreGateSequence onComplete={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not connect/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();

    global.fetch = originalFetch;
  });
});

describe('PreGateSequence — no empty dialogue panel', () => {
  it('shows only a bare Continue (no panel) on the black opening and the title', async () => {
    renderSequence();
    await screen.findByTestId('pre-gate-sequence');
    const user = userEvent.setup();
    expect(screen.queryByTestId('dialogue-text')).not.toBeInTheDocument();
    expect(screen.getByTestId('pre-gate-continue').parentElement?.className).toMatch(
      /bareContinue/,
    );
    await user.click(screen.getByTestId('pre-gate-continue'));
    expect(screen.getByTestId('pre-gate-continue').parentElement?.className).toMatch(
      /bareContinue/,
    );
    await user.click(screen.getByTestId('pre-gate-continue'));
    expect(screen.getByTestId('pre-gate-continue').parentElement?.className).not.toMatch(
      /bareContinue/,
    );
  });
});

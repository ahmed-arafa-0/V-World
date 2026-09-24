import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DoorsOpeningTransition } from '../src/features/first-opening/DoorsOpeningTransition';
import { installMockFetch, SAMPLE_CONTENT_RUNTIME_RESPONSE } from './helpers/mockApi';

describe('DoorsOpeningTransition', () => {
  it('does not expose engineering messages while artwork loads', () => {
    render(<DoorsOpeningTransition onContinue={vi.fn()} />);
    const transition = screen.getByTestId('doors-opening-transition');
    expect(transition).toHaveAttribute('data-placeholder', 'true');
    expect(transition).not.toHaveTextContent(/dev placeholder/i);
  });

  it('calls onContinue when the follow button is clicked', async () => {
    const onContinue = vi.fn();
    render(<DoorsOpeningTransition onContinue={onContinue} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('doors-opening-continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('renders the real Gate-ajar photo and VAR jump art once both are registered/enabled, dropping the placeholder', async () => {
    installMockFetch({
      ownerSession: 'authenticated',
      contentRuntimeResult: {
        ...SAMPLE_CONTENT_RUNTIME_RESPONSE,
        assets: [
          ...SAMPLE_CONTENT_RUNTIME_RESPONSE.assets,
          {
            assetId: 'gate_ajar_static_bg',
            assetType: 'image',
            version: 1,
            preloadPriority: 1,
            hasMobileVariant: true,
            hasPosterVariant: false,
            mediaRef: '/api/media/gate_ajar_static_bg?v=1',
          },
          {
            assetId: 'var_jump_no_collar',
            assetType: 'image',
            version: 1,
            preloadPriority: 1,
            hasMobileVariant: false,
            hasPosterVariant: false,
            mediaRef: '/api/media/var_jump_no_collar?v=1',
          },
        ],
      },
    });
    render(<DoorsOpeningTransition onContinue={vi.fn()} />);

    const photo = await screen.findByTestId('doors-opening-photo');
    expect(photo).toHaveAttribute('src', '/api/media/gate_ajar_static_bg?v=1');
    expect(screen.getByTestId('doors-opening-character')).toHaveAttribute(
      'src',
      '/api/media/var_jump_no_collar?v=1',
    );
    expect(screen.getByTestId('doors-opening-transition')).toHaveAttribute(
      'data-placeholder',
      'false',
    );
    expect(screen.queryByText(/dev placeholder/i)).not.toBeInTheDocument();
  });
});

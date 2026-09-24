import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BirthdayStateResponse } from '@veoullas-world/contracts';
import { BirthdayOverlay } from '../src/features/birthday/BirthdayOverlay';
import { birthdayApi } from '../src/features/birthday/birthdayClient';

vi.mock('../src/features/world/WorldContext', () => ({
  useWorld: () => ({ locale: 'en', t: (key: string) => key, assetRef: () => null }),
}));
vi.mock('../src/features/birthday/birthdayClient', () => ({
  birthdayApi: {
    get: vi.fn(),
    accept: vi.fn(),
    dismiss: vi.fn(),
    claimGifts: vi.fn(),
    complete: vi.fn(),
    skipWish: vi.fn(),
    extinguishCandle: vi.fn(),
  },
}));
function state(window: BirthdayStateResponse['window'] = 'live'): BirthdayStateResponse {
  return {
    ok: true,
    enabled: true,
    eventId: 'birthday_2026',
    window,
    targetAt: '2026-09-25T21:00:00.000Z',
    endAt: '2026-09-27T21:00:00.000Z',
    serverNow: '2026-09-26T00:00:00.000Z',
    timeZone: 'Africa/Cairo',
    stage: {
      dismissedAt: '',
      acceptedAt: '',
      wish: '',
      wishSkippedAt: '',
      candleExtinguished: false,
      giftsClaimed: false,
      completedAt: '',
      replayCount: 0,
    },
    cat: { name: 'Preview', gender: 'female' },
    letter: null,
    achievement: null,
    media: {
      gardenDesktopRef: null,
      gardenPortraitRef: null,
      cakeRef: null,
      decorationRef: null,
      candleUnlitRef: null,
      candleFlameRef: null,
    },
  };
}
let current: BirthdayStateResponse;
beforeEach(() => {
  current = state();
  vi.mocked(birthdayApi.get).mockImplementation(async () => ({ status: 'online', data: current }));
  vi.mocked(birthdayApi.accept).mockImplementation(async () => ({
    status: 'online',
    data: current,
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe('birthday invitations and replay', () => {
  it('late first arrival stays quiet but manual celebration is available', async () => {
    current = state('after');
    render(<BirthdayOverlay deferred={false} />);
    await screen.findByTestId('birthday-entry');
    expect(screen.queryByTestId('birthday-invitation')).toBeNull();
    fireEvent.click(screen.getByTestId('birthday-entry'));
    await screen.findByTestId('birthday-invitation');
    fireEvent.click(screen.getByTestId('birthday-celebrate-now'));
    await screen.findByTestId('birthday-countdown-step');
  });
  it('defers for Church/active game, then invites on the first eligible screen', async () => {
    const view = render(<BirthdayOverlay deferred />);
    await waitFor(() => expect(birthdayApi.get).toHaveBeenCalled());
    expect(screen.queryByTestId('birthday-invitation')).toBeNull();
    view.rerender(<BirthdayOverlay deferred={false} />);
    await screen.findByTestId('birthday-invitation');
  });
  it('scene-local dialogs defer invitation until closed', async () => {
    const view = render(
      <>
        <div role="dialog" aria-modal="true">
          Mailbox
        </div>
        <BirthdayOverlay deferred={false} />
      </>,
    );
    await waitFor(() => expect(birthdayApi.get).toHaveBeenCalled());
    expect(screen.queryByTestId('birthday-invitation')).toBeNull();
    view.rerender(<BirthdayOverlay deferred={false} />);
    await screen.findByTestId('birthday-invitation');
  });
  it('automatic invitation closes when the event ends', async () => {
    vi.useFakeTimers();
    render(<BirthdayOverlay deferred={false} />);
    await act(async () => {});
    expect(screen.getByTestId('birthday-invitation')).toBeTruthy();
    current = state('after');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.queryByTestId('birthday-invitation')).toBeNull();
    expect(screen.getByTestId('birthday-entry')).toBeTruthy();
  });
  it('countdown-only replay finishes without any gift or completion mutation', async () => {
    current.stage.giftsClaimed = true;
    current.stage.completedAt = current.serverNow;
    render(<BirthdayOverlay deferred={false} />);
    fireEvent.click(await screen.findByTestId('birthday-entry'));
    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId('birthday-replay-countdown-only'));
    expect(screen.getByTestId('birthday-countdown-number').textContent).toBe('20');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(screen.getByTestId('birthday-countdown-replay-step')).toBeTruthy();
    expect(screen.getByTestId('birthday-confetti').children).toHaveLength(40);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(screen.getByTestId('birthday-confetti').children).toHaveLength(40);
    fireEvent.click(screen.getByTestId('birthday-replay-countdown-only-close'));
    expect(screen.queryByTestId('birthday-confetti')).toBeNull();
    expect(screen.queryByTestId('birthday-countdown-replay-step')).toBeNull();
    expect(birthdayApi.claimGifts).not.toHaveBeenCalled();
    expect(birthdayApi.complete).not.toHaveBeenCalled();
    expect(birthdayApi.accept).not.toHaveBeenCalled();
  });
  it('keeps confetti through all celebration steps and closes only after completion saves', async () => {
    current.stage.giftsClaimed = true;
    current.stage.completedAt = current.serverNow;
    vi.mocked(birthdayApi.complete).mockResolvedValueOnce({ status: 'online', data: current });
    render(<BirthdayOverlay deferred={false} />);
    fireEvent.click(await screen.findByTestId('birthday-entry'));
    fireEvent.click(screen.getByTestId('birthday-replay-celebration'));
    fireEvent.click(screen.getByTestId('birthday-continue-reveal'));
    expect(screen.getByTestId('birthday-confetti')).toBeTruthy();
    fireEvent.click(screen.getByTestId('birthday-skip'));
    fireEvent.click(screen.getByTestId('birthday-continue-letter'));
    expect(screen.getByTestId('birthday-confetti')).toBeTruthy();
    fireEvent.click(screen.getByTestId('birthday-continue-gifts'));
    await waitFor(() => expect(screen.queryByTestId('birthday-gifts-step')).toBeNull());
    expect(screen.queryByTestId('birthday-confetti')).toBeNull();
    expect(screen.queryByTestId('birthday-complete-step')).toBeNull();
    expect(birthdayApi.complete).toHaveBeenCalledTimes(1);
  });
  it('full replay starts at the celebration and closing the menu does not mutate the journey', async () => {
    current.stage.giftsClaimed = true;
    current.stage.completedAt = current.serverNow;
    render(<BirthdayOverlay deferred={false} />);
    fireEvent.click(await screen.findByTestId('birthday-entry'));
    fireEvent.click(screen.getByTestId('birthday-menu-close'));
    fireEvent.click(screen.getByTestId('birthday-entry'));
    fireEvent.click(screen.getByTestId('birthday-replay-celebration'));
    expect(screen.getByTestId('birthday-reveal-step')).toBeTruthy();
    expect(birthdayApi.claimGifts).not.toHaveBeenCalled();
  });
});

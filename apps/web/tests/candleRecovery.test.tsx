import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChurchStateResponse } from '@veoullas-world/contracts';
import { ChurchView } from '../src/features/world/views/ChurchView';
import { WorldEnvProvider, type WorldEnv } from '../src/features/world/WorldContext';
import { worldApi } from '../src/features/world/worldClient';
import { worldText } from '../src/features/world/worldText';
import { readCandleOperation } from '../src/features/world/candleRecovery';
vi.mock('../src/features/world/worldClient', () => ({
  worldApi: { postIdempotent: vi.fn(), postHandled: vi.fn(), getOnce: vi.fn() },
}));
const state = (lit: string[] = [], added = false) =>
  ({
    ok: true,
    today: '2026-09-22',
    hymns: [],
    gallery: [],
    quiz: { questions: [] },
    candles: {
      slots: added ? ['candle_1', 'candle_a1'] : ['candle_1'],
      lit,
      preserved: [],
      capacity: 10,
      addRequests: {},
    },
    rewards: [],
  }) as unknown as ChurchStateResponse;
const online = (data: ChurchStateResponse) => ({ status: 'online' as const, data });
const offline = {
  status: 'offline' as const,
  message: 'Unknown outcome',
  retryable: true,
  unconfirmed: true,
};
const refreshJourney = vi.fn();
function mount() {
  const env = {
    userId: 'test-candle',
    locale: 'en',
    icons: [],
    assets: [],
    assetRef: () => null,
    t: (key: Parameters<typeof worldText>[0]) => worldText(key, 'en'),
    walkman: { silence: vi.fn() },
    notify: vi.fn(),
    showRewards: vi.fn(),
    refreshJourney,
  } as unknown as WorldEnv;
  return render(
    <WorldEnvProvider value={env}>
      <ChurchView onLeave={vi.fn()} />
    </WorldEnvProvider>,
  );
}
async function openCorner() {
  await userEvent.click(await screen.findByTestId('church-candle-corner'));
  await waitFor(() => expect(screen.getByTestId('candle-candle_1')).toBeEnabled());
}
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.resetAllMocks();
});
describe('candle recovery', () => {
  it('reconciles a successful write followed by failure, then retries light without toggling it off', async () => {
    vi.mocked(worldApi.postIdempotent).mockResolvedValue(online(state()));
    vi.mocked(worldApi.postHandled)
      .mockResolvedValueOnce(offline)
      .mockResolvedValueOnce(online(state(['candle_1'])));
    vi.mocked(worldApi.getOnce).mockResolvedValue(online(state(['candle_1'])));
    refreshJourney.mockResolvedValue({});
    mount();
    await openCorner();
    await userEvent.click(screen.getByTestId('candle-candle_1'));
    await screen.findByText(/Your candle change is saved. Try again/);
    expect(screen.getByTestId('candle-candle_1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('candle-candle_1')).toBeDisabled();
    await userEvent.click(screen.getByTestId('candle-retry'));
    await waitFor(() => expect(screen.getByTestId('candle-candle_1')).toBeEnabled());
    expect(vi.mocked(worldApi.postHandled).mock.calls.map((c) => c[0])).toEqual([
      '/church/candle',
      '/church/candle',
    ]);
    expect(readCandleOperation('test-candle')).toBeNull();
  });
  it('retains Add identity across remount and refuses to resend while reconciliation fails', async () => {
    vi.mocked(worldApi.postIdempotent).mockResolvedValue(online(state()));
    vi.mocked(worldApi.postHandled).mockResolvedValue(offline);
    vi.mocked(worldApi.getOnce).mockResolvedValue(offline);
    const first = mount();
    await openCorner();
    await userEvent.click(screen.getByTestId('candle-add'));
    await screen.findByText(/Save not yet confirmed/);
    const operation = readCandleOperation('test-candle');
    expect(operation?.body.clientRequestId).toBeTruthy();
    first.unmount();
    mount();
    await userEvent.click(await screen.findByTestId('church-candle-corner'));
    await userEvent.click(screen.getByTestId('candle-retry'));
    expect(worldApi.postHandled).toHaveBeenCalledTimes(1);
    const saved = state([], true);
    saved.candles.addRequests = { [operation!.body.clientRequestId!]: 'candle_a1' };
    vi.mocked(worldApi.getOnce).mockResolvedValue(online(saved));
    vi.mocked(worldApi.postHandled).mockResolvedValue(online(saved));
    refreshJourney.mockResolvedValue({});
    await userEvent.click(screen.getByTestId('candle-retry'));
    await waitFor(() => expect(worldApi.postHandled).toHaveBeenCalledTimes(2));
    expect(vi.mocked(worldApi.postHandled).mock.calls[1]![1]).toEqual(operation!.body);
  });
  it('keeps a confirmed change when a follow-up refresh rejects and only retries the read', async () => {
    vi.mocked(worldApi.postIdempotent).mockResolvedValue(online(state()));
    vi.mocked(worldApi.postHandled).mockResolvedValue(online(state(['candle_1'])));
    refreshJourney.mockRejectedValueOnce(Error('read failed')).mockResolvedValueOnce({});
    mount();
    await openCorner();
    await userEvent.click(screen.getByTestId('candle-candle_1'));
    await screen.findByText(/Your candle change is saved. Progress could not be refreshed/);
    expect(screen.getByTestId('candle-candle_1')).toBeEnabled();
    await userEvent.click(screen.getByTestId('candle-retry'));
    expect(worldApi.postHandled).toHaveBeenCalledTimes(1);
    expect(readCandleOperation('test-candle')).toBeNull();
  });
});

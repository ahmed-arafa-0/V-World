import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CottageExterior } from '../src/features/world/views/Exterior';
import { WorldEnvProvider, type WorldEnv } from '../src/features/world/WorldContext';
import { worldApi } from '../src/features/world/worldClient';
import { worldText } from '../src/features/world/worldText';
vi.mock('../src/features/world/worldClient', () => ({ worldApi: { get: vi.fn(), post: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function mountExterior() {
  const env = {
    userId: 'fixture',
    locale: 'en',
    icons: [],
    assets: [],
    journey: {
      currentBeat: { requiredInteractionId: 'first_message_delivery' },
      phase: 'original',
    },
    assetRef: () => null,
    t: (key: Parameters<typeof worldText>[0]) => worldText(key, 'en'),
    refreshJourney: vi.fn(),
    showRewards: vi.fn(),
    notify: vi.fn(),
    walkman: {},
  } as unknown as WorldEnv;
  const tree = (
    <WorldEnvProvider value={env}>
      <CottageExterior onEnter={vi.fn()} />
    </WorldEnvProvider>
  );
  return { ...render(tree), env, tree };
}
describe('delivery dialog dismissal', () => {
  for (const dialog of ['intro', 'delivering'])
    for (const close of ['button', 'escape'])
      it(`${close} dismisses ${dialog}, without requests or immediate reopen`, async () => {
        vi.mocked(worldApi.get).mockResolvedValue({
          status: 'offline',
          message: 'offline',
          retryable: true,
        });
        const mounted = mountExterior(),
          user = userEvent.setup();
        if (dialog === 'delivering') await user.click(screen.getByTestId('marcelino-deliver'));
        if (close === 'button') await user.click(screen.getByTestId(`marcelino-${dialog}-close`));
        else await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        mounted.rerender(mounted.tree);
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(worldApi.post).not.toHaveBeenCalled();
        expect(mounted.env.refreshJourney).not.toHaveBeenCalled();
        await user.click(screen.getByTestId('cottage-outside-mailbox'));
        expect(screen.getByTestId(`marcelino-${dialog}`)).toBeVisible();
        expect(worldApi.post).not.toHaveBeenCalled();
      });
  it('does not reopen a closed dialog when an already-authorized delivery finishes', async () => {
    vi.mocked(worldApi.get).mockResolvedValue({
      status: 'offline',
      message: 'offline',
      retryable: true,
    });
    let finish!: (value: Awaited<ReturnType<typeof worldApi.post>>) => void;
    vi.mocked(worldApi.post).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { env } = mountExterior(),
      user = userEvent.setup();
    await user.click(screen.getByTestId('marcelino-deliver'));
    await user.click(screen.getByTestId('marcelino-hand-over'));
    await user.click(screen.getByTestId('marcelino-delivering-close'));
    finish({
      status: 'online',
      data: { batches: [[]], state: { messages: [], unreadCount: 0, rewards: [] } },
    });
    await waitFor(() => expect(env.refreshJourney).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(worldApi.post).toHaveBeenCalledTimes(1);
  });
});
describe('first delivery failure feedback', () => {
  it('keeps the delivery actionable and incomplete when content is missing', async () => {
    vi.mocked(worldApi.get).mockResolvedValue({
      status: 'offline',
      message: 'offline',
      retryable: true,
    });
    vi.mocked(worldApi.post).mockResolvedValue({
      status: 'offline',
      message: 'missing',
      code: 'WORLD_CONTENT_UNAVAILABLE',
      retryable: false,
    });
    const refreshJourney = vi.fn(),
      showRewards = vi.fn();
    const env = {
      userId: 'fixture',
      locale: 'en',
      icons: [],
      assets: [],
      uiText: [],
      dialogue: [],
      journey: {
        currentBeat: { requiredInteractionId: 'first_message_delivery' },
        phase: 'original',
      },
      assetRef: () => null,
      t: (key: Parameters<typeof worldText>[0]) => worldText(key, 'en'),
      refreshJourney,
      showRewards,
      notify: vi.fn(),
      walkman: {},
    } as unknown as WorldEnv;
    render(
      <WorldEnvProvider value={env}>
        <CottageExterior onEnter={vi.fn()} />
      </WorldEnvProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('marcelino-deliver'));
    await user.click(screen.getByTestId('marcelino-hand-over'));
    expect(screen.getByRole('alert')).toHaveTextContent('Ask Ahmed to add its first-visit text');
    expect(screen.getByTestId('marcelino-hand-over')).toHaveTextContent('Try again');
    expect(refreshJourney).not.toHaveBeenCalled();
    expect(showRewards).not.toHaveBeenCalled();
    expect(screen.queryByTestId('marcelino-runs')).not.toBeInTheDocument();
  });
});

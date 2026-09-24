import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Ambience } from '../src/features/world/Ambience';
import { WorldEnvProvider, type WorldEnv } from '../src/features/world/WorldContext';

function env(over: Partial<WorldEnv['walkman']> = {}, assets: WorldEnv['assets'] = []): WorldEnv {
  return {
    assets,
    walkman: { playing: false, silenced: false, ...over },
    t: (key: string) => key,
  } as unknown as WorldEnv;
}
const audioAsset = {
  assetId: 'audio_beach_ambient',
  assetType: 'audio',
  mediaRef: '/api/media/audio_beach_ambient?v=1',
};

afterEach(() => vi.restoreAllMocks());

function stubMedia(play: () => Promise<void>) {
  const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
  const pauseSpy = vi
    .spyOn(HTMLMediaElement.prototype, 'pause')
    .mockImplementation(() => undefined);
  return { playSpy, pauseSpy };
}

describe('regional ambience', () => {
  it("plays the region's registered ambience, lowered (not muted) under Walkman music", async () => {
    const { playSpy } = stubMedia(() => Promise.resolve());
    const { rerender } = render(
      <WorldEnvProvider value={env({}, [audioAsset] as never)}>
        <Ambience assetId="audio_beach_ambient" paused={false} />
      </WorldEnvProvider>,
    );
    const audio = screen.getByTestId('ambience-audio') as HTMLAudioElement;
    await waitFor(() => expect(playSpy).toHaveBeenCalled());
    expect(audio.volume).toBeCloseTo(0.6);
    rerender(
      <WorldEnvProvider value={env({ playing: true }, [audioAsset] as never)}>
        <Ambience assetId="audio_beach_ambient" paused={false} />
      </WorldEnvProvider>,
    );
    await waitFor(() => expect(audio.volume).toBeCloseTo(0.25));
    expect(audio.volume).toBeGreaterThan(0);
  });

  it('is silent when the region has no registered audio, and deliberately silent in the Church (null)', () => {
    const { playSpy } = stubMedia(() => Promise.resolve());
    render(
      <WorldEnvProvider value={env({}, [audioAsset] as never)}>
        <Ambience assetId={null} paused={false} />
      </WorldEnvProvider>,
    );
    expect(playSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('enable-audio')).not.toBeInTheDocument();
  });

  it('pauses during a game (sound effects only) and shows one enable control only when the browser blocks autoplay', async () => {
    const { pauseSpy } = stubMedia(() => Promise.reject(new Error('blocked')));
    const { rerender } = render(
      <WorldEnvProvider value={env({}, [audioAsset] as never)}>
        <Ambience assetId="audio_beach_ambient" paused={false} />
      </WorldEnvProvider>,
    );
    expect(await screen.findByTestId('enable-audio')).toBeInTheDocument();
    rerender(
      <WorldEnvProvider value={env({}, [audioAsset] as never)}>
        <Ambience assetId="audio_beach_ambient" paused />
      </WorldEnvProvider>,
    );
    expect(pauseSpy).toHaveBeenCalled();
    expect(screen.queryByTestId('enable-audio')).not.toBeInTheDocument();
  });
});

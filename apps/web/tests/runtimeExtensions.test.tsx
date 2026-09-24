import { describe, expect, it, vi } from 'vitest';
import {
  WORLD_LOCATION_EXTENSION_IDS,
  WorldRuntimeExtensions,
  type LocationAudioPolicy,
} from '../src/features/scene-engine/runtimeExtensions';

describe('WorldRuntimeExtensions', () => {
  it('provides one stable extension slot for every Sheet location in the first journey', () => {
    expect(WORLD_LOCATION_EXTENSION_IDS).toEqual([
      'gate',
      'beach',
      'church',
      'cafe',
      'arcade',
      'cottage',
      'farm',
      'museum',
    ]);
  });

  it('can express the locked Church, Café and Arcade audio policies without implementing gameplay', () => {
    const registry = new WorldRuntimeExtensions();
    const policies: Record<string, LocationAudioPolicy> = {
      church: {
        backgroundMusic: 'stop',
        songStart: 'inherit',
        gameMusic: 'inherit',
        walkmanGain: 0,
        soundEffects: 'inherit',
      },
      cafe: {
        backgroundMusic: 'inherit',
        songStart: 'interaction-only',
        gameMusic: 'inherit',
        walkmanGain: 1,
        soundEffects: 'inherit',
      },
      arcade: {
        backgroundMusic: 'inherit',
        songStart: 'inherit',
        gameMusic: 'disabled',
        walkmanGain: 0.4,
        soundEffects: 'allowed',
      },
    };
    for (const [locationId, policy] of Object.entries(policies)) {
      registry.registerLocation(locationId, { resolveAudioPolicy: () => policy });
    }
    expect(
      registry.location('church')!.resolveAudioPolicy!({ locationId: 'church', sceneId: 's' }),
    ).toEqual(policies.church);
    expect(
      registry.location('cafe')!.resolveAudioPolicy!({ locationId: 'cafe', sceneId: 's' }),
    ).toEqual(policies.cafe);
    expect(
      registry.location('arcade')!.resolveAudioPolicy!({ locationId: 'arcade', sceneId: 's' }),
    ).toEqual(policies.arcade);
  });

  it('selects active event overlays in deterministic priority order', () => {
    const registry = new WorldRuntimeExtensions();
    const render = vi.fn(() => null);
    registry.registerEventOverlay({ id: 'late', priority: 20, isActive: () => true, render });
    registry.registerEventOverlay({ id: 'early', priority: 10, isActive: () => true, render });
    registry.registerEventOverlay({ id: 'inactive', priority: 1, isActive: () => false, render });
    expect(
      registry
        .activeOverlays({ locationId: 'beach', sceneId: 'beach_focus', nodeIndex: 0 })
        .map((overlay) => overlay.id),
    ).toEqual(['early', 'late']);
  });
});

import type { ReactNode } from 'react';

/** Stable Sheet location IDs. This is infrastructure metadata only; names, art, audio and gameplay remain Sheet-owned. */
export const WORLD_LOCATION_EXTENSION_IDS = [
  'gate',
  'beach',
  'church',
  'cafe',
  'arcade',
  'cottage',
  'farm',
  'museum',
] as const;

export type WorldLocationId = (typeof WORLD_LOCATION_EXTENSION_IDS)[number];

/**
 * Audio-policy vocabulary for later location adapters. It can express the
 * three already-locked seams without starting their gameplay:
 * Church (`backgroundMusic: stop`), Café (`songStart: interaction-only`),
 * and Arcade (`gameMusic: disabled`, reduced `walkmanGain`, SFX allowed).
 * Values are supplied by a later Sheet-backed adapter, not populated here.
 */
export interface LocationAudioPolicy {
  backgroundMusic: 'inherit' | 'stop';
  songStart: 'inherit' | 'interaction-only';
  gameMusic: 'inherit' | 'disabled';
  walkmanGain: number;
  soundEffects: 'inherit' | 'allowed' | 'suppressed';
}

export interface LocationEnterContext {
  locationId: string;
  sceneId: string;
}

export interface LocationExtension {
  resolveAudioPolicy?: (context: LocationEnterContext) => LocationAudioPolicy;
  onLocationEnter?: (context: LocationEnterContext) => void;
}

export interface EventOverlayContext extends LocationEnterContext {
  nodeIndex: number;
}

export interface EventOverlayExtension {
  id: string;
  priority: number;
  isActive: (context: EventOverlayContext) => boolean;
  render: (context: EventOverlayContext) => ReactNode;
}

/** Small registration surface only: it owns no location content or event rules. */
export class WorldRuntimeExtensions {
  private readonly locations = new Map<string, LocationExtension>();
  private readonly overlays = new Map<string, EventOverlayExtension>();

  registerLocation(locationId: string, extension: LocationExtension): void {
    this.locations.set(locationId, extension);
  }

  registerEventOverlay(extension: EventOverlayExtension): void {
    this.overlays.set(extension.id, extension);
  }

  location(locationId: string): LocationExtension | undefined {
    return this.locations.get(locationId);
  }

  activeOverlays(context: EventOverlayContext): EventOverlayExtension[] {
    return [...this.overlays.values()]
      .filter((overlay) => overlay.isActive(context))
      .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  }
}

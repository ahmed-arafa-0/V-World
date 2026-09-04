import type { SchemaHealthStatus } from './schema-health.js';

export interface BootstrapAppConfig {
  appName: string;
  defaultLanguage: string;
  normalStartLocation: string;
  authoritativeTimeZone: string;
}

export interface BootstrapLanguage {
  localeId: string;
  shortCode: string;
  englishName: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
  sortOrder: number;
}

export interface BootstrapLocation {
  locationId: string;
  displayNameTextId: string;
  subtitleTextId: string;
  mapOrder: number;
}

export interface BootstrapStoryBeat {
  beatId: string;
  sequence: number;
  locationId: string;
  beatType: string;
}

export interface BootstrapIcon {
  iconId: string;
  category: string;
  displayName: string;
  format: string;
}

/**
 * Never carries a raw Google Drive file ID. `mediaRef` is reserved for the
 * future application media URL/ID the M03 Drive media gateway will provide;
 * it stays null until that milestone exists.
 */
export interface BootstrapAssetDescriptor {
  assetId: string;
  assetType: string;
  locationId: string;
  sceneId: string;
  version: number;
  preloadPriority: number;
  enabled: boolean;
  mediaRef: string | null;
}

export interface BootstrapEvent {
  eventId: string;
  eventName: string;
  eventType: string;
}

export interface BootstrapResponse {
  ok: true;
  config: BootstrapAppConfig;
  languages: BootstrapLanguage[];
  locations: BootstrapLocation[];
  storyBeats: BootstrapStoryBeat[];
  icons: BootstrapIcon[];
  assets: BootstrapAssetDescriptor[];
  currentEvent: BootstrapEvent | null;
  sheetVersion: string;
  cacheGeneratedAt: string;
  schemaHealth: { status: SchemaHealthStatus; errorCount: number; warningCount: number };
  requestId: string;
}

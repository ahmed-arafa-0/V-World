import { randomUUID } from 'node:crypto';
import { parseReadmeSheet } from '@veoullas-world/sheet-schema';
import type { BootstrapResponse } from '@veoullas-world/contracts';
import type { ReadOptions, SheetGateway } from '../repositories/sheet-gateway.js';
import { computeSchemaHealth } from './schema-health.service.js';

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

export async function buildBootstrapResponse(
  gateway: SheetGateway,
  options?: ReadOptions,
): Promise<BootstrapResponse> {
  const [
    appConfig,
    languages,
    locations,
    storyBeats,
    icons,
    assets,
    eventsResult,
    readmeRaw,
    schemaHealth,
  ] = await Promise.all([
    gateway.readTab('01_APP_CONFIG', options),
    gateway.readEnabledRows('07_LANGUAGES', options),
    gateway.readEnabledRows('11_LOCATIONS', options),
    gateway.readEnabledRows('14_STORY_BEATS', options),
    gateway.readEnabledRows('09_ICONS', options),
    gateway.readEnabledRows('10_ASSETS', options),
    gateway.readTab('17_EVENTS', options),
    gateway.getRawTab('00_README', options),
    computeSchemaHealth(gateway, options),
  ]);

  const configValues = new Map<string, string>();
  for (const configRow of appConfig.rows) {
    if (configRow.values.enabled === true && configRow.primaryKeyValue) {
      configValues.set(configRow.primaryKeyValue, str(configRow.raw.value));
    }
  }

  const currentEventId = configValues.get('current_event_id');
  const currentEventRow = eventsResult.rows.find(
    (r) => r.primaryKeyValue === currentEventId && r.values.enabled === true,
  );

  const dashboard = parseReadmeSheet(readmeRaw);

  return {
    ok: true,
    config: {
      appName: configValues.get('app_name') ?? '',
      defaultLanguage: configValues.get('default_language') ?? 'en',
      normalStartLocation: configValues.get('normal_start_location') ?? '',
      authoritativeTimeZone: configValues.get('authoritative_time_zone') ?? 'UTC',
    },
    languages: languages.map((r) => ({
      localeId: r.primaryKeyValue!,
      shortCode: str(r.raw.short_code),
      englishName: str(r.raw.english_name),
      nativeName: str(r.raw.native_name),
      direction: r.raw.direction === 'rtl' ? 'rtl' : 'ltr',
      sortOrder: num(r.values.sort_order),
    })),
    locations: locations.map((r) => ({
      locationId: r.primaryKeyValue!,
      displayNameTextId: str(r.raw.display_name_text_id),
      subtitleTextId: str(r.raw.subtitle_text_id),
      mapOrder: num(r.values.map_order),
    })),
    storyBeats: storyBeats
      .map((r) => ({
        beatId: r.primaryKeyValue!,
        sequence: num(r.values.sequence),
        locationId: str(r.raw.location_id),
        beatType: str(r.raw.beat_type),
      }))
      .sort((a, b) => a.sequence - b.sequence),
    icons: icons.map((r) => ({
      iconId: r.primaryKeyValue!,
      category: str(r.raw.category),
      displayName: str(r.raw.display_name),
      format: str(r.raw.format),
    })),
    assets: assets.map((r) => ({
      assetId: r.primaryKeyValue!,
      assetType: str(r.raw.asset_type),
      locationId: str(r.raw.location_id),
      sceneId: str(r.raw.scene_id),
      version: num(r.values.version, 1),
      preloadPriority: num(r.values.preload_priority),
      enabled: true,
      mediaRef: null,
    })),
    currentEvent: currentEventRow
      ? {
          eventId: currentEventRow.primaryKeyValue!,
          eventName: str(currentEventRow.raw.event_name),
          eventType: str(currentEventRow.raw.event_type),
        }
      : null,
    sheetVersion: dashboard.workbookVersion || 'unknown',
    cacheGeneratedAt: new Date().toISOString(),
    schemaHealth: {
      status: schemaHealth.summary.status,
      errorCount: schemaHealth.summary.errorCount,
      warningCount: schemaHealth.summary.warningCount,
    },
    requestId: randomUUID(),
  };
}

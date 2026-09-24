import { WORLD_UI_TEXT } from '@veoullas-world/contracts';
import type { SheetGateway } from '../repositories/sheet-gateway.js';

const LOCALES = [
  { locale: 'en', suffix: 'en', direction: 'ltr' },
  { locale: 'ar-EG', suffix: 'ar', direction: 'rtl' },
  { locale: 'it', suffix: 'it', direction: 'ltr' },
  { locale: 'el', suffix: 'el', direction: 'ltr' },
  { locale: 'fr', suffix: 'fr', direction: 'ltr' },
] as const;

/** The two Phase 2 `entry_event_type` values (`05_ENTRY_LOGS.event_type`). */
export const PHASE2_ENTRY_EVENT_TYPES = ['first_journey_completed', 'song_request'] as const;

/** One 08_UI_TEXT row per label per locale (`world_<key>`), matching the existing Phase 1 row shape. */
export function buildWorldUiTextRows(): Record<string, string>[] {
  return Object.entries(WORLD_UI_TEXT).flatMap(([key, labels]) =>
    LOCALES.map((l, i) => ({
      ui_text_row_id: `ui_world_${key}_${l.suffix}`,
      text_id: `world_${key}`,
      screen_id: 'world',
      component_id: key,
      locale: l.locale,
      text: labels[i]!,
      direction: l.direction,
      aria_label: labels[i]!,
      enabled: 'TRUE',
      version: '1',
    })),
  );
}

/** Idempotent, append-only: hand-edited rows are never touched. */
export async function seedWorldUiText(
  gateway: SheetGateway,
): Promise<{ created: string[]; existing: string[] }> {
  return gateway.appendRowsIfAbsent('08_UI_TEXT', buildWorldUiTextRows());
}

/** Adds the Phase 2 log event types to the `entry_event_type` validation list (existence-checked). */
export async function seedPhase2EntryEventTypes(
  gateway: SheetGateway,
  startSortOrder = 12,
): Promise<{ created: string[]; unchanged: string[] }> {
  const created: string[] = [];
  const unchanged: string[] = [];
  for (const [i, value] of PHASE2_ENTRY_EVENT_TYPES.entries()) {
    const existing = await gateway.findByPrimaryKey(
      '39_VALIDATION_LISTS',
      `entry_event_type|${value}`,
      { bypass: true },
    );
    if (existing) {
      unchanged.push(value);
      continue;
    }
    await gateway.appendRow('39_VALIDATION_LISTS', {
      list_name: 'entry_event_type',
      value,
      sort_order: String(startSortOrder + i),
      enabled: 'TRUE',
      notes: 'Phase 2',
    });
    created.push(value);
  }
  return { created, unchanged };
}

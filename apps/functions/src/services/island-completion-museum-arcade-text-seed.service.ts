import type { SheetGateway } from '../repositories/sheet-gateway.js';

/**
 * Museum/Arcade text completion for the "ordinary island experience" pass.
 *
 * Two independent moves, both scoped ONLY to non-personal UI labels (never a
 * memory, a photo caption, or story dialogue):
 *
 * 1. Activates `08_UI_TEXT` rows that a prior pass already drafted in all five
 *    languages but deliberately left `enabled: 'FALSE'` pending review (see
 *    `content-completion-v1-ui-text-seed.service.ts`'s own comment). The
 *    wording was read and is generic/appropriate (exhibit and game titles —
 *    including Memory/Catch/Puzzle's, discovered still disabled during this
 *    pass' live verification, not just Maze/Trivia's — and the Museum's own
 *    display name/subtitle) — reviewed here as part of completing the Museum
 *    and Arcade, so a simple Sheet edit is all Ahmed needs to change if he
 *    wants different wording.
 * 2. Adds the Museum's three wing display names (`museum_archive_wing`,
 *    `museum_stories_wing`, `museum_memories_wing`), which never existed at
 *    all — `34_MUSEUM_EXHIBITS` has no wing-level display-name column, so
 *    `MuseumView.tsx`'s wing panel falls back to `museum_<wingId>` in
 *    `08_UI_TEXT` (confirmed in `MuseumView.tsx`'s `label([...])` call). The
 *    secret wing intentionally gets no name (its display stays empty by
 *    design — see `docs/Veoullas_World_Living_Bible.md` §18G).
 */

const ACTIVATE_TEXT_IDS = [
  'location_museum',
  'subtitle_museum',
  'exhibit_old_site_name',
  'exhibit_comic_name',
  'exhibit_bday_name',
  'game_memory_name',
  'game_catch_name',
  'game_puzzle_name',
  'game_maze_name',
  'game_trivia_name',
] as const;

const LOCALE_SUFFIX: Record<string, string> = {
  en: 'en',
  'ar-EG': 'ar',
  it: 'it',
  el: 'el',
  fr: 'fr',
};

export interface ActivateOutcome {
  updated: string[];
  missing: string[];
}

/** Flips `enabled` to `TRUE` on the already-drafted rows listed above. Idempotent (a re-run is a no-op). */
export async function activateMuseumArcadeText(gateway: SheetGateway): Promise<ActivateOutcome> {
  const table = await gateway.readTab('08_UI_TEXT', { bypass: true });
  const updated: string[] = [];
  const missing: string[] = [];
  for (const textId of ACTIVATE_TEXT_IDS) {
    for (const locale of Object.keys(LOCALE_SUFFIX)) {
      const row = table.rows.find((r) => r.raw.text_id === textId && r.raw.locale === locale);
      if (!row) {
        missing.push(`${textId}:${locale}`);
        continue;
      }
      if (row.values.enabled === true) continue; // already active
      await gateway.updateByPrimaryKey('08_UI_TEXT', row.primaryKeyValue ?? '', {
        enabled: 'TRUE',
      });
      updated.push(row.primaryKeyValue ?? '');
    }
  }
  return { updated, missing };
}

interface WingText {
  textId: string;
  en: string;
  arEG: string;
  it: string;
  el: string;
  fr: string;
}

// Reuses the exact vocabulary already approved-style in `subtitle_museum`
// ("A home for stories and memories" / "مكان للحكايات والذكريات" / ...),
// not novel wording.
const WING_TEXT: WingText[] = [
  {
    textId: 'museum_archive_wing',
    en: 'The Archive',
    arEG: 'الأرشيف',
    it: "L'Archivio",
    el: 'Το Αρχείο',
    fr: 'Les Archives',
  },
  {
    textId: 'museum_stories_wing',
    en: 'Stories',
    arEG: 'الحكايات',
    it: 'Storie',
    el: 'Ιστορίες',
    fr: 'Histoires',
  },
  {
    textId: 'museum_memories_wing',
    en: 'Memories',
    arEG: 'الذكريات',
    it: 'Ricordi',
    el: 'Αναμνήσεις',
    fr: 'Souvenirs',
  },
];

function wingRows(): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const w of WING_TEXT) {
    const byLocale: Record<string, string> = {
      en: w.en,
      'ar-EG': w.arEG,
      it: w.it,
      el: w.el,
      fr: w.fr,
    };
    for (const [locale, suffix] of Object.entries(LOCALE_SUFFIX)) {
      const text = byLocale[locale]!;
      out.push({
        ui_text_row_id: `ui_${w.textId}_${suffix}`,
        text_id: w.textId,
        screen_id: 'world',
        component_id: 'wing_name',
        locale,
        text,
        direction: locale === 'ar-EG' ? 'rtl' : 'ltr',
        aria_label: text,
        enabled: 'TRUE',
        version: '1',
      });
    }
  }
  return out;
}

/** Appends the three wing-name rows (5 locales each) if not already present. Idempotent. */
export async function seedMuseumWingText(gateway: SheetGateway) {
  return gateway.appendRowsIfAbsent('08_UI_TEXT', wingRows());
}

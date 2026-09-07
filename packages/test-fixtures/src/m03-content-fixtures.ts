import { GOOD_WORKBOOK, type RawWorkbook } from './good-workbook.js';
import { headerFor, row } from './row-builder.js';

/**
 * Network-free fixture data exercising every M03-A content-runtime
 * validation rule: five-locale coverage, duplicate localized rows, a
 * missing-English-fallback group, invalid icon/asset/dialogue/voice-over
 * references, and disabled rows that must never reach the response.
 * `GOOD_WORKBOOK`'s own 08_UI_TEXT/15_DIALOGUE/16_VOICEOVER rows are thin
 * (English/Arabic only, one dialogue/voiceover line) — this fixture
 * replaces those three tabs' rows (and enriches 09_ICONS/10_ASSETS)
 * specifically to prove M03-A logic, layered on top of GOOD_WORKBOOK's
 * otherwise-unchanged 42 tabs.
 */

const M03_TEXT_ID_COMPLETE = 'content_lab_title';
const M03_TEXT_ID_INCOMPLETE = 'content_lab_incomplete';
const M03_TEXT_ID_DUPLICATE = 'content_lab_duplicate';
const M03_TEXT_ID_DISABLED = 'content_lab_disabled';

export const M03_UI_TEXT_ROWS: string[][] = [
  headerFor('08_UI_TEXT'),
  // A fully translated group across all five locales.
  ...(
    [
      ['en', 'Content Runtime Lab', 'ltr', 'Content Runtime Lab heading'],
      ['ar-EG', 'معمل تشغيل المحتوى', 'rtl', 'عنوان معمل تشغيل المحتوى'],
      ['it', 'Laboratorio Contenuti', 'ltr', 'Titolo laboratorio contenuti'],
      ['el', 'Εργαστήριο Περιεχομένου', 'ltr', 'Τίτλος εργαστηρίου περιεχομένου'],
      ['fr', 'Labo de Contenu', 'ltr', 'Titre du labo de contenu'],
    ] as const
  ).map(([locale, text, dir, aria]) =>
    row('08_UI_TEXT', {
      ui_text_row_id: `uit_${M03_TEXT_ID_COMPLETE}_${locale}`,
      text_id: M03_TEXT_ID_COMPLETE,
      screen_id: 'content_lab',
      component_id: 'heading',
      locale,
      text,
      direction: dir,
      aria_label: aria,
      enabled: 'TRUE',
      version: '1',
    }),
  ),
  // Present only in Arabic — no English row, so consumers must fall back safely.
  row('08_UI_TEXT', {
    ui_text_row_id: `uit_${M03_TEXT_ID_INCOMPLETE}_ar`,
    text_id: M03_TEXT_ID_INCOMPLETE,
    screen_id: 'content_lab',
    component_id: 'note',
    locale: 'ar-EG',
    text: 'ملاحظة بالعربية فقط',
    direction: 'rtl',
    aria_label: 'ملاحظة',
    enabled: 'TRUE',
    version: '1',
  }),
  // Two different rows for the same (text_id, locale) pair — a real authoring mistake.
  row('08_UI_TEXT', {
    ui_text_row_id: `uit_${M03_TEXT_ID_DUPLICATE}_en_a`,
    text_id: M03_TEXT_ID_DUPLICATE,
    screen_id: 'content_lab',
    component_id: 'duplicate_a',
    locale: 'en',
    text: 'First duplicate row',
    direction: 'ltr',
    aria_label: 'Duplicate A',
    enabled: 'TRUE',
    version: '1',
  }),
  row('08_UI_TEXT', {
    ui_text_row_id: `uit_${M03_TEXT_ID_DUPLICATE}_en_b`,
    text_id: M03_TEXT_ID_DUPLICATE,
    screen_id: 'content_lab',
    component_id: 'duplicate_b',
    locale: 'en',
    text: 'Second duplicate row',
    direction: 'ltr',
    aria_label: 'Duplicate B',
    enabled: 'TRUE',
    version: '1',
  }),
  // Disabled — must never appear in the content-runtime response.
  row('08_UI_TEXT', {
    ui_text_row_id: `uit_${M03_TEXT_ID_DISABLED}_en`,
    text_id: M03_TEXT_ID_DISABLED,
    screen_id: 'content_lab',
    component_id: 'disabled',
    locale: 'en',
    text: 'Should never be visible',
    direction: 'ltr',
    aria_label: 'Disabled',
    enabled: 'FALSE',
    version: '1',
  }),
];

export const M03_ICONS_ROWS: string[][] = [
  headerFor('09_ICONS'),
  row('09_ICONS', {
    icon_id: 'icon_map',
    category: 'ui',
    display_name: 'Map',
    asset_id: 'asset_icon_map',
    format: 'svg',
    rtl_mirror: 'FALSE',
    alt_text_id: 'ui_map',
    width_px: '48',
    height_px: '48',
    enabled: 'TRUE',
    version: '1',
  }),
  // The Back icon: the one ordinary case that IS configured to mirror in RTL.
  row('09_ICONS', {
    icon_id: 'icon_back',
    category: 'ui',
    display_name: 'Back',
    asset_id: 'asset_icon_back',
    format: 'svg',
    rtl_mirror: 'TRUE',
    alt_text_id: 'ui_back',
    width_px: '32',
    height_px: '32',
    enabled: 'TRUE',
    version: '1',
  }),
  // References an asset ID that doesn't exist — proves invalid-reference detection.
  row('09_ICONS', {
    icon_id: 'icon_broken_reference',
    category: 'ui',
    display_name: 'Broken Reference',
    asset_id: 'asset_does_not_exist',
    format: 'svg',
    rtl_mirror: 'FALSE',
    alt_text_id: 'ui_broken',
    width_px: '32',
    height_px: '32',
    enabled: 'TRUE',
    version: '1',
  }),
  // Disabled — must never appear in the content-runtime response.
  row('09_ICONS', {
    icon_id: 'icon_disabled',
    category: 'ui',
    display_name: 'Disabled Icon',
    asset_id: 'asset_icon_map',
    format: 'svg',
    rtl_mirror: 'FALSE',
    alt_text_id: 'ui_disabled',
    width_px: '32',
    height_px: '32',
    enabled: 'FALSE',
    version: '1',
  }),
];

export const M03_ASSETS_ROWS: string[][] = [
  headerFor('10_ASSETS'),
  row('10_ASSETS', {
    asset_id: 'asset_icon_map',
    asset_type: 'image',
    drive_file_id: 'fake_drive_id_icon_map',
    preload_priority: '1',
    loop: 'FALSE',
    enabled: 'TRUE',
    version: '2',
    notes: 'fixture',
  }),
  row('10_ASSETS', {
    asset_id: 'asset_icon_back',
    asset_type: 'image',
    drive_file_id: 'fake_drive_id_icon_back',
    mobile_drive_file_id: 'fake_drive_id_icon_back_mobile',
    poster_drive_file_id: '',
    preload_priority: '1',
    loop: 'FALSE',
    enabled: 'TRUE',
    version: '1',
    notes: 'fixture',
  }),
  row('10_ASSETS', {
    asset_id: 'asset_vo_boot_en',
    asset_type: 'audio',
    drive_file_id: 'fake_drive_id_vo_boot_en',
    preload_priority: '2',
    loop: 'FALSE',
    enabled: 'TRUE',
    version: '1',
    notes: 'fixture',
  }),
  row('10_ASSETS', {
    asset_id: 'asset_vo_boot_ar',
    asset_type: 'audio',
    drive_file_id: 'fake_drive_id_vo_boot_ar',
    preload_priority: '2',
    loop: 'FALSE',
    enabled: 'TRUE',
    version: '1',
    notes: 'fixture',
  }),
  // Disabled — a reference to this asset must resolve as invalid, never leaked.
  row('10_ASSETS', {
    asset_id: 'asset_disabled_target',
    asset_type: 'image',
    drive_file_id: 'fake_drive_id_disabled_target',
    preload_priority: '3',
    loop: 'FALSE',
    enabled: 'FALSE',
    version: '1',
    notes: 'fixture — deliberately disabled',
  }),
];

export const M03_DIALOGUE_ROWS: string[][] = [
  headerFor('15_DIALOGUE'),
  ...(
    [
      ['en', 'Hello, Veoulla.', 'ltr', 'vo_boot_en'],
      ['ar-EG', 'أهلاً يا فيولا.', 'rtl', 'vo_boot_ar'],
      ['it', 'Ciao, Veoulla.', 'ltr', ''],
      ['el', 'Γεια σου, Veoulla.', 'ltr', ''],
      ['fr', 'Bonjour, Veoulla.', 'ltr', ''],
    ] as const
  ).map(([locale, text, dir, voiceoverId]) =>
    row('15_DIALOGUE', {
      dialogue_row_id: `dlg_boot_${locale}`,
      dialogue_id: 'dlg_boot',
      group_id: 'grp_boot',
      sequence: '1',
      speaker_id: 'char_var',
      locale,
      text,
      direction: dir,
      emotion: 'warm',
      display_mode: 'speech_bubble',
      voiceover_id: voiceoverId,
      requires_response: 'FALSE',
      enabled: 'TRUE',
    }),
  ),
  // References a voiceover_id that doesn't exist — proves invalid-reference detection.
  row('15_DIALOGUE', {
    dialogue_row_id: 'dlg_broken_voiceover_en',
    dialogue_id: 'dlg_broken_voiceover',
    group_id: 'grp_broken',
    sequence: '1',
    speaker_id: 'char_var',
    locale: 'en',
    text: 'This line points at a missing voiceover.',
    direction: 'ltr',
    emotion: 'neutral',
    display_mode: 'speech_bubble',
    voiceover_id: 'vo_does_not_exist',
    requires_response: 'FALSE',
    enabled: 'TRUE',
  }),
  // Disabled — must never appear in the content-runtime response.
  row('15_DIALOGUE', {
    dialogue_row_id: 'dlg_disabled_en',
    dialogue_id: 'dlg_disabled',
    group_id: 'grp_disabled',
    sequence: '1',
    speaker_id: 'char_var',
    locale: 'en',
    text: 'Should never be visible',
    direction: 'ltr',
    emotion: 'neutral',
    display_mode: 'speech_bubble',
    voiceover_id: '',
    requires_response: 'FALSE',
    enabled: 'FALSE',
  }),
];

export const M03_VOICEOVER_ROWS: string[][] = [
  headerFor('16_VOICEOVER'),
  row('16_VOICEOVER', {
    voiceover_id: 'vo_boot_en',
    content_type: 'dialogue',
    content_id: 'dlg_boot',
    locale: 'en',
    audio_asset_id: 'asset_vo_boot_en',
    caption_text: 'Hello, Veoulla.',
    direction: 'ltr',
    voice_name: 'var_voice',
    duration_ms: '2000',
    caption_start_ms: '0',
    caption_end_ms: '2000',
    enabled: 'TRUE',
    notes: 'fixture',
  }),
  row('16_VOICEOVER', {
    voiceover_id: 'vo_boot_ar',
    content_type: 'dialogue',
    content_id: 'dlg_boot',
    locale: 'ar-EG',
    audio_asset_id: 'asset_vo_boot_ar',
    caption_text: 'أهلاً يا فيولا.',
    direction: 'rtl',
    voice_name: 'var_voice',
    duration_ms: '2200',
    caption_start_ms: '0',
    caption_end_ms: '2200',
    enabled: 'TRUE',
    notes: 'fixture',
  }),
  // References an asset ID that doesn't exist — proves invalid-reference detection.
  row('16_VOICEOVER', {
    voiceover_id: 'vo_broken_asset',
    content_type: 'dialogue',
    content_id: 'dlg_broken_asset',
    locale: 'en',
    audio_asset_id: 'asset_does_not_exist',
    caption_text: 'Broken asset reference.',
    direction: 'ltr',
    voice_name: 'var_voice',
    duration_ms: '1000',
    caption_start_ms: '0',
    caption_end_ms: '1000',
    enabled: 'TRUE',
    notes: 'fixture',
  }),
  // Disabled — must never appear in the content-runtime response.
  row('16_VOICEOVER', {
    voiceover_id: 'vo_disabled',
    content_type: 'dialogue',
    content_id: 'dlg_disabled_content',
    locale: 'en',
    audio_asset_id: 'asset_vo_boot_en',
    caption_text: 'Should never be visible',
    direction: 'ltr',
    voice_name: 'var_voice',
    duration_ms: '1000',
    caption_start_ms: '0',
    caption_end_ms: '1000',
    enabled: 'FALSE',
    notes: 'fixture — deliberately disabled',
  }),
];

/**
 * GOOD_WORKBOOK with 08_UI_TEXT/09_ICONS/10_ASSETS/15_DIALOGUE/16_VOICEOVER
 * replaced by the richer M03 rows above. Every other tab (including
 * 07_LANGUAGES, already fully five-locale in GOOD_WORKBOOK) is untouched.
 */
export function buildM03Workbook(): RawWorkbook {
  const workbook = structuredClone(GOOD_WORKBOOK);
  workbook['08_UI_TEXT'] = structuredClone(M03_UI_TEXT_ROWS);
  workbook['09_ICONS'] = structuredClone(M03_ICONS_ROWS);
  workbook['10_ASSETS'] = structuredClone(M03_ASSETS_ROWS);
  workbook['15_DIALOGUE'] = structuredClone(M03_DIALOGUE_ROWS);
  workbook['16_VOICEOVER'] = structuredClone(M03_VOICEOVER_ROWS);
  return workbook;
}

export const M03_TEXT_IDS = {
  complete: M03_TEXT_ID_COMPLETE,
  incomplete: M03_TEXT_ID_INCOMPLETE,
  duplicate: M03_TEXT_ID_DUPLICATE,
  disabled: M03_TEXT_ID_DISABLED,
} as const;
